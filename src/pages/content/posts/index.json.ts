import type { APIRoute } from "astro";
import { sourceJsonResponse } from "../../../lib/source-json";

export const GET: APIRoute = () => sourceJsonResponse("posts/index.json");