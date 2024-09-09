import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import createLabel from "../../src/graphql/mutations/createLabel";
import repositoryCategories from "../../src/graphql/queries/repositoryCategories";
import repositoryCategoriesAndLabels from "../../src/graphql/queries/repositoryCategoriesAndLabels";
import repositoryLabels from "../../src/graphql/queries/repositoryLabels";
import AdrToDiscussion from "../../src/integration/adr-to-discussion";
import AdrToRepository from "../../src/integration/adr-to-repository";
import type { Context, Octokit } from "../../src/shared";
import { readExample } from "../helper";
import { MockHttpError } from "../mock";

vi.mock("../../src/integration/adr-to-discussion");

describe("AdrToRepository", () => {
  let adrToRepository: AdrToRepository;
  let octokitMock: { rest: { repos: { getContent: Mock } }; graphql: Mock };
  let contextMock: Context;
  const adrDir = "docs/adr";
  const category = "ADR";
  const statusRegex = /##\s*Status\s+([^\s\n]+?)(?:\s+by\s.*)?\s*(?:\n|$)/;
  const closeStatuses = ["Accepted", "Superseded", "Deprecated", "Rejected"];

  beforeEach(() => {
    octokitMock = { rest: { repos: { getContent: vi.fn() } }, graphql: vi.fn() };
    contextMock = {
      eventName: "push",
      repo: { owner: "yujiosaka", repo: "adr-sync" },
      ref: "refs/heads/main",
      payload: { before: "commit-sha" },
    } as unknown as Context;

    adrToRepository = new AdrToRepository(
      octokitMock as unknown as Octokit,
      contextMock,
      adrDir,
      category,
      statusRegex,
      closeStatuses,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("syncs a repository without any discussion", async () => {
    octokitMock.graphql.mockResolvedValueOnce({
      repository: {
        id: "repository-1",
        discussionCategories: {
          nodes: [{ id: "category-1", name: category }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        labels: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    octokitMock.rest = {
      repos: {
        getContent: vi.fn().mockResolvedValueOnce({ data: [] }),
      },
    };

    await adrToRepository.sync();

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategoriesAndLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: null,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryCategories, expect.anything());
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryLabels, expect.anything());
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: adrDir,
      ref: contextMock.ref,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(AdrToDiscussion).not.toHaveBeenCalled();
    expect(AdrToDiscussion.prototype.sync).not.toHaveBeenCalled();
  });

  it("syncs a repository with a discussion", async () => {
    const title = "0001-accepted.md";
    const status = "Accepted";
    const content = await readExample(title);

    octokitMock.graphql.mockResolvedValueOnce({
      repository: {
        id: "repository-1",
        discussionCategories: {
          nodes: [{ id: "category-1", name: category }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        labels: {
          nodes: [{ id: "label-1", name: status }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    octokitMock.rest = {
      repos: {
        getContent: vi
          .fn()
          .mockResolvedValueOnce({ data: [{ type: "file", name: title }] })
          .mockResolvedValueOnce({ data: { type: "file", content: btoa(content) } }),
      },
    };

    await adrToRepository.sync();

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategoriesAndLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: null,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryCategories, expect.anything());
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryLabels, expect.anything());
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: adrDir,
      ref: contextMock.ref,
    });
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: `${adrDir}/${title}`,
      ref: contextMock.ref,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(AdrToDiscussion).toHaveBeenCalledWith(
      octokitMock,
      contextMock,
      "repository-1",
      adrDir,
      "category-1",
      statusRegex,
      closeStatuses,
      title,
      content,
      { id: "label-1", name: status },
    );
    expect(AdrToDiscussion.prototype.sync).toHaveBeenCalledTimes(1);
  });

  it("does not create a label when status is not extracted", async () => {
    const title = "0010-empty-status.md";
    const status = "Accepted";
    const content = await readExample(title);

    octokitMock.graphql.mockResolvedValueOnce({
      repository: {
        id: "repository-1",
        discussionCategories: {
          nodes: [{ id: "category-1", name: category }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        labels: {
          nodes: [{ id: "label-1", name: status }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    octokitMock.rest = {
      repos: {
        getContent: vi
          .fn()
          .mockResolvedValueOnce({ data: [{ type: "file", name: title }] })
          .mockResolvedValueOnce({ data: { type: "file", content: btoa(content) } }),
      },
    };

    await adrToRepository.sync();

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategoriesAndLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: null,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryCategories, expect.anything());
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryLabels, expect.anything());
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: adrDir,
      ref: contextMock.ref,
    });
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: `${adrDir}/${title}`,
      ref: contextMock.ref,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(AdrToDiscussion).toHaveBeenCalledWith(
      octokitMock,
      contextMock,
      "repository-1",
      adrDir,
      "category-1",
      statusRegex,
      closeStatuses,
      title,
      content,
      null,
    );
    expect(AdrToDiscussion.prototype.sync).toHaveBeenCalledTimes(1);
  });

  it("creates a label when status label is not found", async () => {
    const title = "0001-accepted.md";
    const status = "Accepted";
    const content = await readExample(title);

    octokitMock.graphql
      .mockResolvedValueOnce({
        repository: {
          id: "repository-1",
          discussionCategories: {
            nodes: [{ id: "category-1", name: category }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
          labels: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })
      .mockResolvedValueOnce({
        createLabel: {
          label: {
            id: "label-1",
            name: status,
          },
        },
      });

    octokitMock.rest = {
      repos: {
        getContent: vi
          .fn()
          .mockResolvedValueOnce({ data: [{ type: "file", name: title }] })
          .mockResolvedValueOnce({ data: { type: "file", content: btoa(content) } }),
      },
    };

    await adrToRepository.sync();

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategoriesAndLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: null,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryCategories, expect.anything());
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryLabels, expect.anything());
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: adrDir,
      ref: contextMock.ref,
    });
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: `${adrDir}/${title}`,
      ref: contextMock.ref,
    });
    expect(octokitMock.graphql).toHaveBeenCalledWith(createLabel, {
      repositoryId: "repository-1",
      name: status,
      color: expect.any(String),
      description: expect.any(String),
    });
    expect(AdrToDiscussion).toHaveBeenCalledWith(
      octokitMock,
      contextMock,
      "repository-1",
      adrDir,
      "category-1",
      statusRegex,
      closeStatuses,
      title,
      content,
      { id: "label-1", name: status },
    );
    expect(AdrToDiscussion.prototype.sync).toHaveBeenCalledTimes(1);
  });

  it("syncs a repository when next page is found for both categories and labels", async () => {
    const title = "0001-accepted.md";
    const status = "Accepted";
    const content = await readExample(title);

    octokitMock.graphql
      .mockResolvedValueOnce({
        repository: {
          id: "repository-1",
          discussionCategories: {
            nodes: [{ id: "category-1", name: "General" }],
            pageInfo: { hasNextPage: true, endCursor: "category-cursor" },
          },
          labels: {
            nodes: [{ id: "label-1", name: "Proposed" }],
            pageInfo: { hasNextPage: true, endCursor: "label-cursor" },
          },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          discussionCategories: {
            nodes: [{ id: "category-2", name: category }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
          labels: {
            nodes: [{ id: "label-2", name: status }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

    octokitMock.rest = {
      repos: {
        getContent: vi
          .fn()
          .mockResolvedValueOnce({ data: [{ type: "file", name: title }] })
          .mockResolvedValueOnce({ data: { type: "file", content: btoa(content) } }),
      },
    };

    await adrToRepository.sync();

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategoriesAndLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: null,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategoriesAndLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: "category-cursor",
      labelsEndCursor: "label-cursor",
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryCategories, expect.anything());
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryLabels, expect.anything());
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: adrDir,
      ref: contextMock.ref,
    });
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: `${adrDir}/${title}`,
      ref: contextMock.ref,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(AdrToDiscussion).toHaveBeenCalledWith(
      octokitMock,
      contextMock,
      "repository-1",
      adrDir,
      "category-2",
      statusRegex,
      closeStatuses,
      title,
      content,
      { id: "label-2", name: status },
    );
    expect(AdrToDiscussion.prototype.sync).toHaveBeenCalledTimes(1);
  });

  it("syncs a repository when next page found only for categories", async () => {
    const title = "0001-accepted.md";
    const status = "Accepted";
    const content = await readExample(title);

    octokitMock.graphql
      .mockResolvedValueOnce({
        repository: {
          id: "repository-1",
          discussionCategories: {
            nodes: [{ id: "category-1", name: "General" }],
            pageInfo: { hasNextPage: true, endCursor: "category-cursor" },
          },
          labels: {
            nodes: [{ id: "label-1", name: status }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          discussionCategories: {
            nodes: [{ id: "category-2", name: category }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

    octokitMock.rest = {
      repos: {
        getContent: vi
          .fn()
          .mockResolvedValueOnce({ data: [{ type: "file", name: title }] })
          .mockResolvedValueOnce({ data: { type: "file", content: btoa(content) } }),
      },
    };

    await adrToRepository.sync();

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategoriesAndLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: null,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategories, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: "category-cursor",
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryLabels, expect.anything());
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: adrDir,
      ref: contextMock.ref,
    });
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: `${adrDir}/${title}`,
      ref: contextMock.ref,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(AdrToDiscussion).toHaveBeenCalledWith(
      octokitMock,
      contextMock,
      "repository-1",
      adrDir,
      "category-2",
      statusRegex,
      closeStatuses,
      title,
      content,
      { id: "label-1", name: status },
    );
    expect(AdrToDiscussion.prototype.sync).toHaveBeenCalledTimes(1);
  });

  it("syncs a repository when next page found only for labels", async () => {
    const title = "0001-accepted.md";
    const status = "Accepted";
    const content = await readExample(title);

    octokitMock.graphql
      .mockResolvedValueOnce({
        repository: {
          id: "repository-1",
          discussionCategories: {
            nodes: [{ id: "category-1", name: category }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
          labels: {
            nodes: [{ id: "label-1", name: "Proposed" }],
            pageInfo: { hasNextPage: true, endCursor: "label-cursor" },
          },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          labels: {
            nodes: [{ id: "label-2", name: status }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

    octokitMock.rest = {
      repos: {
        getContent: vi
          .fn()
          .mockResolvedValueOnce({ data: [{ type: "file", name: title }] })
          .mockResolvedValueOnce({ data: { type: "file", content: btoa(content) } }),
      },
    };

    await adrToRepository.sync();

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategoriesAndLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: null,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryCategories, expect.anything());
    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      labelsEndCursor: "label-cursor",
    });
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: adrDir,
      ref: contextMock.ref,
    });
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: `${adrDir}/${title}`,
      ref: contextMock.ref,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(AdrToDiscussion).toHaveBeenCalledWith(
      octokitMock,
      contextMock,
      "repository-1",
      adrDir,
      "category-1",
      statusRegex,
      closeStatuses,
      title,
      content,
      { id: "label-2", name: status },
    );
    expect(AdrToDiscussion.prototype.sync).toHaveBeenCalledTimes(1);
  });

  it("fails to sync a repository when category is not found", async () => {
    octokitMock.graphql.mockResolvedValueOnce({
      repository: {
        id: "repository-1",
        discussionCategories: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        labels: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    await expect(adrToRepository.sync()).rejects.toThrow("Could not find discussion category ADR");

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategoriesAndLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: null,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryCategories, expect.anything());
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryLabels, expect.anything());
    expect(octokitMock.rest.repos.getContent).not.toHaveBeenCalled();
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(AdrToDiscussion).not.toHaveBeenCalled();
    expect(AdrToDiscussion.prototype.sync).not.toHaveBeenCalled();
  });

  it("fails to sync a repository when ADR directory is not found", async () => {
    octokitMock.graphql.mockResolvedValueOnce({
      repository: {
        id: "repository-1",
        discussionCategories: {
          nodes: [{ id: "category-1", name: category }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        labels: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    octokitMock.rest = {
      repos: {
        getContent: vi.fn().mockRejectedValueOnce(new MockHttpError("Not Found")),
      },
    };

    await expect(adrToRepository.sync()).rejects.toThrow(`Could not find directory at ${adrDir}`);

    expect(octokitMock.graphql).toHaveBeenCalledWith(repositoryCategoriesAndLabels, {
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      categoriesEndCursor: null,
      labelsEndCursor: null,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryCategories, expect.anything());
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(repositoryLabels, expect.anything());
    expect(octokitMock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: contextMock.repo.owner,
      repo: contextMock.repo.repo,
      path: adrDir,
      ref: contextMock.ref,
    });
    expect(octokitMock.graphql).not.toHaveBeenCalledWith(createLabel, expect.anything());
    expect(AdrToDiscussion).not.toHaveBeenCalled();
    expect(AdrToDiscussion.prototype.sync).not.toHaveBeenCalled();
  });
});
