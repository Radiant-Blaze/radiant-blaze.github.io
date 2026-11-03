import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "js-yaml";

const root = process.cwd();
const output = await readFile(path.join(root, "dist/portfolio/index.html"), "utf8");
const contentRoot = path.join(root, "content/portfolio");
const config = JSON.parse(await readFile(path.join(contentRoot, "config.json"), "utf8"));
const entries = [];

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files;
}

for (const file of await markdownFiles(contentRoot)) {
  const source = await readFile(file, "utf8");
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  assert.ok(match, `${path.relative(contentRoot, file)} has frontmatter`);
  const data = load(match[1]);
  entries.push({ data, file });
  const section = data.type === "custom"
    ? config.sections.find((candidate) => candidate.type === "custom" && candidate.id === data.sectionId)
    : config.sections.find((candidate) => candidate.type === ({ skill: "skills", project: "projects", achievement: "achievements", certification: "certifications" }[data.type] ?? data.type));
  if (data.published !== false && data.title && section?.enabled) {
    assert.ok(output.includes(data.title), `${data.title} is rendered from published Markdown`);
  } else if (data.title) {
    assert.ok(!output.includes(data.title), `${data.title} is excluded when unpublished`);
  }
}

const sectionIds = config.sections
  .filter((section) => section.enabled && output.includes(`id="${section.id}"`))
  .map((section) => section.id)
  .sort((left, right) => output.indexOf(`id="${left}"`) - output.indexOf(`id="${right}"`));
const navMatch = /<nav[^>]*aria-label="Portfolio sections"[^>]*>([\s\S]*?)<\/nav>/.exec(output);
const navIds = [...(navMatch?.[1] ?? "").matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
const expectedNavIds = config.sections
  .filter((section) => section.enabled && section.navigation && sectionIds.includes(section.id))
  .sort((left, right) => left.order - right.order)
  .map((section) => section.id);
assert.deepEqual(navIds, expectedNavIds, "configured navigation follows visible section order");
assert.deepEqual(sectionIds, config.sections
  .filter((section) => section.enabled && output.includes(`id="${section.id}"`))
  .sort((left, right) => left.order - right.order)
  .map((section) => section.id), "rendered sections follow configured order");

const publishedProjects = entries.filter(({ data }) => data.type === "project" && data.published !== false);
const categories = [...new Set(publishedProjects.map(({ data }) => data.category.toLocaleLowerCase()))];
const technologies = [...new Set(publishedProjects.flatMap(({ data }) => (data.technologies ?? []).map((value) => value.toLocaleLowerCase())))];
for (const category of categories) {
  if (publishedProjects.length > 1 && categories.length > 1) assert.ok(output.includes(`value="${category}"`), `project category filter includes ${category}`);
}
for (const technology of technologies) {
  if (publishedProjects.length > 1 && technologies.length > 1) assert.ok(output.includes(`value="${technology}"`), `project technology filter includes ${technology}`);
}

assert.match(output, /aria-current="page"[^>]*>PORTFOLIO/);
assert.match(output, /href="\/portfolio\/"/);
assert.match(output, /<body class="disable-page-loader">/);
assert.match(output, /<h1 class="quest-title">Talha Ahmed<\/h1>/);
assert.match(output, /Software development · cybersecurity learner/);
assert.match(output, /data-portfolio-stat="projects">01/);
assert.match(output, /class="portfolio-card is-featured"/);
assert.doesNotMatch(output, /class="portfolio-project-controls"/);
assert.doesNotMatch(output, /href="#profile">ABOUT ME<\/a>/);
assert.doesNotMatch(output, /VIEW SELECTED WORK|portfolio-hero-link/);
assert.doesNotMatch(output, /portfolio-contact|OPEN CHANNEL/);
assert.match(output, /aria-label="Social links"/);

const ctfSection = config.sections.find((section) => section.type === "ctfs");
assert.equal(ctfSection?.itemLimit, 3, "CTF section displays at most three events");
assert.equal(ctfSection?.challengeLimit, 5, "CTF events display at most five writeups each");
assert.equal(ctfSection?.sort, "date", "CTF events are sorted by date");
assert.equal(ctfSection?.direction, "desc", "newest CTF events appear first");
const ctfSectionHtml = /<section[^>]*id="ctf-field-notes"[\s\S]*?<\/section>/.exec(output)?.[0] ?? "";
const renderedEvents = [...ctfSectionHtml.matchAll(/class="portfolio-timeline-entry"/g)].length;
assert.ok(renderedEvents <= 3, "no more than three CTF event entries are rendered");
const renderedWriteupLists = [...ctfSectionHtml.matchAll(/<ul class="portfolio-writeup-links">([\s\S]*?)<\/ul>/g)];
assert.ok(renderedWriteupLists.every(([, list]) => [...list.matchAll(/<li>/g)].length <= 5), "no CTF event renders more than five writeup links");
console.log("Portfolio content, configured section navigation/order, project filters, and shared footer passed.");
