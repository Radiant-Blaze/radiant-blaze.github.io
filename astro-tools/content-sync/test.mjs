import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { contentRoot, orderedDiscovered, root } from "./discover-content.mjs";

assert.deepEqual(orderedDiscovered(["b.md", "missing.md"], ["a.md", "b.md", "c.md"]), ["b.md", "a.md", "c.md"]);
const target = path.join(contentRoot, "posts/index.json");
const original = await readFile(target, "utf8");
const modified = JSON.parse(original); modified.posts = [...modified.posts, "intentionally-modified.md"];
assert.notDeepEqual(modified, JSON.parse(original));
assert.notDeepEqual(orderedDiscovered(modified.posts, ["linux/021-tiny-command-line-toolkit.md"]), modified.posts);
await writeFile(target, original);
console.log("Content synchronization tests passed.");
