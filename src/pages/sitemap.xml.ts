import type { APIRoute } from "astro";
import { getOrderedArticles, postRoute, writeupRoute } from "../lib/article-data";

const ORIGIN = "https://radiant-blaze.github.io";
const NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

// Sitemap dates are day precision, the format search engines expect.
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type SitemapEntry = { loc: string; lastmod?: string };

export const GET: APIRoute = async () => {
  const { posts, writeups, events } = await getOrderedArticles();

  // Listing pages change whenever content does, so they carry the newest
  // published date. Article routes carry their own date; writeup routes inherit
  // the event date because the writeup schema has no date field.
  const contentDates = [
    ...posts.map(({ entry }) => entry.data.date.getTime()),
    ...events.map(({ event }) => event.data.date.getTime()),
  ];
  const listingLastmod = contentDates.length
    ? isoDate(new Date(Math.max(...contentDates)))
    : undefined;

  const entries: SitemapEntry[] = [
    { loc: `${ORIGIN}/`, lastmod: listingLastmod },
    { loc: `${ORIGIN}/pages/blog.html`, lastmod: listingLastmod },
    { loc: `${ORIGIN}/pages/search.html`, lastmod: listingLastmod },
    { loc: `${ORIGIN}/pages/ctf.html`, lastmod: listingLastmod },
    // Portfolio entries carry optional dates, so no lastmod is declared here.
    { loc: `${ORIGIN}/portfolio/` },
    ...posts.map(({ entry }) => ({
      loc: `${ORIGIN}${postRoute(entry.id)}`,
      lastmod: isoDate(entry.data.date),
    })),
  ];

  // Only canonical pages are listed. Filtered event views such as
  // /pages/ctf.html?ctf=<id> are parameterised variants of the listing page, so
  // listing them separately would just dilute the canonical URL.
  for (const { ctfId, event } of events) {
    const lastmod = isoDate(event.data.date);
    for (const writeup of writeups) {
      if (writeup.ctfId !== ctfId) continue;
      entries.push({
        loc: `${ORIGIN}${writeupRoute(ctfId, writeup.challengeFile)}`,
        lastmod,
      });
    }
  }

  const xml = `<?xml version='1.0' encoding='utf-8'?>\n<urlset xmlns="${NAMESPACE}">\n${entries
    .map(
      ({ loc, lastmod }) =>
        `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n  </url>`,
    )
    .join("\n")}\n</urlset>\n`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
