import { readFile } from "node:fs/promises";
import path from "node:path";

const contentRoot = path.resolve(process.cwd(), "content");

export async function sourceJsonResponse(relativePath: string) {
  const filePath = path.resolve(contentRoot, relativePath);
  if (!filePath.startsWith(`${contentRoot}${path.sep}`)) {
    return new Response("Not Found", { status: 404 });
  }

  const bytes = await readFile(filePath);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}