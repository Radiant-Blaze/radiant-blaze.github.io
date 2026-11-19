import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  inspectEvent,
  inspectFrontmatter,
  inspectLinks,
  inspectMarkdown,
  parseFenceInfo,
} from "./validate-content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = "content/test/writeup.md";
const severities = (issues) => issues.map((item) => item.severity);

// Frontmatter and the flag contract.
assert.deepEqual(severities(inspectFrontmatter("post", {
  title: "Valid post",
  date: "2026-11-19",
  tags: ["crypto", "web"],
}, file)), []);

const missingTitle = inspectFrontmatter("post", { date: "2026-11-19" }, file);
assert.ok(missingTitle.some((item) => item.severity === "error" && item.field === "title"));

const invalidDate = inspectFrontmatter("post", { title: "x", date: "2026-13-40" }, file);
assert.ok(invalidDate.some((item) => item.field === "date" && /valid YYYY-MM-DD/.test(item.message)));

const quotedNumeric = inspectFrontmatter("writeup", { title: "x", flag: "123456" }, file);
assert.equal(quotedNumeric.filter((item) => item.field === "flag").length, 0, "quoted numeric flags are strings");

const unquotedNumeric = inspectFrontmatter("writeup", { title: "x", flag: 123456 }, file);
const numericFlag = unquotedNumeric.find((item) => item.field === "flag");
assert.ok(numericFlag && numericFlag.severity === "error", "unquoted numeric flag is rejected");
assert.ok(!numericFlag.message.includes("123456"), "flag values are never printed in diagnostics");

const booleanFlag = inspectFrontmatter("writeup", { title: "x", flag: true }, file);
assert.ok(booleanFlag.some((item) => item.field === "flag" && item.severity === "error"));

const nullFlag = inspectFrontmatter("writeup", { title: "x", flag: null }, file);
assert.equal(nullFlag.filter((item) => item.field === "flag").length, 0, "null/absent flags are allowed");

const validEvent = inspectFrontmatter("event", { title: "Event", date: "2026-01-01", challenges: ["a.md"] }, "content/ctfs/e/ctf.json");
assert.equal(validEvent.filter((item) => item.severity === "error").length, 0);
const missingEvent = inspectFrontmatter("event", {}, "content/ctfs/e/ctf.json");
assert.ok(missingEvent.some((item) => item.field === "title"));
assert.ok(missingEvent.some((item) => item.field === "date"));
assert.ok(missingEvent.some((item) => item.field === "challenges"));

const categoryVariant = inspectMarkdown("# Challenge\n## The Capture\n### Step one\n## Recovery\n## Verification", file);
assert.ok(!categoryVariant.some((item) => item.severity === "error"), "category-specific structures are not forced into one template");

const tagProblems = inspectFrontmatter("writeup", {
  title: "x",
  tags: ["crypto", "Crypto", "bad tag", ""],
}, file);
assert.ok(tagProblems.some((item) => /duplicates/.test(item.message)), "case-insensitive duplicate tag is warned");
assert.ok(tagProblems.some((item) => /kebab-case/.test(item.message)), "non-kebab tag is warned");
assert.ok(tagProblems.some((item) => /non-empty string/.test(item.message)), "empty tag is an error");

const unexpected = inspectFrontmatter("post", { title: "x", date: "2026-11-19", mystery: 1 }, file);
assert.ok(unexpected.some((item) => item.severity === "warning" && item.field === "mystery"));

// Code-fence metadata and Markdown structure.
const parsed = parseFenceInfo('python title="solve.py" {2,5-7}');
assert.equal(parsed.language, "python");
assert.equal(parsed.title, "solve.py");
assert.equal(parsed.highlight, "2,5-7");
assert.deepEqual(parsed.problems, []);
assert.ok(parseFenceInfo("python {7-2}").problems.some((problem) => /reversed/.test(problem)));
assert.ok(parseFenceInfo('python nope="x"').problems.some((problem) => /unrecognized/.test(problem)));

