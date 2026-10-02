import type { APIRoute } from "astro";
import { getAstroArticleOrder } from "../lib/article-data";

export const GET: APIRoute = async () =>
  new Response(`${JSON.stringify(await getAstroArticleOrder(), null, 2)}\n`, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });