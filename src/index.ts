import * as core from "@actions/core";
import * as github from "@actions/github";
import Action from "./action";

const octokit = github.getOctokit(core.getInput("github-token"));
const context = github.context;
const branch = core.getInput("branch");
const category = core.getInput("discussion-category");
const statusRegex = new RegExp(core.getInput("status-regex"));
const titleRegex = new RegExp(core.getInput("title-regex"));
const closeStatuses = core
  .getInput("close-statuses")
  .split(",")
  .map((status) => status.trim());

const action = new Action(octokit, context, branch, category, statusRegex, titleRegex, closeStatuses);
action.run();
