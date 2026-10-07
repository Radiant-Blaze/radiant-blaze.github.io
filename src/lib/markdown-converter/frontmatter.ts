import yaml from "js-yaml";

export type FrontmatterValue = string | number | boolean | null | FrontmatterValue[] | { [key: string]: FrontmatterValue };
export type Frontmatter = Record<string, FrontmatterValue>;

export function extractFrontmatter(source: string) {
  const normalized = source.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return { data: {} as Frontmatter, body: normalized };
  const end = normalized.indexOf("\n---", 4);
  if (end < 0 || !/^\n---[ \t]*(?:\n|$)/.test(normalized.slice(end))) {
    throw new Error("Unclosed YAML frontmatter fence");
  }
  const header = normalized.slice(4, end);
  const parsed = yaml.load(header);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Frontmatter must contain a YAML mapping");
  return { data: parsed as Frontmatter, body: normalized.slice(end + 4).replace(/^\n/, "") };
}
