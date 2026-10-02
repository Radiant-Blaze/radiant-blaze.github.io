import type { APIRoute } from "astro";
import { getOrderedArticles, postRoute, writeupRoute } from "../lib/article-data";

const ORIGIN = "https://radiant-blaze.github.io";
const NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const GET: APIRoute = async () => {
  const { posts, writeups, events } = await getOrderedArticles();
  const urls = [
    `${ORIGIN}/`,
    `${ORIGIN}/pages/blog.html`,
    `${ORIGIN}/pages/search.html`,
    `${ORIGIN}/pages/ctf.html`,
    ...posts.map(({ entry }) => `${ORIGIN}${postRoute(entry.id)}`),
  ];

  for (const { ctfId } of events) {
    urls.push(`${ORIGIN}/pages/ctf.html?${new URLSearchParams({ ctf: ctfId })}`);
    urls.push(
      ...writeups
        .filter((writeup) => writeup.ctfId === ctfId)
        .map(({ ctfId: id, challengeFile }) => `${ORIGIN}${writeupRoute(id, challengeFile)}`),
    );
  }

  const xml = `<?xml version='1.0' encoding='utf-8'?>\n<urlset xmlns="${NAMESPACE}">\n${urls
    .map((url) => `  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`)
    .join("\n")}\n</urlset>\n`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};