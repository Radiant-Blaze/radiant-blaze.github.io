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
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Map(
    new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
      .formatToParts(date)
      .map((item) => [item.type, item.value]),
  );
  return `${parts.get("day")}-${parts.get("month")}-${parts.get("year")}`;
}

/** Compatibility entry point for existing Astro pages; the implementation is the new converter. */
export function renderMarkdown(markdown: string) {
  return convertMarkdown(markdown).html;
}
