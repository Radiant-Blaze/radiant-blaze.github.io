export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Destinations arrive already HTML-escaped, so `&` can never survive as a raw
// entity start and a scheme cannot be smuggled through `&#58;`-style escapes.
// Anything without a scheme is a relative reference and stays allowed; anything
// with a scheme must be on the list, which keeps `javascript:`, `vbscript:` and
// `data:` out of `href`/`src` if untrusted Markdown ever enters content/.
const SAFE_URL_SCHEMES: Record<string, true> = {
  http: true,
  https: true,
  mailto: true,
  tel: true,
};

export function isSafeUrl(value: string) {
  const scheme = /^([a-z][a-z0-9+.\-]*):/i.exec(value.trim());
  return scheme ? SAFE_URL_SCHEMES[scheme[1].toLowerCase()] === true : true;
}

export function protectMath(source: string) {
  const values: string[] = [];
  const stash = (value: string) => `\u0000MATH${values.push(value) - 1}\u0000`;
  const protectedSource = source
    .replace(/\\\[[\s\S]*?\\\]/g, (m) => stash(`<div class="math-block">${m}</div>`))
    .replace(/\$\$[\s\S]*?\$\$/g, (m) => stash(`<div class="math-block">${m}</div>`))
    .replace(/(?<!\\)\$[^\n$]+?\$/g, (m) => stash(`<span class="math-inline">${m}</span>`));
  return { source: protectedSource, restore: (html: string) => html.replace(/\u0000MATH(\d+)\u0000/g, (_, i) => values[Number(i)]) };
}
