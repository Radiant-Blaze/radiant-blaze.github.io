import type { APIRoute, GetStaticPaths } from "astro";
import { sourceMarkdownPaths, sourceMarkdownResponse } from "../../../../lib/source-markdown";

export const getStaticPaths: GetStaticPaths = async () => {
  const files = await sourceMarkdownPaths("ctfs");
  return files.flatMap((file) => {
    const [, ctf, ...parts] = file.split("/");
    const relativePath = parts.join("/");
    return ctf && relativePath
      ? [{ params: { ctf, path: relativePath.slice(0, -".md".length) } }]
      : [];
  });
};

export const GET: APIRoute = ({ params }) => {
  if (!params.ctf || !params.path) return new Response("Not Found", { status: 404 });
  return sourceMarkdownResponse(`ctfs/${params.ctf}/${params.path}.md`);
};