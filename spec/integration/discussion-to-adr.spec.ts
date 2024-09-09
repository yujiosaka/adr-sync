import merge from "lodash.merge";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import addDiscussionComment from "../../src/graphql/mutations/addDiscussionComment";
import addLabel from "../../src/graphql/mutations/addLabel";
import closeDiscussion from "../../src/graphql/mutations/closeDiscussion";
import removeLabel from "../../src/graphql/mutations/removeLabel";
import reopenDiscussion from "../../src/graphql/mutations/reopenDiscussion";
import type { Label } from "../../src/graphql/shared";
import DiscussionToADR from "../../src/integration/discussion-to-adr";
import type { Context, Octokit } from "../../src/shared";
import { readExample } from "../helper";
import { MockHttpError } from "../mock";

async function mockContent(status: string): Promise<string> {
  const example = await readExample("template.md");
  return example.replace("STATUS", status);
}

describe("DiscussionToADR", () => {
  let discussionToADR: DiscussionToADR;
  let octokitMock: { graphql: Mock; rest: { repos: { getContent: Mock; createOrUpdateFileContents: Mock } } };
  let contextMock: Context;
  let title: string;
  let status: string;
  let content: string;
  let statusLabel: Label | null;
  const adrDir = "docs/adr";
  const statusRegex = /##\s*Status\s+([^\s\n]+?)(?:\s+by\s.*)?\s*(?:\n|$)/;
  const closeStatuses = ["Accepted", "Superseded", "Deprecated", "Rejected"];
  const branch = "main";

  const syncDiscussionToADR = async (contextOverride: Partial<Context> = {}) => {
    contextMock = merge(
      {
        repo: { owner: "yujiosaka", repo: "adr-sync" },
        payload: {
          discussion: {
            title,
            body: content,
            node_id: "discussion-1",
            state: "open",
            labels: [],
          },
        },
      },
      contextOverride,
    );

    discussionToADR = new DiscussionToADR(
      octokitMock as unknown as Octokit,
      contextMock,
      adrDir,
      statusRegex,
      closeStatuses,
      branch,
      statusLabel,
    );
    await discussionToADR.sync();
  };

  beforeEach(() => {
    octokitMock = {
      graphql: vi.fn(),
      rest: {
        repos: {
          getContent: vi.fn(),
          createOrUpdateFileContents: vi.fn(),
        },
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("When the status is Proposed", () => {
    beforeEach(async () => {
      title = "0001-proposed.md";
      status = "Proposed";
      content = await mockContent(status);
      statusLabel = { id: "label-1", name: status };
    });

    it("creates a new file", async () => {
      octokitMock.rest.repos.getContent.mockRejectedValueOnce(new MockHttpError("Not Found"));
      octokitMock.rest.repos.createOrUpdateFileContents.mockResolvedValueOnce({
        data: { commit: { html_url: "commit-url", author: { name: "yujiosaka", email: "yujisobe@gmail.com" } } },
      });

      await syncDiscussionToADR();

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        branch,
        path: `${adrDir}/${title}`,
        content: btoa(content),
        message: "docs(adr): create ADR [skip ci]",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addDiscussionComment, {
        discussionId: "discussion-1",
        body: "This ADR was authored by yujiosaka <yujisobe@gmail.com>. You can view the commit [here](commit-url).",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(addLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("updates the file when the previous status is Accepted", async () => {
      const previousStatus = "Accepted";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [{ node_id: "label-2", name: previousStatus }], state: "closed" },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        branch,
        path: `${adrDir}/${title}`,
        content: btoa(content),
        message: "docs(adr): update ADR [skip ci]",
        sha: "file-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(removeLabel, { discussionId: "discussion-1", labelId: "label-2" });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(reopenDiscussion, { discussionId: "discussion-1" });
    });

    it("does not update the file when the content is the same", async () => {
      const previousStatus = "Proposed";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [{ node_id: "label-1", name: previousStatus }] },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not close the discussion when it's manually closed but the content is the same", async () => {
      const previousStatus = "Proposed";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [{ node_id: "label-1", name: previousStatus }], status: "closed" },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not change labels when it's manually modified but the content is the same", async () => {
      const previousStatus = "Proposed";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [{ node_id: "label-2", name: "Accepted" }] },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });
  });

  describe("When the status is Accepted", () => {
    beforeEach(async () => {
      title = "0002-accepted.md";
      status = "Accepted";
      content = await mockContent(status);
      statusLabel = { id: "label-1", name: status };
    });

    it("creates a new file", async () => {
      octokitMock.rest.repos.getContent.mockRejectedValueOnce(new MockHttpError("Not Found"));
      octokitMock.rest.repos.createOrUpdateFileContents.mockResolvedValueOnce({
        data: { commit: { html_url: "commit-url", author: { name: "yujiosaka", email: "yujisobe@gmail.com" } } },
      });

      await syncDiscussionToADR();

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        branch,
        path: `${adrDir}/${title}`,
        content: btoa(content),
        message: "docs(adr): create ADR [skip ci]",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addDiscussionComment, {
        discussionId: "discussion-1",
        body: "This ADR was authored by yujiosaka <yujisobe@gmail.com>. You can view the commit [here](commit-url).",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(closeDiscussion, { discussionId: "discussion-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("updates the file when the previous status is Proposed", async () => {
      const previousStatus = "Proposed";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [{ node_id: "label-2", name: previousStatus }] },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        branch,
        path: `${adrDir}/${title}`,
        content: btoa(content),
        message: "docs(adr): update ADR [skip ci]",
        sha: "file-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(removeLabel, { discussionId: "discussion-1", labelId: "label-2" });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).toHaveBeenCalledWith(closeDiscussion, { discussionId: "discussion-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not update the file when the content is the same", async () => {
      const previousStatus = "Accepted";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [{ node_id: "label-1", name: previousStatus }], state: "closed" },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not reopen the discussion when it's manually reopened but the content is the same", async () => {
      const previousStatus = "Accepted";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [{ node_id: "label-1", name: previousStatus }] },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not change labels when it's manually modified but the content is the same", async () => {
      const previousStatus = "Accepted";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [{ node_id: "label-2", name: "Proposed" }] },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });
  });

  describe("When the status is empty", () => {
    beforeEach(async () => {
      title = "0003-empty-status.md";
      content = await mockContent("");
      statusLabel = null;
    });

    it("creates a new file", async () => {
      octokitMock.rest.repos.getContent.mockRejectedValueOnce(new MockHttpError("Not Found"));
      octokitMock.rest.repos.createOrUpdateFileContents.mockResolvedValueOnce({
        data: { commit: { html_url: "commit-url", author: { name: "yujiosaka", email: "yujisobe@gmail.com" } } },
      });

      await syncDiscussionToADR();

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        branch,
        path: `${adrDir}/${title}`,
        content: btoa(content),
        message: "docs(adr): create ADR [skip ci]",
      });
      expect(octokitMock.graphql).toHaveBeenCalledWith(addDiscussionComment, {
        discussionId: "discussion-1",
        body: "This ADR was authored by yujiosaka <yujisobe@gmail.com>. You can view the commit [here](commit-url).",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("updates the file when the previous status is Accepted", async () => {
      const previousStatus = "Accepted";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [{ node_id: "label-1", name: previousStatus }], state: "closed" },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        branch,
        path: `${adrDir}/${title}`,
        content: btoa(content),
        message: "docs(adr): update ADR [skip ci]",
        sha: "file-sha",
      });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(removeLabel, { discussionId: "discussion-1", labelId: "label-1" });
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).toHaveBeenCalledWith(reopenDiscussion, { discussionId: "discussion-1" });
    });

    it("does not update the file when the content is the same", async () => {
      const previousStatus = "";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not close the discussion when it's manually closed but the content is the same", async () => {
      const previousStatus = "";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [], status: "closed" },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });

    it("does not change labels when it's manually modified but the content is the same", async () => {
      const previousStatus = "";
      const previousContent = await mockContent(previousStatus);

      octokitMock.rest.repos.getContent.mockResolvedValueOnce({
        data: { type: "file", content: btoa(previousContent), sha: "file-sha" },
      });

      await syncDiscussionToADR({
        payload: {
          changes: { body: { from: previousContent } },
          discussion: { labels: [{ node_id: "label-1", name: "Accepted" }] },
        },
      });

      expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "yujiosaka",
        repo: "adr-sync",
        path: `${adrDir}/${title}`,
        ref: branch,
      });
      expect(octokitMock.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addDiscussionComment, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(removeLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(addLabel, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(closeDiscussion, expect.anything());
      expect(octokitMock.graphql).not.toHaveBeenCalledWith(reopenDiscussion, expect.anything());
    });
  });
});
