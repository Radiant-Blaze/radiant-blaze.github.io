import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { selectRelatedWriteups } from "../src/lib/related-content.ts";

const current = {
  ctfId: "event-a",
  challengeFile: "current.md",
  title: "Current challenge",
  category: "Crypto",
  tags: ["xor", "rsa"],
  eventTitle: "Event A",
  date: "2026-01-10",
};

const candidates = [
  { ...current, challengeFile: "same-event.md", title: "Same event", category: "Misc", tags: [], date: "2026-01-09" },
  { ...current, ctfId: "event-b", challengeFile: "same-tag.md", title: "Same tag", category: "Web", tags: ["xor"], date: "2026-02-01" },
  { ...current, ctfId: "event-c", challengeFile: "same-both.md", title: "Same tag and category", category: "Crypto", tags: ["rsa"], date: "2026-03-01" },
  { ...current, ctfId: "event-d", challengeFile: "unrelated.md", title: "Unrelated", category: "Pwn", tags: ["heap"], date: "2026-04-01" },
  { ...current, ctfId: "event-e", challengeFile: "excluded.md", title: "Excluded", category: "Crypto", tags: ["xor"], date: "2026-05-01" },
];

const related = selectRelatedWriteups(current, candidates, {
  limit: 3,
  exclude: [{ ctfId: "event-e", challengeFile: "excluded.md" }],
});

assert.deepEqual(
  related.map((item) => item.challengeFile),
  ["same-both.md", "same-tag.md", "same-event.md"],
  "shared tags rank first, then category, then event; exclusions and unrelated entries are dropped",
);
assert.equal(selectRelatedWriteups(current, candidates, { limit: 1 }).length, 1, "limit is respected");
assert.equal(selectRelatedWriteups(current, candidates, { limit: 1 }).length, 1, "limit is respected");

const rankCurrent = {
  ctfId: "event-current",
  challengeFile: "current.md",
  title: "Current",
  category: "Crypto",
  tags: ["xor"],
  eventTitle: "Current Event",
  date: "2026-01-10",
};
const rankCandidates = [
  { ...rankCurrent, ctfId: "event-tag", challengeFile: "tag-only.md", title: "Tag only", category: "Web", tags: ["xor"], date: "2026-01-01" },
  { ...rankCurrent, ctfId: "event-current", challengeFile: "category-event.md", title: "Category and event", category: "Crypto", tags: [], date: "2026-06-01" },
  { ...rankCurrent, challengeFile: "current.md", title: "Current duplicate", tags: ["xor", "rsa"] },
];
assert.deepEqual(
  selectRelatedWriteups(rankCurrent, rankCandidates, { limit: 2 }).map((item) => item.challengeFile),
  ["tag-only.md", "category-event.md"],
  "a shared tag outranks category-plus-event when tag counts are equal at zero or one",
);

const countCurrent = { ...rankCurrent, tags: ["xor", "rsa"] };
const countCandidates = [
  { ...rankCurrent, ctfId: "event-one", challengeFile: "one-tag.md", title: "One tag", category: "Web", tags: ["xor"], date: "2026-06-01" },
  { ...rankCurrent, ctfId: "event-two", challengeFile: "two-tags.md", title: "Two tags", category: "Web", tags: ["xor", "rsa"], date: "2026-01-01" },
];
assert.deepEqual(
  selectRelatedWriteups(countCurrent, countCandidates).map((item) => item.challengeFile),
  ["two-tags.md", "one-tag.md"],
  "more shared tags rank higher regardless of date",
);

const categoryCurrent = { ...rankCurrent, tags: ["xor"] };
const categoryCandidates = [
  { ...rankCurrent, ctfId: "event-other", challengeFile: "tag-only.md", title: "Tag only", category: "Web", tags: ["xor"], date: "2026-06-01" },
  { ...rankCurrent, ctfId: "event-current", challengeFile: "tag-category.md", title: "Tag and category", category: "Crypto", tags: ["xor"], date: "2026-01-01" },
];
assert.deepEqual(
  selectRelatedWriteups(categoryCurrent, categoryCandidates).map((item) => item.challengeFile),
  ["tag-category.md", "tag-only.md"],
  "with equal tag counts, category match ranks higher",
);

const eventCandidates = [
  { ...rankCurrent, ctfId: "event-other", challengeFile: "tag-category-only.md", title: "Tag and category only", category: "Crypto", tags: ["xor"], date: "2026-06-01" },
  { ...rankCurrent, ctfId: "event-current", challengeFile: "tag-category-event.md", title: "Tag, category, and event", category: "Crypto", tags: ["xor"], date: "2026-01-01" },
];
assert.deepEqual(
  selectRelatedWriteups(rankCurrent, eventCandidates).map((item) => item.challengeFile),
  ["tag-category-event.md", "tag-category-only.md"],
  "with equal tags and category, event match ranks higher",
);

const tieCandidates = [
  { ...rankCurrent, ctfId: "event-other", challengeFile: "older.md", title: "Zulu", category: "Web", tags: ["xor"], date: "2026-01-01" },
  { ...rankCurrent, ctfId: "event-other", challengeFile: "newer.md", title: "Alpha", category: "Web", tags: ["xor"], date: "2026-02-01" },
  { ...rankCurrent, ctfId: "event-other", challengeFile: "same-date-b.md", title: "Beta", category: "Web", tags: ["xor"], date: "2026-02-01" },
  { ...rankCurrent, ctfId: "event-other", challengeFile: "same-date-a.md", title: "Able", category: "Web", tags: ["xor"], date: "2026-02-01" },
];
assert.deepEqual(
  selectRelatedWriteups(rankCurrent, tieCandidates).map((item) => item.challengeFile),
  ["same-date-a.md", "newer.md", "same-date-b.md", "older.md"],
  "complete ties use deterministic date and title ordering",
);

assert.deepEqual(
  selectRelatedWriteups(rankCurrent, rankCandidates).filter((item) => item.challengeFile === "current.md"),
  [],
  "the current writeup is excluded even when it matches",
);
assert.deepEqual(selectRelatedWriteups(rankCurrent, []), [], "empty candidate selection is valid");

const sparse = selectRelatedWriteups(
  { ...current, tags: [], category: undefined },
  [{ ...current, challengeFile: "other.md", tags: [], category: undefined }],
);
assert.deepEqual(sparse.map((item) => item.challengeFile), ["other.md"], "same-event fallback survives sparse metadata");

const isolated = selectRelatedWriteups(
  { ...current, tags: [], category: undefined },
  [{ ...current, ctfId: "event-z", challengeFile: "other.md", tags: [], category: undefined }],
);
assert.deepEqual(isolated, [], "unrelated sparse entries do not invent a relationship");

const built = await readFile(
  path.join("dist", "generated", "writeups", "Digital-Pakistan-Red-Team-CTF", "spec-warden.html"),
  "utf8",
);
assert.match(built, /class="related-challenges"/, "writeup page renders the related-challenge block");
assert.match(built, /RELATED CHALLENGES/, "related-challenge heading is present");
assert.doesNotMatch(
  built.slice(built.indexOf("related-challenges")),
  /spec-warden\.html/,
  "the current writeup is not linked as related",
);

console.log(JSON.stringify({
  selected: related.map((item) => item.challengeFile),
  sparseFallback: sparse.map((item) => item.challengeFile),
  isolated: isolated.length,
  builtBlock: true,
  failures: 0,
}, null, 2));
