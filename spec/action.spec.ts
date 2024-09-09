import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import Action from "../src/action";
import AdrToRepository from "../src/integration/adr-to-repository";
import RepositoryToADR from "../src/integration/repository-to-adr";
import type { Context, Octokit } from "../src/shared";
import { MockHttpError } from "./mock";

vi.mock("../src/integration/adr-to-repository");
vi.mock("../src/integration/repository-to-adr");

describe("Action", () => {
  let action: Action;
  let octokitMock: { rest: { repos: { getContent: Mock } } };
  let contextMock: Context;
  const branch = "main";
  const category = "General";
  const statusRegex = /##\s*Status\s+([^\s\n]+?)(?:\s+by\s.*)?\s*(?:\n|$)/;
  const titleRegex = /^\d{4}-[^.]*\.md$/;
  const closeStatuses = ["Accepted", "Superseded", "Deprecated", "Rejected"];

  beforeEach(() => {
    octokitMock = { rest: { repos: { getContent: vi.fn() } } };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("When event name is push", () => {
    beforeEach(() => {
      contextMock = {
        eventName: "push",
        repo: { owner: "yujiosaka", repo: "adr-sync" },
        ref: "refs/heads/main",
        payload: { before: "commit-sha" },
      } as unknown as Context;

      action = new Action(
        octokitMock as unknown as Octokit,
        contextMock,
        branch,
        category,
        statusRegex,
        titleRegex,
        closeStatuses,
      );
      AdrToRepository.prototype.sync = vi.fn();
    });

    it("uses .adr-dir from the repository when found", async () => {
      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa("docs/adr\n"),
        },
      });

      await action.run();

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: contextMock.repo.owner,
        repo: contextMock.repo.repo,
        path: ".adr-dir",
        ref: contextMock.ref,
      });

      expect(AdrToRepository).toHaveBeenCalledWith(octokitMock, contextMock, "docs/adr", "General", statusRegex, [
        "Accepted",
        "Superseded",
        "Deprecated",
        "Rejected",
      ]);
      expect(AdrToRepository.prototype.sync).toHaveBeenCalled();
    });

    it("uses the default adr dir if .adr-dir file is not found", async () => {
      octokitMock.rest.repos.getContent.mockRejectedValueOnce(new MockHttpError("Not Found"));

      await action.run();

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: contextMock.repo.owner,
        repo: contextMock.repo.repo,
        path: ".adr-dir",
        ref: contextMock.ref,
      });

      expect(AdrToRepository).toHaveBeenCalledWith(octokitMock, contextMock, "doc/adr", "General", statusRegex, [
        "Accepted",
        "Superseded",
        "Deprecated",
        "Rejected",
      ]);
      expect(AdrToRepository.prototype.sync).toHaveBeenCalled();
    });
  });

  describe("When event name is discussion", () => {
    beforeEach(() => {
      contextMock = {
        eventName: "discussion",
        payload: { action: "created" },
        repo: { owner: "yujiosaka", repo: "adr-sync" },
      } as unknown as Context;

      action = new Action(
        octokitMock as unknown as Octokit,
        contextMock,
        branch,
        category,
        statusRegex,
        titleRegex,
        closeStatuses,
      );
      RepositoryToADR.prototype.sync = vi.fn();
    });

    it("uses .adr-dir from the repository when found", async () => {
      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa("docs/adr\n"),
        },
      });

      await action.run();

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: contextMock.repo.owner,
        repo: contextMock.repo.repo,
        path: ".adr-dir",
        ref: branch,
      });

      expect(RepositoryToADR).toHaveBeenCalledWith(
        octokitMock,
        contextMock,
        "docs/adr",
        "General",
        statusRegex,
        titleRegex,
        closeStatuses,
        branch,
      );
      expect(RepositoryToADR.prototype.sync).toHaveBeenCalled();
    });

    it("uses the default adr dir if .adr-dir file is not found", async () => {
      octokitMock.rest.repos.getContent.mockRejectedValueOnce(new MockHttpError("Not Found"));

      await action.run();

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: contextMock.repo.owner,
        repo: contextMock.repo.repo,
        path: ".adr-dir",
        ref: branch,
      });

      expect(RepositoryToADR).toHaveBeenCalledWith(
        octokitMock,
        contextMock,
        "doc/adr",
        "General",
        statusRegex,
        titleRegex,
        closeStatuses,
        branch,
      );
      expect(RepositoryToADR.prototype.sync).toHaveBeenCalled();
    });
  });
});
