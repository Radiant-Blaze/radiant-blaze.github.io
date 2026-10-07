import assert from "node:assert/strict";
import { convertMarkdown } from "../src/lib/markdown-converter/index.ts";

const source = `---
title: "Math & Markdown"
tags: [math, test]
custom: retained
---
# Heading

Inline $|x|$ and $P(A \\mid B)$ and $\\{x \\mid x > 0\\}$.

$$
\\left| \\frac{a}{b} \\right|
$$

| Name | Value |
| --- | --- |
| one | 1 |

~~~js
const value = 1;
~~~

![alt text](image.png) [link](https://example.test)

- parent
  - child

> quoted text`;

const result = convertMarkdown(source);
assert.equal(result.data.title, "Math & Markdown");
assert.deepEqual(result.data.tags, ["math", "test"]);
assert.equal(result.data.custom, "retained");
assert.match(result.html, /<table>/);
assert.match(result.html, /<pre><code data-language="js">/);
assert.match(result.html, /<ul><li>parent<ul><li>child<\/li><\/ul><\/li><\/ul>/);
assert.match(result.html, /\$\|x\|\$/);
assert.match(result.html, /P\(A \\mid B\)/);
assert.match(result.html, /\\\{x \\mid x > 0\\\}/);
assert.match(result.html, /<div class="math-block">[\s\S]*\\left\|[\s\S]*<\/div>/);
assert.doesNotMatch(result.html, /<p><div class="math-block">/);
assert.match(result.html, /<blockquote>/);
assert.match(result.html, /<img src="image.png"/);
console.log("Markdown converter fixtures passed.");
