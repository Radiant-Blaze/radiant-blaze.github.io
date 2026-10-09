import assert from "node:assert/strict";
import { calculatePlayerStats, countWords } from "../src/lib/player-stats.ts";

assert.equal(countWords("---\ntitle: ignored\n---\nOne two\n```js\nignored code\n```"), 2);

const stats = calculatePlayerStats({
  posts: [
    { body: "one two", category: "Linux", tags: ["shell"], date: "2026-10-08" },
    { body: "three", category: "Linux", tags: [], date: "2026-10-09" },
  ],
  ctfs: [
    { id: "event-a", date: "2026-10-07", challenges: [{ body: "four five", category: "crypto", tags: [] }] },
  ],
});

assert.equal(stats.blogPosts, 2);
assert.equal(stats.writeups, 1);
assert.equal(stats.totalArticles, 3);
assert.equal(stats.wordsWritten, 5);
assert.equal(stats.xp, 350);
assert.equal(stats.level, 1);
assert.equal(stats.currentStreak, 3);
assert.equal(stats.categoryCounts.CRYPTO, 1);
console.log("player stats calculations passed");
