import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { contentRoot, root, orderedDiscovered, compareNatural, markdownFiles, readJson } from "./discover-content.mjs";
import { validateIndex, validatePost } from "./validate-content.mjs";

const postsIndexFile = path.join(contentRoot, "posts/index.json");
const ctfsIndexFile = path.join(contentRoot, "ctfs/index.json");
const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
async function allPosts(dir, prefix = "") {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await allPosts(file, `${prefix}${entry.name}/`));
    else if (entry.name.endsWith(".md")) result.push(`${prefix}${entry.name}`);
  }
  return result.sort(compareNatural);
}
async function desired() {
  const postsIndex = await readJson(postsIndexFile); validateIndex(postsIndex, "posts", postsIndexFile);
  const postFiles = await allPosts(path.join(contentRoot, "posts"));
  for (const file of postFiles) await validatePost(path.join(contentRoot, "posts", file));
  const ctfIndex = await readJson(ctfsIndexFile); validateIndex(ctfIndex, "ctfs", ctfsIndexFile);
  const eventEntries = (await readdir(path.join(contentRoot, "ctfs"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => compareNatural(a.name, b.name));
  const eventIds = []; const events = [];
  for (const entry of eventEntries) {
    const file = path.join(contentRoot, "ctfs", entry.name, "ctf.json");
    try { const metadata = JSON.parse(await readFile(file, "utf8")); const discovered = await markdownFiles(path.dirname(file)); if (!metadata.title || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.date) || !Array.isArray(metadata.challenges)) throw new Error(`${path.relative(root, file)}: invalid event metadata`); eventIds.push(entry.name); events.push([file, { ...metadata, challenges: orderedDiscovered(metadata.challenges, discovered) }]); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return { [postsIndexFile]: { ...postsIndex, posts: orderedDiscovered(postsIndex.posts, postFiles) }, [ctfsIndexFile]: { ...ctfIndex, ctfs: orderedDiscovered(ctfIndex.ctfs, eventIds) }, ...Object.fromEntries(events) };
}
const targets = await desired();
const changed = [];
for (const [file, value] of Object.entries(targets)) if (JSON.stringify(await readJson(file)) !== JSON.stringify(value)) changed.push([file, value]);
if (process.argv.includes("--check")) {
  if (changed.length) { console.error(`Content synchronization required for: ${changed.map(([file]) => path.relative(root, file)).join(", ")}`); process.exitCode = 1; }
  else console.log("Content synchronization check passed.");
} else {
  for (const [file, value] of changed) await writeFile(file, stable(value), "utf8");
  console.log(`Content synchronization complete (${changed.length} file(s) updated).`);
}
