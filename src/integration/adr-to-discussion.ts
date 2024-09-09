import { join } from "node:path";
import addDiscussionComment, { type AddDiscussionCommentResponse } from "../graphql/mutations/addDiscussionComment";
import addLabel, { type AddLabelResponse } from "../graphql/mutations/addLabel";
import closeDiscussion, { type CloseDiscussionResponse } from "../graphql/mutations/closeDiscussion";
import createDiscussion, { type CreateDiscussionResponse } from "../graphql/mutations/createDiscussion";
import removeLabel, { type RemoveLabelResponse } from "../graphql/mutations/removeLabel";
import reopenDiscussion, { type ReopenDiscussionResponse } from "../graphql/mutations/reopenDiscussion";
import updateDiscussion, { type UpdateDiscussionResponse } from "../graphql/mutations/updateDiscussion";
import searchDiscussions, { type SearchDiscussionsResponse } from "../graphql/queries/searchDiscussions";
import type { Label } from "../graphql/shared";
import { extractStatus, generateAuthor, generateComment, replaceLinks } from "../helper";
import type { Commit, Context, Discussion, GetContentResponse, Octokit } from "../shared";
import { GITHUB_BASE_URL } from "../shared";

export default class AdrToDiscussion {
  #octokit: Octokit;
  #context: Context;
  #repositoryId: string;
  #filePath: string;
  #categoryId: string;
  #statusRegex: RegExp;
  #closeStatuses: string[];
  #title: string;
  #content: string;
  #statusLabel: Label | null;
  #id!: string;
  #closed: boolean;
  #labels: Label[];

  constructor(
    octokit: Octokit,
    context: Context,
    repositoryId: string,
    adrDir: string,
    categoryId: string,
    statusRegex: RegExp,
    closeStatuses: string[],
    title: string,
    content: string,
    statusLabel: Label | null,
  ) {
    this.#octokit = octokit;
    this.#context = context;
    this.#repositoryId = repositoryId;
    this.#filePath = join(adrDir, title);
    this.#categoryId = categoryId;
    this.#statusRegex = statusRegex;
    this.#closeStatuses = closeStatuses;
    this.#title = title;
    const branch = encodeURIComponent(context.ref.replace("refs/heads/", ""));
    const path = join(`${this.#context.repo.owner}/`, `${this.#context.repo.repo}/`, "blob/", `${branch}/`);
    const baseUrl = new URL(path, GITHUB_BASE_URL).toString();
    this.#content = replaceLinks(content, baseUrl, adrDir);
    this.#statusLabel = statusLabel;
    this.#closed = false;
    this.#labels = [];
  }

  public async sync(): Promise<void> {
    const discussion = await this.#fetchDiscussion();

    if (discussion) {
      this.#id = discussion.id;
      this.#closed = discussion.closed;
      this.#labels = discussion.labels;

      if (this.#content !== discussion.body) {
        await this.#updateDiscussion();
      }
    } else {
      this.#id = await this.#createDiscussion();

      const commit = await this.#fetchCommit();
      if (commit) {
        await this.#addComment(commit);
      }
    }

    const previousContent = discussion && (await this.#fetchPreviousContent());
    const previousStatus = previousContent && extractStatus(previousContent, this.#statusRegex);
    const currentStatus = this.#statusLabel?.name ?? null;

    if (previousStatus !== currentStatus) {
      const previousLabel = this.#labels.find((label) => label.name === previousStatus);
      if (previousLabel) {
        await this.#removeLabel(previousLabel.id);
      }

      if (this.#statusLabel) {
        await this.#addLabel(this.#statusLabel.id);
      }

      const shouldHaveBeenClosed = Boolean(previousStatus && this.#closeStatuses.includes(previousStatus));
      const shouldBeClosed = Boolean(currentStatus && this.#closeStatuses.includes(currentStatus));
      if (!shouldHaveBeenClosed && shouldBeClosed && !this.#closed) {
        await this.#closeDiscussion();
      } else if (shouldHaveBeenClosed && !shouldBeClosed && this.#closed) {
        await this.#reopenDiscussion();
      }
    }
  }

  async #fetchPreviousContent(): Promise<string | null> {
    let response: Awaited<GetContentResponse>;
    try {
      response = await this.#octokit.rest.repos.getContent({
        owner: this.#context.repo.owner,
        repo: this.#context.repo.repo,
        path: this.#filePath,
        ref: this.#context.payload.before,
      });
    } catch (error) {
      // HttpError is thrown when the content does not exist in the commit
      if (error instanceof Error && error.name === "HttpError") return null;
      throw error;
    }

    if (Array.isArray(response.data) || response.data.type !== "file" || !response.data.content) {
      throw new Error(`Could not retrieve content at ${this.#filePath} in commit ${this.#context.payload.before}`);
    }

    return atob(response.data.content);
  }

  async #fetchDiscussion(labelsEndCursor: string | null = null): Promise<Discussion | null> {
    const searchQuery = `repo:${this.#context.repo.owner}/${this.#context.repo.repo} in:title ${this.#title}`;
    const response = await this.#octokit.graphql<SearchDiscussionsResponse>(searchDiscussions, {
      searchQuery,
      labelsEndCursor,
    });

    const [discussion] = response.search.nodes;
    if (!discussion) return null;

    let labels = discussion.labels.nodes;
    if (discussion.labels.pageInfo.hasNextPage) {
      const nextDiscussion = await this.#fetchDiscussion(discussion.labels.pageInfo.endCursor);
      if (!nextDiscussion) throw new Error("Could not find discussion");

      labels = labels.concat(nextDiscussion.labels);
    }

    return { id: discussion.id, body: discussion.body, closed: discussion.closed, labels };
  }

  async #updateDiscussion(): Promise<void> {
    await this.#octokit.graphql<UpdateDiscussionResponse>(updateDiscussion, { discussionId: this.#id, body: this.#content });
  }

  async #createDiscussion(): Promise<string> {
    const response = await this.#octokit.graphql<CreateDiscussionResponse>(createDiscussion, {
      repositoryId: this.#repositoryId,
      title: this.#title,
      body: this.#content,
      categoryId: this.#categoryId,
    });

    return response.createDiscussion.discussion.id;
  }

  async #addComment(commit: Commit): Promise<void> {
    const body = generateComment(commit);
    if (!body) return;

    await this.#octokit.graphql<AddDiscussionCommentResponse>(addDiscussionComment, { discussionId: this.#id, body });
  }

  async #fetchCommit(): Promise<Commit | null> {
    const { data } = await this.#octokit.rest.repos.listCommits({
      owner: this.#context.repo.owner,
      repo: this.#context.repo.repo,
      path: this.#filePath,
      per_page: 1,
    });

    const [commit] = data;
    if (!commit) return null;

    return { url: commit.html_url, author: generateAuthor(commit.author, commit.commit.author) };
  }

  async #removeLabel(labelId: string): Promise<void> {
    await this.#octokit.graphql<RemoveLabelResponse>(removeLabel, { discussionId: this.#id, labelId });
  }

  async #addLabel(labelId: string): Promise<void> {
    await this.#octokit.graphql<AddLabelResponse>(addLabel, { discussionId: this.#id, labelId });
  }

  async #closeDiscussion(): Promise<void> {
    await this.#octokit.graphql<CloseDiscussionResponse>(closeDiscussion, { discussionId: this.#id });
  }

  async #reopenDiscussion(): Promise<void> {
    await this.#octokit.graphql<ReopenDiscussionResponse>(reopenDiscussion, { discussionId: this.#id });
  }
}
