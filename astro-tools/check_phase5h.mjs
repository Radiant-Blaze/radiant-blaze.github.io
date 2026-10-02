import assert from "node:assert/strict";
import { pageSlice, searchableText } from "../assets/js/list-utils.js";
import {
  buildGlobalRecords,
  filterGlobalRecords,
  matchesBlogPost,
} from "../assets/js/astro-query-model.js";
import { getJson, getText, searchText } from "./read-model-test-utils.mjs";

const model = await getJson("/content/runtime-read-model.json");
const globalRecords = buildGlobalRecords(model.posts, model.ctfs);
const legacyRecords = [
  ...model.posts.map((item) => ({ type: "post", item, date: item.date })),
  ...model.ctfs.flatMap((ctf) => ctf.challenges.map((item) => ({ type: "writeup", item, ctf, date: ctf.date }))),
].sort((left, right) => new Date(`${right.date}T00:00:00`) - new Date(`${left.date}T00:00:00`));
assert.deepEqual(globalRecords, legacyRecords, "global record ordering/form must match legacy logic");

const legacyBlogMatches = (post, term) =>
  searchableText(post.title, post.description, post.category, post.tags || [], post.author, post.body).includes(term);
const legacyGlobalMatches = (record, filters) => {
  const { item, ctf } = record;
  const term = filters.query.trim().toLowerCase();
  const searchable = `${item.title} ${item.description || ""} ${item.category || ""} ${(item.tags || []).join(" ")} ${ctf?.title || ""}`.toLowerCase();
  const matchesQuery = !term || searchable.includes(term);
  const matchesYear = !filters.year || new Date(`${record.date}T00:00:00`).getFullYear() === Number(filters.year);
  const matchesType = filters.type === "all" || (filters.type === "posts" && record.type === "post") || (filters.type === "writeups" && record.type === "writeup");
  const tagText = [(item.category || ""), ...(item.tags || []), (ctf?.title || "")].join(" ").toLowerCase();
  const matchesTopic = filters.topic === "all" || tagText.includes(filters.topic.toLowerCase());
  return matchesQuery && matchesYear && matchesType && matchesTopic;
};

const post = model.posts[0];
const bodyOnlyTerm = post.body.toLowerCase().match(/[a-z]{6,}/g)?.find((term) =>
  !searchText(post.title, post.description, post.category, post.tags, post.author).includes(term),
);
assert.ok(bodyOnlyTerm, "blog source has a body-only term");
const blogTerms = [post.title, post.description, post.category, post.tags[0], post.author, bodyOnlyTerm]
  .filter(Boolean)
  .map((value) => String(value).split(/\s+/)[0].toLowerCase());
for (const term of blogTerms) {
  assert.equal(matchesBlogPost(post, term), legacyBlogMatches(post, term), `blog query ${term}`);
}

const challenge = model.ctfs.flatMap((ctf) => ctf.challenges.map((item) => ({ ctf, item })))[0];
const challengeBodyTerm = challenge.item.body.toLowerCase().match(/[a-z]{7,}/g)?.find((term) =>
  !searchText(challenge.item.title, challenge.item.description, challenge.item.category, challenge.item.tags, challenge.item.points, challenge.ctf.title, challenge.ctf.event).includes(term),
);
assert.ok(challengeBodyTerm, "CTF corpus has a body-only query");

const filterCases = [
  { query: "", type: "all", topic: "all", year: "" },
  { query: globalRecords[0].item.title.split(/\s+/)[0], type: "all", topic: "all", year: "" },
  { query: "", type: "posts", topic: "all", year: "" },
  { query: "", type: "writeups", topic: "crypto", year: "2026" },
  { query: "", type: "all", topic: "crypto", year: "2025" },
  { query: "body-only-no-match-5h", type: "all", topic: "all", year: "" },
  { query: bodyOnlyTerm, type: "all", topic: "all", year: "" },
];
for (const filters of filterCases) {
  const expected = legacyRecords.filter((record) => legacyGlobalMatches(record, filters));
  assert.deepEqual(filterGlobalRecords(globalRecords, filters), expected, JSON.stringify(filters));
}
assert.equal(filterGlobalRecords(globalRecords, { query: challengeBodyTerm, type: "all", topic: "all", year: "" }).length, 0, "global search remains body-excluding");
assert.ok(pageSlice(globalRecords, 1).shown.length === 5);
assert.ok(pageSlice(globalRecords, 4).currentPage === 4);
assert.ok(pageSlice(globalRecords, 999).currentPage === Math.ceil(globalRecords.length / 5));

const searchShell = await getText("/pages/search.html");
assert.ok(searchShell.includes("astro-pages.js"));
assert.ok(!searchShell.includes("/assets/js/blog.js"));

console.log(JSON.stringify({
  globalRecords: globalRecords.length,
  stableSortMatchesLegacy: true,
  blogFieldsCompared: ["title", "description", "category", "tag", "author", "body"],
  globalFiltersCompared: filterCases.length,
  globalBodyExcluded: true,
  paginationAndNoResults: true,
  astroSearchControllerPrimary: true,
  failures: 0,
}, null, 2));