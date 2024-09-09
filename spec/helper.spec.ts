import * as fs from "node:fs/promises";
import * as path from "node:path";
import { beforeEach } from "node:test";
import yaml from "js-yaml";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { extractStatus, generateAuthor, generateComment, randomColor, replaceLinks } from "../src/helper";
import type { Author } from "../src/shared";
import { readExample } from "./helper";

const actionYmlPath = path.join(__dirname, "../action.yml");

describe("extractStatus", () => {
  let regex: RegExp;

  beforeAll(async () => {
    const content = await fs.readFile(actionYmlPath, "utf8");
    const actionYml = yaml.load(content);
    const regexString = actionYml.inputs["status-regex"].default;
    regex = new RegExp(regexString);
  });

  it("extracts status from 0001-accepted.md", async () => {
    const content = await readExample("0001-accepted.md");
    const status = extractStatus(content, regex);
    expect(status).toBe("Accepted");
  });

  it("extracts status from 0002-superseded.md", async () => {
    const content = await readExample("0002-superseded.md");
    const status = extractStatus(content, regex);
    expect(status).toBe("Superseded");
  });

  it("extracts status from 0003-accepted-supersedes.md", async () => {
    const content = await readExample("0003-accepted-supersedes.md");
    const status = extractStatus(content, regex);
    expect(status).toBe("Accepted");
  });

  it("extracts status from 0005-superseded-supersedes.md", async () => {
    const content = await readExample("0005-superseded-supersedes.md");
    const status = extractStatus(content, regex);
    expect(status).toBe("Superseded");
  });

  it("extracts status from 0007-no-line-breaks-around-status.md", async () => {
    const content = await readExample("0007-no-line-breaks-around-status.md");
    const status = extractStatus(content, regex);
    expect(status).toBe("Accepted");
  });

  it("extracts status from 0008-no-following-sections-after-status.md", async () => {
    const content = await readExample("0008-no-following-sections-after-status.md");
    const status = extractStatus(content, regex);
    expect(status).toBe("Accepted");
  });

  it("extracts status from 0009-status-with-unnecessary-spaces.md", async () => {
    const content = await readExample("0009-status-with-unnecessary-spaces.md");
    const status = extractStatus(content, regex);
    expect(status).toBe("Accepted");
  });

  it("fails to extract status from 0010-empty-status.md", async () => {
    const content = await readExample("0010-empty-status.md");
    const status = extractStatus(content, regex);
    expect(status).toBeNull();
  });

  it("fails to extract status from 0011-missing-status-section.md", async () => {
    const content = await readExample("0011-missing-status-section.md");
    const status = extractStatus(content, regex);
    expect(status).toBeNull();
  });
});

describe("replaceLinks", () => {
  const baseUrl = "https://github.com/yujiosaka/adr-sync/blob/main/";
  const adrDir = "docs/adr";

  it("does not replace links in 0001-accepted.md", async () => {
    const content = await readExample("0001-accepted.md");
    const result = replaceLinks(content, baseUrl, adrDir);

    expect(result).toBe(content);
  });

  it("replaces relative path links in 0005-superseded-supersedes.md", async () => {
    const content = await readExample("0005-superseded-supersedes.md");
    const result = replaceLinks(content, baseUrl, adrDir);

    expect(result).toContain(
      "[5. Accepted supersedes](https://github.com/yujiosaka/adr-sync/blob/main/docs/adr/0005-accepted-supersedes.md)",
    );
    expect(result).toContain("[4. Superseded](https://github.com/yujiosaka/adr-sync/blob/main/docs/adr/0004-superseded.md)");
  });

  it("replaces relative path links to higher directory in 0012-relative-path-link.md", async () => {
    const content = await readExample("0012-relative-path-link.md");
    const result = replaceLinks(content, baseUrl, adrDir);

    expect(result).toContain("[README](https://github.com/yujiosaka/adr-sync/blob/main/README.md)");
  });

  it("replaces absolute path links in 0013-absolute-path-link.md", async () => {
    const content = await readExample("0013-absolute-path-link.md");
    const result = replaceLinks(content, baseUrl, adrDir);

    expect(result).toContain("[README](https://github.com/yujiosaka/adr-sync/blob/main/README.md)");
  });

  it("does not replace absolute URL links in 0014-absolute-url-link.md", async () => {
    const content = await readExample("0014-absolute-url-link.md");
    const result = replaceLinks(content, baseUrl, adrDir);

    expect(result).toContain("[GITHUB](https://github.com/yujiosaka/adr-sync)");
  });
});

describe("generateAuthor", () => {
  it("generates GitHub login when it's provided", () => {
    const result = generateAuthor({ login: "yujiosaka" } as Author, null);
    expect(result).toBe("@yujiosaka");
  });

  it("generates commit author when both name and email are provided", () => {
    const result = generateAuthor(null, { name: "Yuji Isobe", email: "yujisobe@gmail.com" });
    expect(result).toBe("Yuji Isobe <yujisobe@gmail.com>");
  });

  it("generates commit author when only name is provided", () => {
    const result = generateAuthor(null, { name: "Yuji Isobe" });
    expect(result).toBe("Yuji Isobe");
  });

  it("generates null if neither login nor commit author is provided", () => {
    const result = generateAuthor(null, null);
    expect(result).toBeNull();
  });
});

describe("generateComment", () => {
  it("generates a comment with author and commit URL", () => {
    const result = generateComment({ author: "Yuji Isobe", url: "https://github.com/commit/1" });
    expect(result).toBe("This ADR was authored by Yuji Isobe. You can view the commit [here](https://github.com/commit/1).");
  });

  it("generates a comment with only author if no URL is provided", () => {
    const result = generateComment({ author: "Yuji Isobe", url: null });
    expect(result).toBe("This ADR was authored by Yuji Isobe.");
  });

  it("generates a comment with only the commit URL if no author is provided", () => {
    const result = generateComment({ author: null, url: "https://github.com/commit/1" });
    expect(result).toBe("You can view the commit [here](https://github.com/commit/1).");
  });

  it("generates null if neither author nor URL is provided", () => {
    const result = generateComment({ author: null, url: null });
    expect(result).toBe(null);
  });
});

describe("randomColor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a valid 6-character hexadecimal color code", { repeats: 1000 }, () => {
    const color = randomColor();
    expect(color).toMatch(/^[0-9a-f]{6}$/);
  });

  it('returns "000000" when Math.random returning 0', () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const color = randomColor();
    expect(color).toBe("000000");
  });

  it('returns "ffffff" when Math.random returning 1', () => {
    vi.spyOn(Math, "random").mockReturnValue(1);

    const color = randomColor();
    expect(color).toBe("ffffff");
  });
});
