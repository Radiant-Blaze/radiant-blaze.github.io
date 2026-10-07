import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const routes = JSON.parse(await readFile(path.join(root, "dist/astro-article-order.json"), "utf8"));
const posts = JSON.parse(await readFile(path.join(root, "content/posts/index.json"), "utf8"));
const ctfs = JSON.parse(await readFile(path.join(root, "content/ctfs/index.json"), "utf8"));
const expected = posts.posts.map((file) => `generated/posts/${file.replace(/\.md$/i, ".html")}`);
for (const id of ctfs.ctfs) {
  const event = JSON.parse(await readFile(path.join(root, "content/ctfs", id, "ctf.json"), "utf8"));
  expected.push(...event.challenges.map((file) => `generated/writeups/${id}/${file.replace(/\.md$/i, ".html")}`));
}
assert.deepEqual(routes, expected);
assert.equal(new Set(routes).size, routes.length);
console.log(`Astro route parity passed: ${routes.length} article/writeup routes.`);
