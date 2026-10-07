export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function protectMath(source: string) {
  const values: string[] = [];
  const stash = (value: string) => `\u0000MATH${values.push(value) - 1}\u0000`;
  const protectedSource = source
    .replace(/\\\[[\s\S]*?\\\]/g, (m) => stash(`<div class="math-block">${m}</div>`))
    .replace(/\$\$[\s\S]*?\$\$/g, (m) => stash(`<div class="math-block">${m}</div>`))
    .replace(/(?<!\\)\$[^\n$]+?\$/g, (m) => stash(`<span class="math-inline">${m}</span>`));
  return { source: protectedSource, restore: (html: string) => html.replace(/\u0000MATH(\d+)\u0000/g, (_, i) => values[Number(i)]) };
}
