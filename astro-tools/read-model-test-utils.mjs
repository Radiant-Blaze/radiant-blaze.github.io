import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PREVIEW = process.env.ASTRO_PREVIEW_URL || "http://127.0.0.1:4322";

export async function getJson(route) {
  const response = await fetch(`${PREVIEW}${route}`);
  assert.equal(response.status, 200, `${route} should return HTTP 200`);
  return response.json();
}

export async function getText(route) {
  const response = await fetch(`${PREVIEW}${route}`);
  assert.equal(response.status, 200, `${route} should return HTTP 200`);
  return response.text();
}

export async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

export async function readMarkdown(relativePath) {
  return readFile(path.join(ROOT, "content", relativePath), "utf8");
}

export function parseLegacyMarkdown(source, file) {
  const [, frontmatter = "", body = ""] =
    source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/) || [];
  const data = Object.fromEntries(
    frontmatter.split("\n").map((line) => {
      const [key, ...value] = line.split(":");
      return [key?.trim(), value.join(":").trim().replace(/^\[|\]$/g, "")];
    }),
  );
  return {
    ...data,
    tags: data.tags?.split(",").map((tag) => tag.trim()).filter(Boolean) || [],
    body,
    file,
  };
}

export function postUrl(file) {
  const htmlFile = file.replace(/\.md$/i, ".html");
  return `/generated/posts/${htmlFile.split("/").map(encodeURIComponent).join("/")}`;
}

export function writeupUrl(ctfId, file) {
  return `/generated/writeups/${encodeURIComponent(ctfId)}/${encodeURIComponent(file.replace(/\.md$/i, ".html"))}`;
}

export function searchText(...values) {
  return values.flat().filter(Boolean).join(" ").toLowerCase();
}

export function assertDeepEqual(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
}