const structure = inspectMarkdown([
  "## Section",
  "#### Deep jump",
  "## Section",
  "```python",
  "```",
  "##",
].join("\n"), file);
assert.ok(structure.some((item) => /jumps from H2 to H4/.test(item.message)), "heading jumps are warned");
assert.ok(structure.some((item) => /duplicates the slug/.test(item.message)), "duplicate heading slugs are warned");
assert.ok(structure.some((item) => /code fence/.test(item.field) && /empty/.test(item.message)), "empty code fences are warned");
assert.ok(structure.some((item) => /heading/.test(item.field) && /no text/.test(item.message)), "empty headings are warned");

const demotedHeading = inspectMarkdown("# Title\n### Detailed step", file);
assert.equal(demotedHeading.filter((item) => /jumps/.test(item.message)).length, 0, "H1 demotion is accounted for");

const emptyMermaid = inspectMarkdown("```mermaid\n```", file);
assert.ok(emptyMermaid.some((item) => item.field === "mermaid" && /empty/.test(item.message)));

const validMermaid = inspectMarkdown("```mermaid\nflowchart TD\n A --> B\n```", file);
assert.equal(validMermaid.length, 0);

// CTF event references.
const event = { title: "Event", date: "2026-01-01", challenges: ["a.md", "a.md", "missing.md"] };
const eventIssues = inspectEvent(event, "content/ctfs/event/ctf.json", new Set(["a.md", "orphan.md"]));
assert.ok(eventIssues.some((item) => /duplicate challenge/.test(item.message)));
assert.ok(eventIssues.some((item) => /referenced writeup does not exist/.test(item.message)));
assert.ok(eventIssues.some((item) => /not listed/.test(item.message)));

// Internal link, anchor, and asset validation.
const routes = new Map([
  ["/generated/posts/linux/tool.html", { file: "post", headings: [] }],
  ["/generated/writeups/event/challenge.html", { file: "writeup", headings: [] }],
]);
const linked = (html) => inspectLinks({
  html,
  route: "/generated/writeups/event/challenge.html",
  headings: ["overview"],
  routes,
  assetExists: (pathname) => pathname === "/images/evidence.png" || pathname === "/content/posts/linux/tool.md",
  headingsForRoute: (route) => new Set(route === "/generated/posts/linux/tool.html" ? ["intro"] : []),
});

assert.equal(linked('<p><a href="/generated/posts/linux/tool.html#intro">post</a></p>').length, 0);
assert.ok(linked('<p><a href="/generated/posts/linux/missing.html">post</a></p>')
  .some((item) => /internal route does not exist/.test(item.message)));
assert.ok(linked('<p><a href="/generated/posts/linux/tool.html#nope">post</a></p>')
  .some((item) => /missing anchor/.test(item.message)));
assert.ok(linked('<p><a href="#missing">anchor</a></p>').some((item) => /missing anchor/.test(item.message)));
assert.ok(linked('<p><img src="/images/missing.png" alt="evidence" /></p>')
  .some((item) => /local asset does not exist/.test(item.message)));
assert.ok(linked('<p><img src="/images/evidence.png" /></p>').some((item) => /alt text/.test(item.message)));
assert.equal(linked('<p><a href="https://example.test/page">external</a></p>').length, 0);
assert.equal(linked('<p><a href="/pages/blog.html">blog</a></p>').length, 0);
assert.equal(linked('<p><a href="/content/posts/linux/tool.md">raw</a></p>').length, 0);

// The actual repository must pass without blocking errors.
const run = spawnSync(process.execPath, ["--experimental-strip-types", "astro-tools/validate-content.mjs"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(run.status, 0, `repository content validation failed:\n${run.stderr}`);
assert.match(run.stdout, /0 error\(s\)/);

console.log("Content validation fixtures passed.");
