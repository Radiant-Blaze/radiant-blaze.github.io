import path from "node:path";
import { contentRoot, readFrontmatter } from "./discover-content.mjs";
export async function validatePost(file) {
  const { data } = await readFrontmatter(file);
  if (typeof data.title !== "string" || !data.title.trim()) throw new Error(`${path.relative(contentRoot, file)}: missing title`);
  const dateText = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : data.date;
  if (typeof dateText !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateText) || Number.isNaN(Date.parse(`${dateText}T00:00:00Z`))) throw new Error(`${path.relative(contentRoot, file)}: invalid date`);
  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some((tag) => typeof tag !== "string"))) throw new Error(`${path.relative(contentRoot, file)}: tags must be an array of strings`);
}
export function validateIndex(value, key, file) { if (!value || !Array.isArray(value[key]) || value[key].some((item) => typeof item !== "string" || !item) || new Set(value[key]).size !== value[key].length) throw new Error(`${path.relative(contentRoot, file)}: invalid ${key} index`); }
