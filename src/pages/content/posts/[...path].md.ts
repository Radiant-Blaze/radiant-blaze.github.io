import type { APIRoute, GetStaticPaths } from "astro";
import { sourceMarkdownPaths, sourceMarkdownResponse } from "../../../lib/source-markdown";

export const getStaticPaths: GetStaticPaths = async () => {
  const files = await sourceMarkdownPaths("posts");
  return files.map((file) => ({ params: { path: file.slice("posts/".length, -".md".length) } }));
};

export const GET: APIRoute = ({ params }) => {
  if (!params.path) return new Response("Not Found", { status: 404 });
  return sourceMarkdownResponse(`posts/${params.path}.md`);
};