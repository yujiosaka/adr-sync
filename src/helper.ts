import { join } from "node:path";
import type { Author, Commit, CommitAuthor, Sender } from "./shared";

const RELATIVE_LINK_REGEX = /\[([^\]]+)\]\(((?!\/|https?:\/\/)[^)]+)\)/g; // Relative paths that don't start with `/` or `http(s)://`
const ABSOLUTE_PATH_REGEX = /\[([^\]]+)\]\((\/[^)]+)\)/g; // Absolute paths from the root directory

export function extractStatus(content: string, regex: RegExp): string | null {
  const match = content.match(regex);
  if (!match) return null;

  return match[1].trim() || null;
}

export function replaceLinks(content: string, baseUrl: string, adrDir: string): string {
  return content
    .replace(RELATIVE_LINK_REGEX, (_, text, path) => {
      const adrDirPath = join(`${adrDir}/`, path);
      const url = new URL(adrDirPath, baseUrl);
      return `[${text}](${url})`;
    })
    .replace(ABSOLUTE_PATH_REGEX, (_, text, path) => {
      const relativePath = path.substring(1);
      const url = new URL(relativePath, baseUrl);
      return `[${text}](${url})`;
    });
}

export function generateAuthor(senderOrAuthor: Sender | Author, commitAuthor: CommitAuthor): string | null {
  let author: string | null = null;

  if (senderOrAuthor) {
    author = `@${senderOrAuthor.login}`;
  } else if (commitAuthor?.name && commitAuthor?.email) {
    author = `${commitAuthor.name} <${commitAuthor.email}>`;
  } else if (commitAuthor?.name) {
    author = commitAuthor.name;
  }

  return author;
}

export function generateComment(commit: Commit): string | null {
  const sentences = [];

  if (commit.author) {
    sentences.push(`This ADR was authored by ${commit.author}.`);
  }
  if (commit.url) {
    sentences.push(`You can view the commit [here](${commit.url}).`);
  }
  if (!sentences.length) return null;

  return sentences.join(" ");
}

// See https://stackoverflow.com/a/25821830
export function randomColor() {
  return Math.floor(Math.random() * 16777215)
    .toString(16)
    .padStart(6, "0");
}
