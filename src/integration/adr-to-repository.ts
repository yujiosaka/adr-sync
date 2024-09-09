import createLabel, { type CreateLabelResponse } from "../graphql/mutations/createLabel";
import repositoryCategories, { type RepositoryCategoriesResponse } from "../graphql/queries/repositoryCategories";
import repositoryCategoriesAndLabels, {
  type RepositoryCategoriesAndLabelsResponse,
} from "../graphql/queries/repositoryCategoriesAndLabels";
import repositoryLabels, { type RepositoryLabelsResponse } from "../graphql/queries/repositoryLabels";
import type { Category, Label } from "../graphql/shared";
import { extractStatus, randomColor } from "../helper";
import type { Context, GetContentResponse, Octokit, Repository } from "../shared";
import { LABEL_DESCRIPTION } from "../shared";
import AdrToDiscussion from "./adr-to-discussion";

export default class AdrToRepository {
  #octokit: Octokit;
  #context: Context;
  #adrDir: string;
  #category: string;
  #statusRegex: RegExp;
  #closeStatuses: string[];
  #id!: string;
  #labels: Label[];

  constructor(
    octokit: Octokit,
    context: Context,
    adrDir: string,
    category: string,
    statusRegex: RegExp,
    closeStatuses: string[],
  ) {
    this.#octokit = octokit;
    this.#context = context;
    this.#adrDir = adrDir;
    this.#category = category;
    this.#statusRegex = statusRegex;
    this.#closeStatuses = closeStatuses;
    this.#labels = [];
  }

  public async sync(): Promise<void> {
    const repository = await this.#fetchRepository();

    this.#id = repository.id;
    this.#labels = repository.labels;

    const category = repository.categories.find((category) => category.name === this.#category);
    if (!category) throw new Error(`Could not find discussion category ${this.#category}`);

    const titles = await this.#fetchTitles();
    for (const title of titles) {
      const content = await this.#fetchContent(title);
      const statusLabel = await this.#ensureStatusLabel(content);
      const adrToDiscussion = new AdrToDiscussion(
        this.#octokit,
        this.#context,
        this.#id,
        this.#adrDir,
        category.id,
        this.#statusRegex,
        this.#closeStatuses,
        title,
        content,
        statusLabel,
      );
      await adrToDiscussion.sync();
    }
  }

  async #fetchRepository(
    categoriesEndCursor: string | null = null,
    labelsEndCursor: string | null = null,
  ): Promise<Repository> {
    const response = await this.#octokit.graphql<RepositoryCategoriesAndLabelsResponse>(repositoryCategoriesAndLabels, {
      repo: this.#context.repo.repo,
      owner: this.#context.repo.owner,
      categoriesEndCursor,
      labelsEndCursor,
    });

    const id = response.repository.id;
    let categories = response.repository.discussionCategories.nodes;
    let labels = response.repository.labels.nodes;

    if (response.repository.discussionCategories.pageInfo.hasNextPage && response.repository.labels.pageInfo.hasNextPage) {
      const nextRepository = await this.#fetchRepository(
        response.repository.discussionCategories.pageInfo.endCursor,
        response.repository.labels.pageInfo.endCursor,
      );
      categories = categories.concat(nextRepository.categories);
      labels = labels.concat(nextRepository.labels);
    } else if (response.repository.discussionCategories.pageInfo.hasNextPage) {
      categories = categories.concat(
        await this.#fetchRepositoryCategories(response.repository.discussionCategories.pageInfo.endCursor),
      );
    } else if (response.repository.labels.pageInfo.hasNextPage) {
      labels = labels.concat(await this.#fetchRepositoryLabels(response.repository.labels.pageInfo.endCursor));
    }

    return { id, categories, labels };
  }

  async #fetchRepositoryCategories(categoriesEndCursor: string | null): Promise<Category[]> {
    const response = await this.#octokit.graphql<RepositoryCategoriesResponse>(repositoryCategories, {
      repo: this.#context.repo.repo,
      owner: this.#context.repo.owner,
      categoriesEndCursor,
    });

    let categories = response.repository.discussionCategories.nodes;
    if (response.repository.discussionCategories.pageInfo.hasNextPage) {
      categories = categories.concat(
        await this.#fetchRepositoryCategories(response.repository.discussionCategories.pageInfo.endCursor),
      );
    }

    return categories;
  }

  async #fetchRepositoryLabels(labelsEndCursor: string | null): Promise<Label[]> {
    const response = await this.#octokit.graphql<RepositoryLabelsResponse>(repositoryLabels, {
      repo: this.#context.repo.repo,
      owner: this.#context.repo.owner,
      labelsEndCursor,
    });

    let labels = response.repository.labels.nodes;
    if (response.repository.labels.pageInfo.hasNextPage) {
      labels = labels.concat(await this.#fetchRepositoryLabels(response.repository.labels.pageInfo.endCursor));
    }

    return labels;
  }

  async #fetchTitles(): Promise<string[]> {
    let response: Awaited<GetContentResponse>;
    try {
      response = await this.#octokit.rest.repos.getContent({
        owner: this.#context.repo.owner,
        repo: this.#context.repo.repo,
        path: this.#adrDir,
        ref: this.#context.ref,
      });
    } catch (error) {
      // HttpError is thrown when the content does not exist
      if (error instanceof Error && error.name === "HttpError") {
        throw new Error(`Could not find directory at ${this.#adrDir}`);
      }
      throw error;
    }

    if (!Array.isArray(response.data)) {
      throw new Error(`Expected directory but found a file at ${this.#adrDir}`);
    }

    return response.data.filter((item) => item.type === "file" && item.name.endsWith(".md")).map((item) => item.name);
  }

  async #fetchContent(title: string): Promise<string> {
    const response = await this.#octokit.rest.repos.getContent({
      owner: this.#context.repo.owner,
      repo: this.#context.repo.repo,
      path: `${this.#adrDir}/${title}`,
      ref: this.#context.ref,
    });

    if (Array.isArray(response.data) || response.data.type !== "file" || !response.data.content) {
      throw new Error(`Could not retrieve content for ${title}`);
    }

    return atob(response.data.content);
  }

  async #ensureStatusLabel(content: string): Promise<Label | null> {
    const status = extractStatus(content, this.#statusRegex);
    if (!status) return null;

    const label = this.#labels.find((label) => label.name === status);
    if (label) return label;

    const response = await this.#octokit.graphql<CreateLabelResponse>(createLabel, {
      repositoryId: this.#id,
      name: status,
      color: randomColor(),
      description: LABEL_DESCRIPTION,
    });

    this.#labels.push(response.createLabel.label);

    return response.createLabel.label;
  }
}
