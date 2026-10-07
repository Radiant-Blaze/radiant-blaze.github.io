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

~~~math
p_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}} \\mid |x|
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
assert.match(result.html, /<div class="math-block">[\s\S]*\\\[p_i = \\frac\{e\^\{z_i\}\}\{\\sum_j e\^\{z_j\}\} \\mid \|x\|[\s\S]*\\\]<\/div>/);
assert.match(result.html, /<ul><li>parent<ul><li>child<\/li><\/ul><\/li><\/ul>/);
assert.match(result.html, /\$\|x\|\$/);
assert.match(result.html, /P\(A \\mid B\)/);
assert.match(result.html, /\\\{x \\mid x > 0\\\}/);
assert.match(result.html, /<div class="math-block">[\s\S]*\\left\|[\s\S]*<\/div>/);
assert.doesNotMatch(result.html, /<p><div class="math-block">/);
assert.match(result.html, /<blockquote>/);
assert.match(result.html, /<img src="image.png"/);
for (const notation of ["1e-6", "1e-9", "2e-3", "5e-10", "2e-20", "10e-6"]) {
  assert.match(convertMarkdown(`The value is ${notation}.`).html, /\$[^$]+\\times 10\^\{[+-]?\d+\}\$/);
}
assert.equal(convertMarkdown("```text\n1e-6\n```").html, '<pre><code data-language="text">1e-6</code></pre>');
assert.equal(convertMarkdown("Inline `1e-6` stays literal.").html, '<p>Inline <code>1e-6</code> stays literal.</p>');
assert.equal(convertMarkdown("[file1e-6.txt](https://example.test/file1e-6.txt)").html, '<p><a href="https://example.test/file1e-6.txt">file1e-6.txt</a></p>');
console.log("Markdown converter fixtures passed.");
