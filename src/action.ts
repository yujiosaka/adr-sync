import * as core from "@actions/core";
import AdrToRepository from "./integration/adr-to-repository";
import RepositoryToADR from "./integration/repository-to-adr";
import type { Context, GetContentResponse, Octokit } from "./shared";

export default class Action {
  #octokit: Octokit;
  #context: Context;
  #branch: string;
  #category: string;
  #statusRegex: RegExp;
  #titleRegex: RegExp;
  #closeStatuses: string[];

  constructor(
    octokit: Octokit,
    context: Context,
    branch: string,
    category: string,
    statusRegex: RegExp,
    titleRegex: RegExp,
    closeStatuses: string[],
  ) {
    this.#octokit = octokit;
    this.#context = context;
    this.#branch = branch;
    this.#category = category;
    this.#statusRegex = statusRegex;
    this.#titleRegex = titleRegex;
    this.#closeStatuses = closeStatuses;
  }

  public async run(): Promise<void> {
    try {
      const action = this.#context.payload.action ?? "";

      if (this.#context.eventName === "push") {
        const branch = this.#context.ref.replace("refs/heads/", "");
        if (branch !== this.#branch) {
          throw new Error(`Action triggered on branch '${branch}', but configured to run only on branch '${this.#branch}'.`);
        }

        const adrDir = (await this.#fetchAdrDir(this.#context.ref)) || "doc/adr";

        const adrToRepository = new AdrToRepository(
          this.#octokit,
          this.#context,
          adrDir,
          this.#category,
          this.#statusRegex,
          this.#closeStatuses,
        );
        await adrToRepository.sync();
      } else if (this.#context.eventName === "discussion" && ["created", "edited"].includes(action)) {
        const adrDir = (await this.#fetchAdrDir(this.#branch)) || "doc/adr";

        const repositoryToADR = new RepositoryToADR(
          this.#octokit,
          this.#context,
          adrDir,
          this.#category,
          this.#statusRegex,
          this.#titleRegex,
          this.#closeStatuses,
          this.#branch,
        );
        await repositoryToADR.sync();
      }
    } catch (error) {
      if (error instanceof Error) {
        core.setFailed(error);
      }
    }
  }

  async #fetchAdrDir(ref: string): Promise<string | null> {
    let response: Awaited<GetContentResponse>;
    try {
      response = await this.#octokit.rest.repos.getContent({
        owner: this.#context.repo.owner,
        repo: this.#context.repo.repo,
        path: ".adr-dir",
        ref,
      });
    } catch (error) {
      // HttpError is thrown when the content does not exist
      if (error instanceof Error && error.name === "HttpError") return null;
      throw error;
    }

    if (Array.isArray(response.data) || response.data.type !== "file" || !response.data.content) {
      throw new Error("Could not retrieve content at .adr-dir");
    }

    return atob(response.data.content).trim();
  }
}
