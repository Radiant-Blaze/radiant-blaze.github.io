import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const contentRoot = path.resolve(process.cwd(), "content");

export async function sourceMarkdownPaths(relativeRoot: string): Promise<string[]> {
  const directory = path.resolve(contentRoot, relativeRoot);
  if (!directory.startsWith(`${contentRoot}${path.sep}`)) return [];

  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.join(relativeRoot, entry.name);
      if (entry.isDirectory()) return sourceMarkdownPaths(relativePath);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".md")
        ? [relativePath.split(path.sep).join("/")]
        : [];
    }),
  );
  return paths.flat().sort();
}

export async function sourceMarkdownResponse(relativePath: string) {
  const filePath = path.resolve(contentRoot, relativePath);
  if (!filePath.startsWith(`${contentRoot}${path.sep}`)) {
    return new Response("Not Found", { status: 404 });
  }

  const bytes = await readFile(filePath);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}