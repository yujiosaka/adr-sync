import * as fs from "node:fs/promises";
import * as path from "node:path";

const examplesDir = path.join(__dirname, "examples");

export async function readExample(filename: string): Promise<string> {
  return fs.readFile(path.join(examplesDir, filename), "utf8");
}
