import type { APIRoute } from "astro";
import {
  feedMetadata,
  feedTags,
  getFeedItems,
  JSON_FEED_URL,
} from "../lib/feeds";

export const GET: APIRoute = async () => {
  const items = await getFeedItems();
  const { title, description, author, homePageUrl } = feedMetadata();

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title,
    home_page_url: homePageUrl,
    feed_url: JSON_FEED_URL,
    description,
    language: "en",
    authors: [{ name: author, url: `${homePageUrl}portfolio/` }],
    items: items.map((item) => ({
      id: item.url,
      url: item.url,
      title: item.title,
      summary: item.description,
      content_html: item.contentHtml,
      content_text: item.description,
      date_published: item.date.toISOString(),
      tags: feedTags(item.category, item.tags),
      authors: [{ name: item.author }],
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: { "Content-Type": "application/feed+json; charset=utf-8" },
  });
};
