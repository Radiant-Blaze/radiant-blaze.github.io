import { escapeHtml, renderMarkdown } from "./markdown.ts";

export type TocNode = {
  id: string;
  label: string;
  level: number;
  children: TocNode[];
};

export type ContentView = {
  html: string;
  headings: TocNode[];
};

const HIGHLIGHT_SKIP: Record<string, true> = {
  text: true,
  plaintext: true,
  txt: true,
  console: true,
  terminal: true,
  mermaid: true,
};

const parseHighlightLines = (spec: string) => {
  const lines = new Set<number>();
  for (const part of spec.split(",")) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let line = start; line <= end && line - start < 2000; line++) lines.add(line);
    } else if (/^\d+$/.test(part)) {
      lines.add(Number(part));
    }
  }
  return lines;
};

function decodeCodeEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

async function highlightCodeBlocks(markdownHtml: string) {
  const { codeToHtml } = await import("shiki");
  const codePattern = /<pre tabindex="0"><code([^>]*)>([\s\S]*?)<\/code><\/pre>/gi;
  const blocks = [...markdownHtml.matchAll(codePattern)];
  const html: string[] = [];
  let cursor = 0;

  for (const block of blocks) {
    html.push(markdownHtml.slice(cursor, block.index));
    const attributes = block[1];
    const code = decodeCodeEntities(block[2]);
    const language = /data-language="([^"]+)"/i.exec(attributes)?.[1]?.toLowerCase();
    const filename = decodeCodeEntities(/data-filename="([^"]*)"/i.exec(attributes)?.[1] ?? "");
    const highlightSpec = /data-highlight="([^"]*)"/i.exec(attributes)?.[1] ?? "";
    let replacement = block[0];

    if (language && !HIGHLIGHT_SKIP[language]) {
      try {
        const highlightLines = parseHighlightLines(highlightSpec);
        const transformers = highlightLines.size
          ? [
              {
                line(node: { properties: Record<string, unknown> }, line: number) {
                  if (!highlightLines.has(line)) return;
                  const current = node.properties.class;
                  node.properties.class = [current, "is-highlighted"].filter(Boolean).join(" ");
                },
              },
            ]
          : [];
        const highlighted = await codeToHtml(code, { lang: language, theme: "github-dark", transformers });
        const highlightedCode = /<code[^>]*>([\s\S]*?)<\/code>/.exec(highlighted)?.[1];
        if (highlightedCode) {
          const extra = [
            filename ? ` data-filename="${escapeHtml(filename)}"` : "",
            highlightSpec ? ` data-highlight="${escapeHtml(highlightSpec)}"` : "",
          ].join("");
          replacement = `<pre tabindex="0"><code data-language="${escapeHtml(language)}"${extra}>${highlightedCode}</code></pre>`;
        }
      } catch {
        // Leave unsupported language fences as escaped source text.
      }
    }

    html.push(replacement);
    cursor = block.index + block[0].length;
  }

  html.push(markdownHtml.slice(cursor));
  return html.join("");
}

export async function renderContentView(
  markdown: string,
  options: { highlightCode?: boolean } = {},
): Promise<ContentView> {
  const renderedHtml = options.highlightCode === false
    ? renderMarkdown(markdown)
    : await highlightCodeBlocks(renderMarkdown(markdown));
  const usedHeadingIds = new Set<string>();
  const headings: TocNode[] = [];
  const headingStack: TocNode[] = [];

  const html = renderedHtml.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/gi, (_match, sourceLevel, inner) => {
    const headingText = decodeCodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
    const level = Number(sourceLevel) === 1 ? 2 : Number(sourceLevel);
    const slug = headingText
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section";
    let id = slug;
    let suffix = 2;
    while (usedHeadingIds.has(id)) id = `${slug}-${suffix++}`;
    usedHeadingIds.add(id);

    const node: TocNode = { id, label: headingText, level, children: [] };
    while (headingStack.length && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
    const parent = headingStack[headingStack.length - 1];
    if (parent) parent.children.push(node);
    else headings.push(node);
    headingStack.push(node);

    return `<h${level} id="${id}"${Number(sourceLevel) === 1 ? ' class="writeup-lead"' : ""}>${escapeHtml(headingText)}</h${level}>`;
  });

  return { html, headings };
}

let tocGroupSeq = 0;

function renderTocNode(node: TocNode): string {
  const hasChildren = node.children.length > 0;
  const collapsed = node.children.length > 3;
  const groupId = `toc-children-${++tocGroupSeq}`;
  const label = escapeHtml(node.label);
  const hidden = Math.max(0, node.children.length - 3);
  const steps = `${hidden} more ${hidden === 1 ? "step" : "steps"}`;
  const controlLabel = collapsed ? `Show ${steps} in ${label}` : `Collapse the steps in ${label}`;
  const children = hasChildren
    ? `<ol class="content-toc__children" id="${groupId}">${node.children.map(renderTocNode).join("")}</ol>`
    : "";
  const control = hasChildren
    ? `<button class="content-toc__more" type="button" aria-expanded="${!collapsed}" aria-controls="${groupId}" aria-label="${controlLabel}" title="${controlLabel}" data-hidden="${hidden}"><span class="content-toc__more-open">… ${steps}</span><span class="content-toc__more-close">− collapse steps</span></button>`
    : "";
  const attrs = hasChildren ? ` class="content-toc__group" data-toc-group data-clamped="${collapsed}"` : "";
  return `<li${attrs}><div class="content-toc__row"><a class="content-toc__link" href="#${node.id}">${label}</a></div>${children}${control}</li>`;
}

export function renderTocHtml(headings: TocNode[], emptyText: string) {
  if (!headings.length) return `<p class="content-toc__empty">${escapeHtml(emptyText)}</p>`;
  return `<ol class="content-toc__list">${headings.map(renderTocNode).join("")}</ol>`;
}
