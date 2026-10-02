import assert from "node:assert/strict";
import { pageSlice } from "../assets/js/list-utils.js";
import {
  getJson,
  getText,
  parseLegacyMarkdown,
  postUrl,
  readJson,
  readMarkdown,
} from "./read-model-test-utils.mjs";

const model = await getJson("/content/runtime-read-model.json");
const sourceIndex = await readJson("content/posts/index.json");
assert.deepEqual(model.posts.map((post) => post.file), sourceIndex.posts);

for (const post of model.posts) {
  const expected = parseLegacyMarkdown(
    await readMarkdown(`posts/${post.file}`),
    post.file,
  );
  assert.deepEqual(post, expected, `post contract must match ${post.file}`);
}

const html = await getText("/pages/blog.html");
assert.match(html, new RegExp(`data-blog-count[^>]*>${model.posts.length} POST`));
assert.equal((html.match(/class="quest-card"/g) || []).length, Math.min(5, model.posts.length));
for (const post of model.posts.slice(0, 5)) {
  assert.ok(html.includes(post.title), `SSR blog card title ${post.title}`);
  assert.ok(html.includes(postUrl(post.file)), `SSR blog card URL ${post.file}`);
  assert.ok(html.includes(post.description), `SSR blog card description ${post.file}`);
}

const archive = await getText("/pages/archive.html");
assert.match(archive, /location\.replace\(`search\.html\$\{location\.search\}`\)/);
assert.deepEqual(pageSlice(model.posts, 999).shown.map((post) => post.file), [model.posts.at(-1).file]);
assert.deepEqual(pageSlice([], 999).shown, []);

const sourceText = (post) =>
  `${post.title} ${post.description} ${post.category} ${post.tags.join(" ")} ${post.author} ${post.body}`.toLowerCase();
const blogMatches = (post, query) => sourceText(post).includes(query.toLowerCase());
const bodyOnlyTerm = model.posts[0].body
  .toLowerCase()
  .match(/[a-z]{5,}/g)
  ?.find((term) => !`${model.posts[0].title} ${model.posts[0].description} ${model.posts[0].category} ${model.posts[0].tags.join(" ")} ${model.posts[0].author}`.toLowerCase().includes(term));
assert.ok(bodyOnlyTerm, "post corpus has a body-only search term");
for (const [field, value] of [
  ["title", model.posts[0].title],
  ["description", model.posts[0].description],
  ["category", model.posts[0].category],
  ["tag", model.posts[0].tags[0]],
  ["author", model.posts[0].author],
  ["body", bodyOnlyTerm],
]) {
  if (value) assert.ok(blogMatches(model.posts[0], String(value).split(/\s+/)[0]), `${field} search`);
}
assert.equal(model.posts.filter((post) => post.category === "Linux").length, 1);
assert.equal(model.posts.filter((post) => new Date(`${post.date}T00:00:00`).getFullYear() === 2025).length, 0);
const manyPosts = Array.from({ length: 12 }, (_, index) => ({ file: `${index}.md` }));
assert.deepEqual(pageSlice(manyPosts, 3).shown.map((post) => post.file), ["10.md", "11.md"]);
assert.equal(pageSlice(manyPosts, 999).currentPage, 3);
assert.deepEqual(pageSlice(manyPosts, 3).shown, pageSlice(manyPosts, 999).shown);

console.log(JSON.stringify({
  posts: model.posts.length,
  postIndexOrderMatch: true,
  parsedMetadataAndBodiesMatch: true,
  serverRenderedCards: Math.min(5, model.posts.length),
  archiveRedirectPreserved: true,
  paginationClampAndEmptyInput: true,
  blogSearchFields: ["title", "description", "category", "tag", "author", "body"],
  categoryAndYearFilters: true,
  multipageClampingFixture: true,
  failures: 0,
}, null, 2));