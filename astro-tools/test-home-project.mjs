import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "js-yaml";
import { portfolioProjectRoute } from "../src/lib/portfolio-data.ts";

const root = process.cwd();
const output = await readFile(path.join(root, "dist/index.html"), "utf8");
const contentRoot = path.join(root, "content/portfolio");

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files;
}

const projects = [];
for (const file of await markdownFiles(contentRoot)) {
  const source = await readFile(file, "utf8");
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) continue;
  const data = load(match[1]);
  if (data.type === "project" && data.published !== false) {
    projects.push({ data, id: path.relative(contentRoot, file).replace(/\\/g, "/") });
  }
}

assert.match(output, /class="hero-actions"/, "homepage exposes primary entry actions");
assert.match(output, /EXPLORE CTFS/, "homepage links to CTF discovery");
assert.match(output, /VIEW PORTFOLIO/, "homepage links to the portfolio");
assert.match(output, /data-latest-post/, "existing latest-content tile is preserved");

if (projects.length > 0) {
  const project = projects.sort((left, right) => Number(right.data.featured) - Number(left.data.featured) || left.data.order - right.data.order)[0];
  assert.match(output, /class="home-project(?: |")/, "homepage renders the selected project section");
  assert.match(output, new RegExp(`href="${portfolioProjectRoute(project)}"`), "selected project links to its detail route");
  assert.ok(output.includes(project.data.title), "selected project title comes from content");
} else {
  assert.doesNotMatch(output, /class="home-project(?: |")/, "empty portfolio omits the project section");
}

console.log(JSON.stringify({
  projectSection: projects.length > 0,
  projectCount: projects.length,
  heroActions: true,
  latestTile: true,
  failures: 0,
}, null, 2));
