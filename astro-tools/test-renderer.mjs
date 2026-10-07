import assert from "node:assert/strict";
import { getPostPresentation, getWriteupPresentation } from "../src/lib/article-metadata.ts";
import { convertMarkdown, renderMarkdown } from "../src/lib/markdown.ts";

assert.equal(getPostPresentation({}).title, "Untitled Post");
assert.equal(getWriteupPresentation({}, "odd-name.md", "Example Event").title, "odd-name");

const source = `---
title: Renderer fixture
tags: [one, two]
metadata:
  enabled: true
---
# Heading

Paragraph with **bold**, ${String.fromCharCode(96)}inline code${String.fromCharCode(96)}, [a link](https://example.test), and ![an image](image.png).

- Item 1
  - Nested item
- Item 2

> A blockquote

| Name | Value |
| --- | --- |
| one | 1 |

~~~js
const value = 1 < 2;
~~~

Inline math $|x|$ and $P(A \\mid B)$ and $\\{x \\mid x > 0\\}$.

$$
\\left| x \\right|
$$`;

const converted = convertMarkdown(source);
assert.equal(converted.data.title, "Renderer fixture");
assert.deepEqual(converted.data.tags, ["one", "two"]);
assert.deepEqual(converted.data.metadata, { enabled: true });
assert.match(converted.html, /<h1>Heading<\/h1>/);
assert.match(converted.html, /<p>Paragraph with/);
assert.match(converted.html, /<code>inline code<\/code>/);
assert.match(converted.html, /<a href="https:\/\/example\.test"/);
assert.match(converted.html, /<img src="image\.png"/);
assert.match(converted.html, /<ul><li>Item 1<ul><li>Nested item<\/li><\/ul><\/li><li>Item 2<\/li><\/ul>/);
assert.match(converted.html, /<blockquote>A blockquote<\/blockquote>/);
assert.match(converted.html, /<table>[\s\S]*<th>Name<\/th>[\s\S]*<td>1<\/td>/);
assert.match(converted.html, /<pre><code data-language="js">const value = 1 &lt; 2;<\/code><\/pre>/);
assert.match(converted.html, /\$\|x\|\$/);
assert.match(converted.html, /P\(A \\mid B\)/);
assert.match(converted.html, /\\\{x \\mid x > 0\\\}/);
assert.match(converted.html, /<div class="math-block">[\s\S]*\\left\| x \\right\|[\s\S]*<\/div>/);
assert.doesNotMatch(converted.html, /<p><div class="math-block">/);
assert.equal(renderMarkdown("# Delegated"), "<h1>Delegated</h1>");

console.log("Renderer integration fixtures passed.");
