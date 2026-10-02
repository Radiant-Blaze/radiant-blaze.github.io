import assert from "node:assert/strict";
import { pageSlice } from "../assets/js/list-utils.js";
import {
  getJson,
  parseLegacyMarkdown,
  readJson,
  readMarkdown,
  searchText,
} from "./read-model-test-utils.mjs";

const model = await getJson("/content/runtime-read-model.json");
const postIndex = await readJson("content/posts/index.json");
const ctfIndex = await readJson("content/ctfs/index.json");
const posts = model.posts;
const writeups = model.ctfs.flatMap((ctf) =>
  ctf.challenges.map((challenge) => ({ ctf, challenge })),
);
const globalRecords = [
  ...posts.map((item) => ({ type: "post", item, date: item.date })),
  ...writeups.map(({ ctf, challenge: item }) => ({ type: "writeup", item, ctf, date: ctf.date })),
].sort((left, right) => new Date(`${right.date}T00:00:00`) - new Date(`${left.date}T00:00:00`));

const globalText = (record) => searchText(
  record.item.title,
  record.item.description,
  record.item.category,
  record.item.tags || [],
  record.ctf?.title || "",
);
const matchesGlobal = (record, query, { type = "all", topic = "all", selectedYear = "" } = {}) => {
  const typeMatch = type === "all" || record.type === type;
  const topicMatch = topic === "all" || searchText(
    record.item.category || "",
    record.item.tags || [],
    record.ctf?.title || "",
  ).includes(topic.toLowerCase());
  const yearMatch = !selectedYear || year(record) === Number(selectedYear);
  return typeMatch && topicMatch && yearMatch && (!query || globalText(record).includes(query.toLowerCase()));
};
const blogText = (post) => searchText(
  post.title,
  post.description,
  post.category,
  post.tags || [],
  post.author,
  post.body,
);
const ctfText = (ctf, challenge) => searchText(
  challenge.title,
  challenge.description,
  challenge.category,
  challenge.tags || [],
  challenge.points,
  challenge.body,
  ctf.title,
  ctf.event,
);

const bodyOnlyTerm = writeups
  .flatMap(({ ctf, challenge }) => challenge.body.toLowerCase().match(/[a-z]{7,}/g)?.map((term) => ({ ctf, challenge, term })) || [])
  .find(({ ctf, challenge, term }) => !globalText({ item: challenge, ctf }).includes(term));
assert.ok(bodyOnlyTerm, "a CTF body-only search term should exist");
assert.ok(ctfText(bodyOnlyTerm.ctf, bodyOnlyTerm.challenge).includes(bodyOnlyTerm.term));
assert.ok(!globalRecords.some((record) => globalText(record).includes(bodyOnlyTerm.term)));

const firstPost = posts[0];
for (const [field, value] of [
  ["title", firstPost.title],
  ["description", firstPost.description],
  ["category", firstPost.category],
  ["tag", firstPost.tags[0]],
  ["author", firstPost.author],
]) {
  if (value) assert.ok(blogText(firstPost).includes(String(value).toLowerCase()), `${field} is searchable`);
}

const firstCtf = model.ctfs[0];
const firstChallenge = firstCtf.challenges[0];
assert.ok(ctfText(firstCtf, firstChallenge).includes(firstCtf.title.toLowerCase()));
assert.ok(ctfText(firstCtf, firstChallenge).includes(firstChallenge.body.toLowerCase().match(/[a-z]{7,}/)?.[0] || ""));
assert.equal(globalRecords.filter((record) => globalText(record).includes("no-such-phase5g-query-79c1")).length, 0);

for (const [field, value] of [
  ["title", firstChallenge.title],
  ["description", firstChallenge.description],
  ["category", firstChallenge.category],
  ["tag", firstChallenge.tags[0]],
  ["points", firstChallenge.points],
  ["event", firstCtf.title],
  ["organizer", firstCtf.event],
]) {
  if (value) assert.ok(ctfText(firstCtf, firstChallenge).includes(String(value).toLowerCase()), `CTF ${field} search`);
}

const topic = (record, selected) => searchText(
  record.item.category || "",
  record.item.tags || [],
  record.ctf?.title || "",
).includes(selected.toLowerCase());
const year = (record) => new Date(`${record.date}T00:00:00`).getFullYear();
assert.ok(globalRecords.some((record) => topic(record, "crypto")));
assert.ok(globalRecords.some((record) => year(record) === 2026));
assert.equal(globalRecords.filter((record) => matchesGlobal(record, "", { type: "post" })).length, posts.length);
assert.equal(globalRecords.filter((record) => matchesGlobal(record, "", { type: "writeup" })).length, writeups.length);
assert.ok(globalRecords.some((record) => matchesGlobal(record, "", { topic: "crypto", selectedYear: "2026" })));
assert.equal(globalRecords.filter((record) => matchesGlobal(record, "", { selectedYear: "2025" })).length, 0);
assert.equal(globalRecords.filter((record) => matchesGlobal(record, "no-such-phase5g-query-79c1")).length, 0);
assert.deepEqual(pageSlice(globalRecords, 999).shown.length, globalRecords.length % 5 || 5);
assert.deepEqual(pageSlice([], 999).shown, []);
assert.deepEqual(posts.map((post) => post.file), postIndex.posts);
assert.deepEqual(model.ctfs.map((ctf) => ctf.id), ctfIndex.ctfs);

const legacyPost = parseLegacyMarkdown(await readMarkdown(`posts/${firstPost.file}`), firstPost.file);
assert.deepEqual(firstPost, legacyPost);

console.log(JSON.stringify({
  globalRecords: globalRecords.length,
  blogBodyTerm: "included",
  globalSearchBodyTerm: "excluded",
  ctfBodySearchTerm: bodyOnlyTerm.term,
  titleDescriptionCategoryTagAuthor: "included in blog projection",
  eventTitleTopicYearAndNoResults: "verified",
  multiplePages: Math.ceil(globalRecords.length / 5),
  invalidPageClamped: true,
  sourceIndexOrders: "preserved",
  failures: 0,
}, null, 2));