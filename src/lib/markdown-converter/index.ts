import { extractFrontmatter, type Frontmatter } from "./frontmatter.ts";
import { escapeHtml, protectMath } from "./html.ts";

export type ConvertedMarkdown = { data: Frontmatter; body: string; html: string };

export function convertMarkdown(source: string): ConvertedMarkdown {
  const { data, body } = extractFrontmatter(source);
  const math = protectMath(body);
  const lines = escapeHtml(math.source).split("\n");
  const output: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\u0000MATH\d+\u0000$/.test(line)) { output.push(line); i++; continue; }
    const fence = /^(\s*)(`{3,}|~{3,})([^\n]*)$/.exec(line);
    if (fence) {
      const marker = fence[2][0], size = fence[2].length, lang = fence[3].trim(); i++;
      const code: string[] = [];
      while (i < lines.length && !new RegExp(`^\\s*${marker}{${size},}\\s*$`).test(lines[i])) code.push(lines[i++]);
      i++;
      if (lang.toLowerCase() === "math") {
        output.push(`<div class="math-block">\\[${code.join("\n")}\\]</div>`);
      } else {
        output.push(`<pre><code${lang ? ` data-language="${escapeHtml(lang)}"` : ""}>${code.join("\n")}</code></pre>`);
      }
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { const text = inline(heading[2]); output.push(`<h${heading[1].length}>${text}</h${heading[1].length}>`); i++; continue; }
    if (/^\s*&gt;/.test(line)) { const quote: string[] = []; while (i < lines.length && /^\s*&gt;/.test(lines[i])) quote.push(inline(lines[i++].replace(/^\s*&gt;\s?/, ""))); output.push(`<blockquote>${quote.join("\n")}</blockquote>`); continue; }
    if (/^\s*([-+*]|\d+[.])\s+/.test(line)) { const parsed = parseList(lines, i, indentation(line)); output.push(parsed.html); i = parsed.next; continue; }
    if (i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])) { const cells = (s: string) => s.replace(/^\s*\|?|\|?\s*$/g, "").split("|").map((x) => x.trim()); const head = cells(lines[i++]); i++; const rows: string[] = []; while (i < lines.length && lines[i].includes("|")) rows.push(`<tr>${cells(lines[i++]).map((x) => `<td>${inline(x)}</td>`).join("")}</tr>`); output.push(`<table><thead><tr>${head.map((x) => `<th>${inline(x)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`); continue; }
    const paragraph: string[] = [line]; i++; while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s|^\s*>|^\s*([-+*]|\d+[.])\s+/.test(lines[i])) paragraph.push(lines[i++]); output.push(`<p>${paragraph.map(inline).join("\n")}</p>`);
  }
  return { data, body, html: math.restore(output.join("")) };
}

function inline(value: string) {
  const protectedValues: string[] = [];
  const protect = (html: string) => `\u0000INLINE${protectedValues.push(html) - 1}\u0000`;
  const protectedValue = value
    .replace(/`([^`\n]+)`/g, (_, code) => protect(`<code>${code}</code>`))
    .replace(/!\[([^\]]*)\]\((\S+?)(?:\s+['\"]([^'\"]*)['\"])?\)/g, (_, alt, href, title) => protect(`<img src="${href}" alt="${alt}"${title ? ` title="${title}"` : ""} />`))
    .replace(/\[([^\]]+)\]\((\S+?)(?:\s+['\"]([^'\"]*)['\"])?\)/g, (_, text, href, title) => protect(`<a href="${href}"${title ? ` title="${title}"` : ""}>${text}</a>`));
  return protectedValue
    .replace(/(?<![\w.])([+-]?\d+(?:\.\d+)?)[eE]([+-]?\d+)(?![\w])/g, (_, coefficient, exponent) => `$${coefficient} \\times 10^{${exponent}}$`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\u0000INLINE(\d+)\u0000/g, (_, index) => protectedValues[Number(index)]);
}

function indentation(line: string) { return (line.match(/^\s*/)![0].replace(/\t/g, "  ").length); }

function parseList(lines: string[], start: number, baseIndent: number): { html: string; next: number } {
  const first = /^\s*(\d+[.]|[-+*])\s+/.exec(lines[start])!;
  const ordered = /^\d/.test(first[1]);
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const match = /^(\s*)(\d+[.]|[-+*])\s+(.+)$/.exec(lines[i]);
    if (!match || indentation(lines[i]) !== baseIndent || (ordered !== /^\d/.test(match[2]))) break;
    const content = inline(match[3]); i++;
    let child = "";
    if (i < lines.length && /^\s*(?:\d+[.]|[-+*])\s+/.test(lines[i]) && indentation(lines[i]) > baseIndent) {
      const nested = parseList(lines, i, indentation(lines[i])); child = nested.html; i = nested.next;
    }
    items.push(`<li>${content}${child}</li>`);
  }
  const tag = ordered ? "ol" : "ul";
  return { html: `<${tag}>${items.join("")}</${tag}>`, next: i };
}

export { escapeHtml };
