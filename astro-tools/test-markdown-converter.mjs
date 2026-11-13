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
assert.match(result.html, /<pre tabindex="0"><code data-language="js">/);
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
assert.equal(convertMarkdown("```text\n1e-6\n```").html, '<pre tabindex="0"><code data-language="text">1e-6</code></pre>');
assert.equal(convertMarkdown("Inline `1e-6` stays literal.").html, '<p>Inline <code>1e-6</code> stays literal.</p>');
assert.equal(convertMarkdown("[file1e-6.txt](https://example.test/file1e-6.txt)").html, '<p><a href="https://example.test/file1e-6.txt">file1e-6.txt</a></p>');

// Unsafe destinations must never reach href/src, whatever their casing.
for (const hostile of [
  "[x](javascript:location.href='https://evil.example')",
  "[x](JAVASCRIPT:alert)",
  "[x](vbscript:msgbox)",
  "[x](data:text/html,<b>)",
  "![x](javascript:alert)",
  "![x](data:text/html;base64,PHNjcmlwdD4=)",
]) {
  const html = convertMarkdown(hostile).html;
  assert.doesNotMatch(html, /javascript:|vbscript:|data:/i, `scheme leaked for ${hostile}`);
  assert.doesNotMatch(html, /<(?:a|img)\b/i, `unsafe element rendered for ${hostile}`);
}
// Safe destinations keep rendering as links and images.
assert.match(convertMarkdown("[s](https://example.test/a?b=1&c=2)").html, /<a href="https:\/\/example\.test\/a\?b=1&amp;c=2">s<\/a>/);
assert.match(convertMarkdown("[s](mailto:a@b.test)").html, /<a href="mailto:a@b\.test">s<\/a>/);
assert.match(convertMarkdown("[s](image.png)").html, /<a href="image\.png">s<\/a>/);
assert.match(convertMarkdown("[s](#section)").html, /<a href="#section">s<\/a>/);
assert.match(convertMarkdown("![a](/assets/x.png)").html, /<img src="\/assets\/x\.png" alt="a" \/>/);
console.log("Markdown converter fixtures passed.");
