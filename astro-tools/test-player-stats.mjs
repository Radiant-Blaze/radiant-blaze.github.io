import assert from "node:assert/strict";
import { calculatePlayerStats, countWords } from "../src/lib/player-stats.ts";

assert.equal(countWords("---\ntitle: ignored\n---\nOne two\n```js\nignored code\n```"), 2);

const today = new Date();
const day = (offset) => {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
  return date.toISOString().slice(0, 10);
};

const stats = calculatePlayerStats({
  posts: [
    { body: "one two", category: "Linux", tags: ["shell"], date: day(-2) },
    { body: "three", category: "Linux", tags: [], date: day(-1) },
  ],
  ctfs: [
    { id: "event-a", date: day(0), challenges: [{ body: "four five", category: "crypto", tags: [] }] },
  ],
});

assert.equal(stats.blogPosts, 2);
assert.equal(stats.writeups, 1);
assert.equal(stats.totalArticles, 3);
assert.equal(stats.wordsWritten, 5);
assert.equal(stats.xp, 350);
assert.equal(stats.level, 1);
assert.equal(stats.blogXp, 200);
assert.equal(stats.ctfXp, 150);
assert.equal(stats.blogLevelProgress, 200);
assert.equal(stats.ctfLevelProgress, 150);
assert.equal(stats.currentStreak, 3);
assert.equal(stats.ctfCurrentStreak, 1);
assert.equal(stats.categoryCounts.CRYPTO, 1);
assert.equal(stats.blogMetrics.find((item) => item.key === "xp")?.label, "BLOG XP");
assert.equal(stats.blogMetrics.find((item) => item.key === "xp")?.value, "200");
assert.equal(stats.ctfMetrics.find((item) => item.key === "xp")?.label, "CTF XP");
assert.equal(stats.ctfMetrics.find((item) => item.key === "xp")?.value, "150");
assert.equal(stats.blogMetrics.length, 7);
assert.equal(stats.ctfMetrics.length, 7);
console.log("player stats calculations passed");
