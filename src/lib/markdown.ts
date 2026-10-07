import { convertMarkdown, escapeHtml as converterEscapeHtml } from "./markdown-converter/index.ts";

export { convertMarkdown } from "./markdown-converter/index.ts";

export function escapeHtml(value: unknown) {
  return converterEscapeHtml(value);
}

export function encodePath(value: string) {
  return value.split("/").map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
}

export function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }).format(date).toUpperCase();
}

/** Compatibility entry point for existing Astro pages; the implementation is the new converter. */
export function renderMarkdown(markdown: string) {
  return convertMarkdown(markdown).html;
}
