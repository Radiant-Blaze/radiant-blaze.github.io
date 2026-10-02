import assert from "node:assert/strict";
import { getPostPresentation, getWriteupPresentation } from "../src/lib/article-metadata.ts";
import { renderMarkdown } from "../src/lib/markdown.ts";

const postDefaults = getPostPresentation({});
assert.deepEqual(postDefaults, {
  title: "Untitled Post",
  description: "Read this post on Radiant Blaze.",
  category: "POST",
  tags: [],
  author: "Radiant Blaze",
  estimatedPlayTime: "",
});

const emptyPostValues = getPostPresentation({
  title: "",
  description: "",
  category: "",
  tags: [],
  author: "",
  estimatedPlayTime: "",
});
assert.deepEqual(emptyPostValues, {
  title: "",
  description: "",
  category: "",
  tags: [],
  author: "",
  estimatedPlayTime: "",
});

const writeupDefaults = getWriteupPresentation({}, "odd-name.md", "Example Event");
assert.equal(writeupDefaults.title, "odd-name");
assert.equal(writeupDefaults.description, "CTF writeup for odd-name from Example Event.");
assert.equal(writeupDefaults.category, "MISC");
assert.equal(writeupDefaults.points, "—");
assert.equal(writeupDefaults.stars, "☆☆☆☆☆");
assert.equal(writeupDefaults.solves, undefined);
assert.deepEqual(writeupDefaults.tags, []);
assert.equal(writeupDefaults.author, "Radiant Blaze");

const emptySolves = getWriteupPresentation({ solves: "", difficulty: 8 }, "challenge.md", "Event");
assert.equal(emptySolves.solves, "");
assert.equal(emptySolves.difficulty, 5);
assert.equal(emptySolves.stars, "★★★★★");

const markdownCases = [
  ["heading IDs and levels", "# Heading\n### Detail", '<h2 id="heading">Heading</h2><h3 id="detail">Detail</h3>'],
  ["paragraph, inline code, strong and link", "A `token` and **bold** [link](https://example.test).", '<p>A <code>token</code> and <strong>bold</strong> <a href="https://example.test">link</a>.</p>'],
  ["lists", "- one\n- two\n\n1. first\n2. second", "<ul><li>one</li><li>two</li></ul><ol><li>first</li><li>second</li></ol>"],
  ["blockquotes", "> first\n> second", "<blockquote>first<br>second</blockquote>"],
  ["escaped raw HTML", "<script>alert(1)</script>", "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"],
];

for (const [name, markdown, expected] of markdownCases) {
  assert.equal(renderMarkdown(markdown), expected, name);
}

const fourBacktickBlock = renderMarkdown(
  ["````python", "print('<unsafe>')", "``` inside code", "````"].join("\n"),
);
assert.match(fourBacktickBlock, /^<pre class="terminal"><code data-language="python">/);
assert.ok(fourBacktickBlock.includes("print(&#x27;&lt;unsafe&gt;&#x27;)") || fourBacktickBlock.includes("print(&#39;&lt;unsafe&gt;&#39;)"));
assert.ok(fourBacktickBlock.includes("``` inside code"));
assert.ok(fourBacktickBlock.endsWith("</code></pre>"));

assert.equal(
  renderMarkdown("```math\nx < y\n```") ,
  '<div class="math-block">\\[x &lt; y\n\\]</div>',
);

console.log("Renderer fixtures passed: metadata fallbacks, empty solves, Markdown structures, four-backtick code, math, and raw HTML escaping.");