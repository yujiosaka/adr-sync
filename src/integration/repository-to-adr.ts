import createLabel, { type CreateLabelResponse } from "../graphql/mutations/createLabel";
import repositoryLabels, { type RepositoryLabelsResponse } from "../graphql/queries/repositoryLabels";
import type { Label } from "../graphql/shared";
import { extractStatus, randomColor } from "../helper";
import type { Context, Octokit, Repository } from "../shared";
import { LABEL_DESCRIPTION } from "../shared";
import DiscussionToADR from "./discussion-to-adr";

export default class RepositoryToADR {
  #octokit: Octokit;
  #context: Context;
  #adrDir: string;
  #category: string;
  #statusRegex: RegExp;
  #titleRegex: RegExp;
  #closeStatuses: string[];
  #branch: string;
  #id!: string;
  #labels: Label[];

  constructor(
    octokit: Octokit,
    context: Context,
    adrDir: string,
    category: string,
    statusRegex: RegExp,
    titleRegex: RegExp,
    closeStatuses: string[],
    branch: string,
  ) {
    this.#octokit = octokit;
    this.#context = context;
    this.#adrDir = adrDir;
    this.#category = category;
    this.#statusRegex = statusRegex;
    this.#titleRegex = titleRegex;
    this.#closeStatuses = closeStatuses;
    this.#branch = branch;
    this.#labels = [];
  }

  public async sync(): Promise<void> {
    if (this.#category !== this.#context.payload.discussion.category.name) return;
    if (!this.#titleRegex.test(this.#context.payload.discussion.title)) return;

    const repository = await this.#fetchRepositoryLabels();

    this.#id = repository.id;
    this.#labels = repository.labels;

    const statusLabel = await this.#ensureStatusLabel();
    const discussionToADR = new DiscussionToADR(
      this.#octokit,
      this.#context,
      this.#adrDir,
      this.#statusRegex,
      this.#closeStatuses,
      this.#branch,
      statusLabel,
    );
    await discussionToADR.sync();
  }

  async #fetchRepositoryLabels(labelsEndCursor: string | null = null): Promise<Repository> {
    const response = await this.#octokit.graphql<RepositoryLabelsResponse>(repositoryLabels, {
      repo: this.#context.repo.repo,
      owner: this.#context.repo.owner,
      labelsEndCursor,
    });

    const id = response.repository.id;

    let labels = response.repository.labels.nodes;
    if (response.repository.labels.pageInfo.hasNextPage) {
      const nextRepository = await this.#fetchRepositoryLabels(response.repository.labels.pageInfo.endCursor);
      labels = labels.concat(nextRepository.labels);
    }

    return { id, labels, categories: [] };
  }

  async #ensureStatusLabel(): Promise<Label | null> {
    const status = extractStatus(this.#context.payload.discussion.body, this.#statusRegex);
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
