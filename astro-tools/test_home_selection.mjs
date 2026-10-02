import assert from "node:assert/strict";
import {
  homePostPageUrl,
  homeWriteupPageUrl,
  selectHomepageProjection,
} from "../src/lib/home-selection.ts";

const feature = (type, title, date) => ({
  type,
  title,
  description: title,
  href: `/${title}`,
  date: new Date(`${date}T00:00:00Z`),
  category: "TEST",
});

const posts = [
  feature("POST", "post-index-first", "2026-09-01"),
  feature("POST", "post-index-second", "2026-09-01"),
];
const writeups = [
  feature("WRITEUP", "event-order-first-challenge-first", "2026-08-01"),
  feature("WRITEUP", "event-order-first-challenge-second", "2026-08-01"),
  feature("WRITEUP", "event-order-second", "2026-08-01"),
];
const projection = selectHomepageProjection(posts, writeups);

assert.equal(projection.latestPost.title, "post-index-first");
assert.equal(projection.latestWriteup.title, "event-order-first-challenge-first");
assert.equal(projection.featured, projection.latestWriteup);
assert.equal(selectHomepageProjection([], []).featured, null);
assert.equal(
  homePostPageUrl("linux/a post & note.md"),
  "/generated/posts/linux/a%20post%20%26%20note.html",
);
assert.equal(
  homeWriteupPageUrl("cryptohack Intro", "chall10-Adrien's-Signs.md"),
  "/generated/writeups/cryptohack%20Intro/chall10-Adrien's-Signs.html",
);

console.log("Homepage selection fixtures passed: stable ordering, writeup preference, empty input, and legacy URL encoding.");