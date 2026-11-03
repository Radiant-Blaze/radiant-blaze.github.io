import assert from "node:assert/strict";
import {
  buildYearIndex,
  filterGlobalRecords,
  getRecordYear,
} from "../assets/js/astro-query-model.js";

const records = [
  { type: "post", date: "2026-03-10", item: { title: "Toolkit", category: "Linux", tags: ["terminal"] } },
  { type: "writeup", date: "2026-03-11", item: { title: "Cipher", category: "Crypto", tags: ["math"] }, ctf: { title: "Spring CTF" } },
  { type: "post", date: "2025-08-02", item: { title: "Old notes", category: "Linux", tags: ["terminal"] } },
  { type: "post", item: { title: "No date", category: "Misc", tags: [] } },
  { type: "post", date: "not-a-date", item: { title: "Bad date", category: "Misc", tags: [] } },
];

assert.deepEqual(buildYearIndex(records), [
  { year: 2026, count: 2 },
  { year: 2025, count: 1 },
]);
assert.deepEqual(buildYearIndex(records.slice(3)), []);
assert.equal(getRecordYear(records[3]), null);
assert.equal(getRecordYear(records[4]), null);
assert.equal(filterGlobalRecords(records, { query: "", year: "2026" }).length, 2);
assert.equal(filterGlobalRecords(records, { query: "", year: "2024" }).length, 0);
assert.equal(filterGlobalRecords(records, { query: "cipher", year: "2026" }).length, 1);
assert.equal(filterGlobalRecords(records, { query: "", type: "posts", year: "2026" }).length, 1);
assert.equal(filterGlobalRecords(records, { query: "", topic: "terminal", year: "2026" }).length, 1);
assert.equal(filterGlobalRecords(records, { query: "", year: "20xx" }).length, 0);

console.log("Year index and combined search filters verified.");
