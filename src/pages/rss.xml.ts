import type { APIRoute } from "astro";
import {
  cdata,
  escapeXml,
  feedMetadata,
  feedTags,
  getFeedItems,
  RSS_FEED_URL,
  rssDate,
} from "../lib/feeds";

export const GET: APIRoute = async () => {
  const items = await getFeedItems();
  const { title, description, homePageUrl } = feedMetadata();
  const lastBuildDate = items[0] ? rssDate(items[0].date) : rssDate(new Date(0));

  const entries = items
    .map((item) => {
      const categories = feedTags(item.category, item.tags)
        .map((value) => `      <category>${escapeXml(value)}</category>`)
        .join("\n");
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <pubDate>${rssDate(item.date)}</pubDate>
      <description>${escapeXml(item.description)}</description>
      <content:encoded>${cdata(item.contentHtml)}</content:encoded>
      <dc:creator>${escapeXml(item.author)}</dc:creator>
${categories}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(homePageUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>Radiant Blaze</generator>
    <atom:link href="${escapeXml(RSS_FEED_URL)}" rel="self" type="application/rss+xml" />
${entries}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
