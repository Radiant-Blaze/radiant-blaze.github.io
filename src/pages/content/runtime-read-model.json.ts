import type { APIRoute } from "astro";
import { getRuntimeReadModel } from "../../lib/runtime-read-model";

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await getRuntimeReadModel()), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });