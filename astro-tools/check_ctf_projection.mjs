import assert from "node:assert/strict";
import { pageSlice } from "../assets/js/list-utils.js";
import {
  getJson,
  getText,
  parseLegacyMarkdown,
  readJson,
  readMarkdown,
  writeupUrl,
} from "./read-model-test-utils.mjs";

const model = await getJson("/content/runtime-read-model.json");
const sourceIndex = await readJson("content/ctfs/index.json");
assert.deepEqual(model.ctfs.map((ctf) => ctf.id), sourceIndex.ctfs);

let challengeCount = 0;
for (const ctf of model.ctfs) {
  const metadata = await readJson(`content/ctfs/${ctf.id}/ctf.json`);
  assert.deepEqual(ctf.challengeFiles, metadata.challenges, `${ctf.id} challenge source order`);
  assert.equal(ctf.challengeCount, metadata.challenges.length);
  for (const key of ["title", "event", "date", "difficulty", "url", "description"]) {
    if (Object.hasOwn(metadata, key)) assert.deepEqual(ctf[key], metadata[key], `${ctf.id}.${key}`);
  }
  assert.deepEqual(ctf.challenges.map((challenge) => challenge.file), metadata.challenges);
  if (metadata.challenges.length > 5) {
    assert.deepEqual(
      pageSlice(metadata.challenges, 2).shown,
      metadata.challenges.slice(5, 10),
      `${ctf.id} challenge page two order`,
    );
    const lastPage = Math.ceil(metadata.challenges.length / 5);
    assert.deepEqual(
      pageSlice(metadata.challenges, 999).shown,
      metadata.challenges.slice((lastPage - 1) * 5),
      `${ctf.id} oversized page clamp`,
    );
  }
  for (const challenge of ctf.challenges) {
    assert.deepEqual(
      challenge,
      parseLegacyMarkdown(await readMarkdown(`ctfs/${ctf.id}/${challenge.file}`), challenge.file),
    );
    challengeCount++;
  }
}

const indexHtml = await getText("/pages/ctf.html");
assert.equal((indexHtml.match(/class="quest-card"/g) || []).length, Math.min(5, model.ctfs.length));
assert.ok(indexHtml.includes(`${challengeCount} WRITEUPS`));
for (const ctf of model.ctfs) assert.ok(indexHtml.includes(ctf.title));

const totalPages = Math.max(1, Math.ceil(model.ctfs.length / 5));
assert.deepEqual(pageSlice(model.ctfs, 999).shown, model.ctfs.slice((totalPages - 1) * 5));
assert.deepEqual(pageSlice([], 999).shown, []);

let checkedNavigation = 0;
for (const ctf of model.ctfs) {
  for (let index = 0; index < ctf.challengeFiles.length; index++) {
    const file = ctf.challengeFiles[index];
    const html = await getText(writeupUrl(ctf.id, file));
    assert.ok(html.includes(`CHALLENGE ${index + 1} / ${ctf.challengeFiles.length}`), `${ctf.id}/${file} index`);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    const hasResolvedHref = (expected) =>
      hrefs.some((href) => {
        try {
          return decodeURIComponent(href) === decodeURIComponent(expected);
        } catch {
          return false;
        }
      });
    const previous = ctf.challengeFiles[index - 1];
    const next = ctf.challengeFiles[index + 1];
    if (previous) assert.ok(hasResolvedHref(writeupUrl(ctf.id, previous)), `${file} previous link`);
    if (next) assert.ok(hasResolvedHref(writeupUrl(ctf.id, next)), `${file} next link`);
    checkedNavigation++;
  }
}

console.log(JSON.stringify({
  events: model.ctfs.length,
  eventOrderMatchesIndex: true,
  challenges: challengeCount,
  challengeOrderAndMetadataMatchSource: true,
  challengePagesWithNavigationChecked: checkedNavigation,
  eventListingCards: Math.min(5, model.ctfs.length),
  paginationClampAndEmptyInput: true,
  failures: 0,
}, null, 2));