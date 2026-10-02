import { readFile } from "node:fs/promises";
import path from "node:path";
import type { APIRoute } from "astro";
import { sourceJsonResponse } from "../../../../lib/source-json";

export async function getStaticPaths() {
  const index = JSON.parse(
    await readFile(path.join(process.cwd(), "content/ctfs/index.json"), "utf8"),
  ) as { ctfs: string[] };

  return index.ctfs.map((ctf) => ({ params: { ctf } }));
}

export const GET: APIRoute = ({ params }) => {
  if (!params.ctf) return new Response("Not Found", { status: 404 });
  return sourceJsonResponse(`ctfs/${params.ctf}/ctf.json`);
};