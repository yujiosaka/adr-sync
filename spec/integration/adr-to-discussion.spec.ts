import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import addDiscussionComment from "../../src/graphql/mutations/addDiscussionComment";
import addLabel from "../../src/graphql/mutations/addLabel";
import closeDiscussion from "../../src/graphql/mutations/closeDiscussion";
import createDiscussion from "../../src/graphql/mutations/createDiscussion";
import removeLabel from "../../src/graphql/mutations/removeLabel";
import reopenDiscussion from "../../src/graphql/mutations/reopenDiscussion";
import updateDiscussion from "../../src/graphql/mutations/updateDiscussion";
import searchDiscussions from "../../src/graphql/queries/searchDiscussions";
import type { Label } from "../../src/graphql/shared";
import AdrToDiscussion from "../../src/integration/adr-to-discussion";
import type { Context, Octokit } from "../../src/shared";
import { readExample } from "../helper";

async function mockContent(status: string): Promise<string> {
  const example = await readExample("template.md");
  return example.replace("STATUS", status);
}

describe("AdrToDiscussion", () => {
  let adrToDiscussion: AdrToDiscussion;
  let octokitMock: { graphql: Mock; rest: { repos: { getContent: Mock; listCommits: Mock } } };
  let contextMock: Context;
  let content: string;
  let status: string;
  let statusLabel: Label | null;
  const repositoryId = "repository-1";
  const adrDir = "docs/adr";
  const categoryId = "cat-1";
  const statusRegex = /##\s*Status\s+([^\s\n]+?)(?:\s+by\s.*)?\s*(?:\n|$)/;
  const closeStatuses = ["Accepted", "Superseded", "Deprecated", "Rejected"];
  const title = "0001-record-architecture-decisions.md";

  beforeEach(() => {
    octokitMock = { graphql: vi.fn(), rest: { repos: { getContent: vi.fn(), listCommits: vi.fn() } } };
    contextMock = {
      eventName: "push",
      repo: { owner: "yujiosaka", repo: "adr-sync" },
      ref: "refs/heads/main",
      payload: { before: "commit-sha" },
    } as unknown as Context;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("When the status is Proposed", () => {
    beforeEach(async () => {
      status = "Proposed";
      content = await mockContent(status);
      statusLabel = { id: "label-1", name: status };

      adrToDiscussion = new AdrToDiscussion(
        octokitMock as unknown as Octokit,
        contextMock,
        repositoryId,
        adrDir,
        categoryId,
        statusRegex,
        closeStatuses,
        title,
        content,
        statusLabel,
      );
    });

    it("creates a new discussion", async () => {
      octokitMock.graphql
        .mockResolvedValueOnce({
          search: {
            nodes: [],
          },
        })
        .mockResolvedValueOnce({
          createDiscussion: { discussion: { id: "discussion-1" } },
        });

      octokitMock.rest.repos.listCommits.mockResolvedValueOnce({
        data: [
          {
            author: { login: "yujiosaka" },
            commit: { author: null },
            html_url: "commit-url",
          },
        ],
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(createDiscussion, {
        repositoryId,
        title,
        body: content,
        categoryId,
      });
      expect(octokitMock.rest.repos.listCommits).toHaveBeenCalledWith({
        owner: contextMock.repo.owner,
        repo: contextMock.repo.repo,
        path: `${adrDir}/${title}`,
        per_page: 1,
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addDiscussionComment, {
        discussionId: "discussion-1",
        body: "This ADR was authored by @yujiosaka. You can view the commit [here](commit-url).",
      });
      expect(octokitMock.rest.repos.getContent).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(addLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("updates the discussion when the previous status is Accepted", async () => {
      const previousStatus = "Accepted";
      const previousContent = await mockContent(previousStatus);

      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: previousContent,
              closed: true,
              labels: {
                nodes: [{ id: "label-2", name: previousStatus }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(previousContent),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(updateDiscussion, { discussionId: "discussion-1", body: content });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(removeLabel, { discussionId: "discussion-1", labelId: "label-2" });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(reopenDiscussion, { discussionId: "discussion-1" });
    });

    it("updates the discussion when the previous status is Accepted and the next page is found for labels", async () => {
      const previousStatus = "Accepted";
      const previousContent = await mockContent(previousStatus);

      octokitMock.graphql
        .mockResolvedValueOnce({
          search: {
            nodes: [
              {
                id: "discussion-1",
                body: previousContent,
                closed: true,
                labels: {
                  nodes: [{ id: "label-2", name: "Superseded" }],
                  pageInfo: { hasNextPage: true, endCursor: "label-cursor" },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          search: {
            nodes: [
              {
                id: "discussion-1",
                body: previousContent,
                closed: true,
                labels: {
                  nodes: [{ id: "label-3", name: previousStatus }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            ],
          },
        });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(previousContent),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: "label-cursor",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(updateDiscussion, { discussionId: "discussion-1", body: content });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(removeLabel, { discussionId: "discussion-1", labelId: "label-3" });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(reopenDiscussion, { discussionId: "discussion-1" });
    });

    it("does not update the discussion when the content is the same", async () => {
      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: content,
              closed: false,
              labels: {
                nodes: [{ id: "label-1", name: status }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(content),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not close the discussion when it's manually closed but the content is the same", async () => {
      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: content,
              closed: true,
              labels: {
                nodes: [{ id: "label-1", name: status }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(content),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not change labels when it's manually modified but the content is the same", async () => {
      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: content,
              closed: false,
              labels: {
                nodes: [{ id: "label-1", name: "Accepted" }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(content),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });
  });

  describe("When the status is Accepted", () => {
    beforeEach(async () => {
      status = "Accepted";
      content = await mockContent("Accepted");
      statusLabel = { id: "label-1", name: status };

      adrToDiscussion = new AdrToDiscussion(
        octokitMock as unknown as Octokit,
        contextMock,
        repositoryId,
        adrDir,
        categoryId,
        statusRegex,
        closeStatuses,
        title,
        content,
        statusLabel,
      );
    });

    it("creates a new discussion", async () => {
      octokitMock.graphql
        .mockResolvedValueOnce({
          search: {
            nodes: [],
          },
        })
        .mockResolvedValueOnce({
          createDiscussion: { discussion: { id: "discussion-1" } },
        });

      octokitMock.rest.repos.listCommits.mockResolvedValueOnce({
        data: [
          {
            author: { login: "yujiosaka" },
            commit: { author: null },
            html_url: "commit-url",
          },
        ],
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(createDiscussion, {
        repositoryId,
        title,
        body: content,
        categoryId,
      });
      expect(octokitMock.rest.repos.listCommits).toHaveBeenCalledWith({
        owner: contextMock.repo.owner,
        repo: contextMock.repo.repo,
        path: `${adrDir}/${title}`,
        per_page: 1,
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addDiscussionComment, {
        discussionId: "discussion-1",
        body: "This ADR was authored by @yujiosaka. You can view the commit [here](commit-url).",
      });
      expect(octokitMock.rest.repos.getContent).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(addLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).toHaveBeenCalledWith(closeDiscussion, { discussionId: "discussion-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("updates the discussion when the previous status is Proposed", async () => {
      const previousStatus = "Proposed";
      const previousContent = await mockContent(previousStatus);

      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: previousContent,
              closed: false,
              labels: {
                nodes: [{ id: "label-2", name: previousStatus }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(previousContent),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(updateDiscussion, { discussionId: "discussion-1", body: content });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(removeLabel, { discussionId: "discussion-1", labelId: "label-2" });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).toHaveBeenCalledWith(closeDiscussion, { discussionId: "discussion-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("updates the discussion when the previous status is Proposed and the next page is found for labels", async () => {
      const previousStatus = "Proposed";
      const previousContent = await mockContent(previousStatus);

      octokitMock.graphql
        .mockResolvedValueOnce({
          search: {
            nodes: [
              {
                id: "discussion-1",
                body: previousContent,
                closed: false,
                labels: {
                  nodes: [{ id: "label-2", name: "Superseded" }],
                  pageInfo: { hasNextPage: true, endCursor: "label-cursor" },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          search: {
            nodes: [
              {
                id: "discussion-1",
                body: previousContent,
                closed: false,
                labels: {
                  nodes: [{ id: "label-3", name: previousStatus }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            ],
          },
        });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(previousContent),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: "label-cursor",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(updateDiscussion, { discussionId: "discussion-1", body: content });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(removeLabel, { discussionId: "discussion-1", labelId: "label-3" });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).toHaveBeenCalledWith(closeDiscussion, { discussionId: "discussion-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not update the discussion when the content is the same", async () => {
      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: content,
              closed: true,
              labels: {
                nodes: [{ id: "label-1", name: status }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(content),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not reopen the discussion when it's manually reopened but the content is the same", async () => {
      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: content,
              closed: false,
              labels: {
                nodes: [{ id: "label-1", name: status }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(content),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not change labels when it's manually modified but the content is the same", async () => {
      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: content,
              closed: true,
              labels: {
                nodes: [{ id: "label-1", name: "Proposed" }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(content),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });
  });

  describe("When the status is empty", () => {
    beforeEach(async () => {
      content = await mockContent("");
      statusLabel = null;

      adrToDiscussion = new AdrToDiscussion(
        octokitMock as unknown as Octokit,
        contextMock,
        repositoryId,
        adrDir,
        categoryId,
        statusRegex,
        closeStatuses,
        title,
        content,
        statusLabel,
      );
    });

    it("creates a new discussion", async () => {
      octokitMock.graphql
        .mockResolvedValueOnce({
          search: {
            nodes: [],
          },
        })
        .mockResolvedValueOnce({
          createDiscussion: { discussion: { id: "discussion-1" } },
        });

      octokitMock.rest.repos.listCommits.mockResolvedValueOnce({
        data: [
          {
            author: { login: "yujiosaka" },
            commit: { author: null },
            html_url: "commit-url",
          },
        ],
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(createDiscussion, {
        repositoryId,
        title,
        body: content,
        categoryId,
      });
      expect(octokitMock.rest.repos.listCommits).toHaveBeenCalledWith({
        owner: contextMock.repo.owner,
        repo: contextMock.repo.repo,
        path: `${adrDir}/${title}`,
        per_page: 1,
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addDiscussionComment, {
        discussionId: "discussion-1",
        body: "This ADR was authored by @yujiosaka. You can view the commit [here](commit-url).",
      });
      expect(octokitMock.rest.repos.getContent).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("updates the discussion when the previous status is Accepted", async () => {
      const previousStatus = "Accepted";
      const previousContent = await mockContent(previousStatus);

      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: previousContent,
              closed: true,
              labels: {
                nodes: [{ id: "label-1", name: previousStatus }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(previousContent),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(updateDiscussion, { discussionId: "discussion-1", body: content });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(removeLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(reopenDiscussion, { discussionId: "discussion-1" });
    });

    it("updates the discussion when the previous status is Accepted and the next page is found for labels", async () => {
      const previousStatus = "Accepted";
      const previousContent = await mockContent(previousStatus);

      octokitMock.graphql
        .mockResolvedValueOnce({
          search: {
            nodes: [
              {
                id: "discussion-1",
                body: previousContent,
                closed: true,
                labels: {
                  nodes: [{ id: "label-1", name: "Superseded" }],
                  pageInfo: { hasNextPage: true, endCursor: "label-cursor" },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          search: {
            nodes: [
              {
                id: "discussion-1",
                body: previousContent,
                closed: true,
                labels: {
                  nodes: [{ id: "label-2", name: previousStatus }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            ],
          },
        });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(previousContent),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: "label-cursor",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(updateDiscussion, { discussionId: "discussion-1", body: content });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(removeLabel, { discussionId: "discussion-1", labelId: "label-2" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(reopenDiscussion, { discussionId: "discussion-1" });
    });

    it("does not update the discussion when the content is the same", async () => {
      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: content,
              closed: false,
              labels: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(content),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not close the discussion when it's manually closed but the content is the same", async () => {
      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: content,
              closed: true,
              labels: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(content),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not change labels when it's manually modified but the content is the same", async () => {
      octokitMock.graphql.mockResolvedValueOnce({
        search: {
          nodes: [
            {
              id: "discussion-1",
              body: content,
              closed: false,
              labels: {
                nodes: [{ id: "label-1", name: "Accepted" }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      });

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(content),
        },
      });

      await adrToDiscussion.sync();

      expect(octokitMock.graphql).toHaveBeenCalledWith(searchDiscussions, {
        searchQuery: `repo:yujiosaka/adr-sync in:title ${title}`,
        labelsEndCursor: null,
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(updateDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(createDiscussion, expect.anything());
      expect(octokitMock.rest.repos.listCommits).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: "commit-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });
  });
});
