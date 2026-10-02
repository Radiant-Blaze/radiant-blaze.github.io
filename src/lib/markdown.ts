export function escapeHtml(value: unknown) {
  return String(value || "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#x27;",
    };
    return entities[character];
  });
}

export function encodePath(value: string) {
  return value
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

export function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .toUpperCase();
}

export function renderMarkdown(markdown: string) {
  const tokens: string[] = [];
  const stash = (html: string) => {
    tokens.push(html);
    return `@@TOKEN${tokens.length - 1}@@`;
  };

  let source = escapeHtml(markdown.replace(/\r\n?/g, "\n"));
  source = source.replace(
    /^(`{3,})(\w+)?[ \t]*\n([\s\S]*?)^\1`*[ \t]*$/gm,
    (_match, _fence: string, language: string | undefined, code: string) => {
      const normalizedLanguage = (language || "").toLowerCase();
      if (normalizedLanguage === "math") {
        return stash(`<div class="math-block">\\[${code}\\]</div>`);
      }
      return stash(
        `<pre class="terminal"><code data-language="${normalizedLanguage || "text"}">${code}</code></pre>`,
      );
    },
  );
  source = source.replace(
    /^\\\[((?:.|\n)*?)\\\]$/gm,
    (_match, math: string) => stash(`<div class="math-block">\\[${math}\\]</div>`),
  );
  source = source.replace(/`([^`\n]+)`/g, (_match, code: string) => stash(`<code>${code}</code>`));

  const inline = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

  const lines = source.split("\n");
  const output: string[] = [];
  const paragraph: string[] = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph.length = 0;
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      flushParagraph();
      index++;
      continue;
    }
    if (/^@@TOKEN\d+@@$/.test(line)) {
      flushParagraph();
      output.push(line);
      index++;
      continue;
    }

    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const tag = `h${level <= 2 ? 2 : Math.min(6, level)}`;
      const id = heading[2].toLowerCase().replace(/[^a-z0-9]+/g, "-");
      output.push(`<${tag} id="${id}">${inline(heading[2])}</${tag}>`);
      index++;
      continue;
    }

    if (line.startsWith("&gt; ")) {
      flushParagraph();
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith("&gt; ")) {
        quote.push(inline(lines[index].slice(5)));
        index++;
      }
      output.push(`<blockquote>${quote.join("<br>")}</blockquote>`);
      continue;
    }

    const bullet = /^[-*] /.test(line);
    const listPattern = bullet ? /^[-*] / : /^\d+\. /;
    if (bullet || listPattern.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && listPattern.test(lines[index])) {
        items.push(`<li>${inline(lines[index].replace(listPattern, ""))}</li>`);
        index++;
      }
      output.push(`<${bullet ? "ul" : "ol"}>${items.join("")}</${bullet ? "ul" : "ol"}>`);
      continue;
    }

    paragraph.push(line);
    index++;
  }

  flushParagraph();
  return output.join("").replace(/@@TOKEN(\d+)@@/g, (_match, token: string) => tokens[Number(token)]);
}