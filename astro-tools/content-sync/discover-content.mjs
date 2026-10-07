import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

export const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const contentRoot = path.join(root, "content");
export const compareNatural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
export const orderedDiscovered = (existing, discovered) => {
  const available = new Set(discovered);
  const retained = [...new Set(existing.filter((item) => available.has(item)))];
  return [...retained, ...discovered.filter((item) => !retained.includes(item)).sort(compareNatural)];
};
export async function readJson(file) { return JSON.parse(await readFile(file, "utf8")); }
export async function readFrontmatter(file) {
  const source = await readFile(file, "utf8");
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) throw new Error(`${path.relative(root, file)}: missing YAML frontmatter`);
  const data = yaml.load(match[1]);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${path.relative(root, file)}: frontmatter must be a mapping`);
  return { data, body: source.slice(match[0].length) };
}
export async function markdownFiles(directory) {
  return (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort(compareNatural);
}
