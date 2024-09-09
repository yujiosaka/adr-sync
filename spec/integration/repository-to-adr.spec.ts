import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import createLabel from "../../src/graphql/mutations/createLabel";
import repositoryLabels from "../../src/graphql/queries/repositoryLabels";
import DiscussionToADR from "../../src/integration/discussion-to-adr";
import RepositoryToADR from "../../src/integration/repository-to-adr";
import type { Context, Octokit } from "../../src/shared";
import { readExample } from "../helper";

vi.mock("../../src/integration/discussion-to-adr");

describe("RepositoryToADR", () => {
  let repositoryToADR: RepositoryToADR;
  let octokitMock: { graphql: Mock };
  let contextMock: Context;
  let content: string;
  const adrDir = "docs/adr";
  const category = "General";
  const statusRegex = /##\s*Status\s+([^\s\n]+?)(?:\s+by\s.*)?\s*(?:\n|$)/;
  const titleRegex = /^\d{4}-[^.]*\.md$/;
  const closeStatuses = ["Accepted", "Superseded", "Deprecated", "Rejected"];
  const branch = "main";
  const title = "0001-accepted.md";
  const status = "Accepted";

  beforeEach(async () => {
    content = await readExample(title);
    octokitMock = { graphql: vi.fn() };
    contextMock = {
      eventName: "discussion",
      repo: { owner: "yujiosaka", repo: "adr-sync" },
      payload: { discussion: { category: { name: category }, title, body: content } },
    } as unknown as Context;

    repositoryToADR = new RepositoryToADR(
      octokitMock as unknown as Octokit,
      contextMock,
      adrDir,
      category,
      statusRegex,
      titleRegex,
      closeStatuses,
      branch,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not sync discussion when category does not match", async () => {
    contextMock.payload.discussion.category.name = "Q&A";

    await repositoryToADR.sync();

    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryLabels, expect.anything());
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(DiscussionToADR).not.toHaveBeenCalled();
    expect(DiscussionToADR.prototype.sync).not.toHaveBeenCalled();
  });

  it("does not sync discussion when title does not match", async () => {
    contextMock.payload.discussion.title = "How can I use adr-sync?";

    await repositoryToADR.sync();

    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryLabels, expect.anything());
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(DiscussionToADR).not.toHaveBeenCalled();
    expect(DiscussionToADR.prototype.sync).not.toHaveBeenCalled();
  });

  it("syncs discussion when category and title match", async () => {
    octokitMock.graphql.mockResolvedValueOnce({
      repository: {
        id: "repository-1",
        labels: {
          nodes: [{ id: "label-1", name: status }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    await repositoryToADR.sync();

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(DiscussionToADR).toHaveBeenCalledWith(octokitMock, contextMock, adrDir, statusRegex, closeStatuses, branch, {
      id: "label-1",
      name: status,
    });
    expect(DiscussionToADR.prototype.sync).toHaveBeenCalled();
  });

  it("syncs discussion when next page found for labels", async () => {
    octokitMock.graphql
      .mockResolvedValueOnce({
        repository: {
          id: "repository-1",
          labels: {
            nodes: [{ id: "label-1", name: "Proposed" }],
            pageInfo: { hasNextPage: true, endCursor: "label-cursor" },
          },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          labels: {
            nodes: [{ id: "label-2", name: "Accepted" }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

    await repositoryToADR.sync();

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      labelsEndCursor: "label-cursor",
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(DiscussionToADR).toHaveBeenCalledWith(octokitMock, contextMock, adrDir, statusRegex, closeStatuses, branch, {
      id: "label-2",
      name: status,
    });
    expect(DiscussionToADR.prototype.sync).toHaveBeenCalled();
  });

  it("creates a new label when status label is not found", async () => {
    octokitMock.graphql.mockResolvedValueOnce({
      repository: {
        id: "repository-1",
        labels: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    octokitMock.graphql.mockResolvedValueOnce({
      createLabel: { label: { id: "label-1", name: status } },
    });

    await repositoryToADR.sync();

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).toHaveBeenCalledWith(createLabel, {
      repositoryId: "repository-1",
      name: "Accepted",
      color: expect.any(String),
      description: expect.any(String),
    });
    expect(DiscussionToADR).toHaveBeenCalledWith(octokitMock, contextMock, adrDir, statusRegex, closeStatuses, branch, {
      id: "label-1",
      name: status,
    });
    expect(DiscussionToADR.prototype.sync).toHaveBeenCalled();
  });
});
