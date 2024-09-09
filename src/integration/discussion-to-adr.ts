import { join } from "node:path";
import type { AddDiscussionCommentResponse } from "../graphql/mutations/addDiscussionComment";
import addDiscussionComment from "../graphql/mutations/addDiscussionComment";
import addLabel, { type AddLabelResponse } from "../graphql/mutations/addLabel";
import type { CloseDiscussionResponse } from "../graphql/mutations/closeDiscussion";
import closeDiscussion from "../graphql/mutations/closeDiscussion";
import type { RemoveLabelResponse } from "../graphql/mutations/removeLabel";
import removeLabel from "../graphql/mutations/removeLabel";
import type { ReopenDiscussionResponse } from "../graphql/mutations/reopenDiscussion";
import reopenDiscussion from "../graphql/mutations/reopenDiscussion";
import type { Label } from "../graphql/shared";
import { extractStatus, generateAuthor, generateComment } from "../helper";
import type { Commit, Context, File, GetContentResponse, Octokit } from "../shared";
import { CREATE_COMMIT_MESSAGE, UPDATE_COMMIT_MESSAGE } from "../shared";

export default class DiscussionToADR {
  #octokit: Octokit;
  #context: Context;
  #adrDir: string;
  #statusRegex: RegExp;
  #closeStatuses: string[];
  #branch: string;
  #statusLabel: Label | null;

  constructor(
    octokit: Octokit,
    context: Context,
    adrDir: string,
    statusRegex: RegExp,
    closeStatuses: string[],
    branch: string,
    statusLabel: Label | null,
  ) {
    this.#octokit = octokit;
    this.#context = context;
    this.#adrDir = adrDir;
    this.#statusRegex = statusRegex;
    this.#closeStatuses = closeStatuses;
    this.#branch = branch;
    this.#statusLabel = statusLabel;
  }

  public async sync(): Promise<void> {
    const file = await this.#fetchFile();
    if (!file) {
      const commit = await this.#createFile();
      await this.#addComment(commit);
    } else if (file.content !== this.#context.payload.discussion.body) {
      await this.#updateFile(file);
    }

    const previousContent = this.#context.payload.changes?.body?.from;
    const previousStatus = previousContent && extractStatus(previousContent, this.#statusRegex);
    const currentStatus = this.#statusLabel?.name ?? null;

    if (previousStatus !== currentStatus) {
      const previousLabel = this.#context.payload.discussion.labels.find((label: Label) => label.name === previousStatus);
      if (previousLabel) {
        await this.#removeLabel(previousLabel.node_id);
      }

      if (this.#statusLabel) {
        await this.#addLabel(this.#statusLabel.id);
      }

      const shouldHaveBeenClosed = Boolean(previousStatus && this.#closeStatuses.includes(previousStatus));
      const shouldBeClosed = Boolean(currentStatus && this.#closeStatuses.includes(currentStatus));
      const closed = this.#context.payload.discussion.state === "closed";
      if (!shouldHaveBeenClosed && shouldBeClosed && !closed) {
        await this.#closeDiscussion();
      } else if (shouldHaveBeenClosed && !shouldBeClosed && closed) {
        await this.#reopenDiscussion();
      }
    }
  }

  async #fetchFile(): Promise<File | null> {
    let response: Awaited<GetContentResponse>;
    try {
      response = await this.#octokit.rest.repos.getContent({
        owner: this.#context.repo.owner,
        repo: this.#context.repo.repo,
        path: join(this.#adrDir, this.#context.payload.discussion.title),
        ref: this.#branch,
      });
    } catch (error) {
      // HttpError is thrown when the content does not exist
      if (error instanceof Error && error.name === "HttpError") return null;
      throw error;
    }

    if (Array.isArray(response.data) || response.data.type !== "file" || !response.data.content) {
      throw new Error(`Could not retrieve content for ${this.#context.payload.discussion.title}`);
    }

    return { content: atob(response.data.content), sha: response.data.sha };
  }

  async #createFile(): Promise<Commit> {
    const response = await this.#octokit.rest.repos.createOrUpdateFileContents({
      owner: this.#context.repo.owner,
      repo: this.#context.repo.repo,
      branch: this.#branch,
      path: join(this.#adrDir, this.#context.payload.discussion.title),
      content: btoa(this.#context.payload.discussion.body),
      message: CREATE_COMMIT_MESSAGE,
    });

    return {
      url: response.data.commit.html_url ?? null,
      author: generateAuthor(this.#context.payload.sender, response.data.commit.author ?? null),
    };
  }

  async #addComment(commit: Commit): Promise<void> {
    const body = generateComment(commit);
    if (!body) return;

    await this.#octokit.graphql<AddDiscussionCommentResponse>(addDiscussionComment, {
      discussionId: this.#context.payload.discussion.node_id,
      body,
    });
  }

  async #updateFile(adr: File): Promise<void> {
    await this.#octokit.rest.repos.createOrUpdateFileContents({
      owner: this.#context.repo.owner,
      repo: this.#context.repo.repo,
      branch: this.#branch,
      path: join(this.#adrDir, this.#context.payload.discussion.title),
      content: btoa(this.#context.payload.discussion.body),
      message: UPDATE_COMMIT_MESSAGE,
      sha: adr.sha,
    });
  }

  async #removeLabel(labelId: string): Promise<void> {
    await this.#octokit.graphql<RemoveLabelResponse>(removeLabel, {
      discussionId: this.#context.payload.discussion.node_id,
      labelId,
    });
  }

  async #addLabel(labelId: string): Promise<void> {
    await this.#octokit.graphql<AddLabelResponse>(addLabel, {
      discussionId: this.#context.payload.discussion.node_id,
      labelId,
    });
  }

  async #closeDiscussion(): Promise<void> {
    await this.#octokit.graphql<CloseDiscussionResponse>(closeDiscussion, {
      discussionId: this.#context.payload.discussion.node_id,
    });
  }

  async #reopenDiscussion(): Promise<void> {
    await this.#octokit.graphql<ReopenDiscussionResponse>(reopenDiscussion, {
      discussionId: this.#context.payload.discussion.node_id,
    });
  }
}
