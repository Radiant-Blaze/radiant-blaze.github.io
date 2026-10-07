import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { convertMarkdown } from "../src/lib/markdown-converter/index.ts";

async function markdownFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(target));
    else if (entry.name.endsWith(".md")) files.push(target);
  }
  return files;
}

const files = [...await markdownFiles("content/posts"), ...await markdownFiles("content/ctfs")];
assert.ok(files.length > 0);
let converted = 0;
for (const file of files) {
  const result = convertMarkdown(await readFile(file, "utf8"));
  assert.equal(typeof result.html, "string");
  assert.ok(result.html.length > 0, file);
  converted++;
}
console.log(`Real content conversion passed: ${converted} Markdown files.`);
