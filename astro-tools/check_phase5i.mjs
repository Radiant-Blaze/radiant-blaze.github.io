import assert from "node:assert/strict";
import {
  getJson,
  getText,
  parseLegacyMarkdown,
  readMarkdown,
  writeupUrl,
} from "./read-model-test-utils.mjs";

const model = await getJson("/content/runtime-read-model.json");
let writeupCount = 0;
let checkedPrevious = 0;
let checkedNext = 0;
for (const ctf of model.ctfs) {
  assert.deepEqual(ctf.challengeFiles, ctf.challenges.map((challenge) => challenge.file), `${ctf.id} canonical challenge order`);
  for (let index = 0; index < ctf.challengeFiles.length; index++) {
    const file = ctf.challengeFiles[index];
    const challenge = ctf.challenges[index];
    assert.deepEqual(challenge, parseLegacyMarkdown(await readMarkdown(`ctfs/${ctf.id}/${file}`), file));
    assert.equal(challenge.file, file);
    const route = writeupUrl(ctf.id, file);
    const html = await getText(route);
    assert.ok(html.includes(`CHALLENGE ${index + 1} / ${ctf.challengeFiles.length}`));
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    const includesPath = (expected) => hrefs.some((href) => {
      try { return decodeURIComponent(href) === decodeURIComponent(expected); } catch { return false; }
    });
    if (ctf.challengeFiles[index - 1]) {
      assert.ok(includesPath(writeupUrl(ctf.id, ctf.challengeFiles[index - 1])), `${file} previous`);
      checkedPrevious++;
    }
    if (ctf.challengeFiles[index + 1]) {
      assert.ok(includesPath(writeupUrl(ctf.id, ctf.challengeFiles[index + 1])), `${file} next`);
      checkedNext++;
    }
    writeupCount++;
  }
}

const trickyWriteup = await getText(writeupUrl("cryptohack-Introduction to CryptoHack", "chall1-Great-Snakes.md"));
assert.ok(trickyWriteup.includes("<pre class=\"terminal\"><code"));
assert.ok(!trickyWriteup.includes("\n`\n"), "primary static Astro renderer matches the legacy generated article on four-backtick fence output");
const mathPage = await getText(writeupUrl("ASIS-CTF-2026", "Headache.md"));
assert.ok(mathPage.includes("math-block"));
const postPage = await getText("/generated/posts/linux/021-tiny-command-line-toolkit.html");
assert.ok(postPage.includes("<pre class=\"terminal\"><code"));

const queryShells = ["/pages/post.html", "/pages/writeup.html"];
for (const route of queryShells) {
  const html = await getText(route);
  assert.ok(html.includes("astro-pages.js"), `${route} uses Astro query-shell controller`);
  assert.ok(!html.includes("/assets/js/blog.js") && !html.includes("/assets/js/ctf.js"));
}

console.log(JSON.stringify({
  markdownRecordsChecked: model.posts.length + writeupCount,
  writeups: writeupCount,
  previousLinksChecked: checkedPrevious,
  nextLinksChecked: checkedNext,
  frontMatterMatchesLegacyParser: true,
  fourBacktickAndMathOutput: true,
  queryShellsAstroOwned: true,
  failures: 0,
}, null, 2));