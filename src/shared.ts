import type * as github from "@actions/github";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { Category, Label } from "./graphql/shared";

export type Repository = { id: string; categories: Category[]; labels: Label[] };
export type Discussion = { id: string; body: string; closed: boolean; labels: Label[] };
export type Commit = { url: string | null; author: string | null };
export type File = { content: string; sha: string };
export type Octokit = ReturnType<typeof github.getOctokit>;
export type Context = typeof github.context;
export type GetContentResponse = RestEndpointMethodTypes["repos"]["getContent"]["response"];
export type ListCommitsResponse = RestEndpointMethodTypes["repos"]["listCommits"]["response"];
export type CommitAuthor = ListCommitsResponse["data"][0]["commit"]["author"];
export type Sender = Context["payload"]["sender"];
export type Author = ListCommitsResponse["data"][0]["author"];

export const GITHUB_BASE_URL = "https://github.com/";
export const LABEL_DESCRIPTION = "Created by adr-sync";
export const CREATE_COMMIT_MESSAGE = "docs(adr): create ADR [skip ci]";
export const UPDATE_COMMIT_MESSAGE = "docs(adr): update ADR [skip ci]";
