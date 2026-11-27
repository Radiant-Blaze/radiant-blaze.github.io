import { getOrderedArticles, postRoute, writeupRoute } from "./article-data";
import { getPostPresentation, getWriteupPresentation } from "./article-metadata";
import { renderContentView } from "./content-view";
import {
  AUTHOR_NAME,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "./seo";

export { JSON_FEED_URL, RSS_FEED_URL } from "./seo";

export type FeedItem = {
  title: string;
  url: string;
  description: string;
  /** Rendered article body with root-relative links rewritten to absolute URLs. */
  contentHtml: string;
  date: Date;
  category: string;
  tags: string[];
  author: string;
};

export const FEED_TITLE = `${SITE_NAME} — CTF Writeups & Linux Field Notes`;

/**
 * Every published post and writeup, newest first. Both static feeds and their
 * discovery links derive from this one ordering so they cannot drift apart.
 */
export async function getFeedItems(): Promise<FeedItem[]> {
  const { posts, writeups } = await getOrderedArticles();
  const items: FeedItem[] = [];

  for (const { entry } of posts) {
    const presentation = getPostPresentation(entry.data);
    items.push({
      title: presentation.title,
      url: `${SITE_URL}${postRoute(entry.id)}`,
      description: presentation.description,
      contentHtml: await renderFeedHtml(entry.body),
      date: entry.data.date,
      category: presentation.category,
      tags: presentation.tags,
      author: presentation.author,
    });
  }

  for (const { ctfId, challengeFile, entry, event } of writeups) {
    const presentation = getWriteupPresentation(
      entry.data,
      challengeFile,
      event.data.title,
    );
    items.push({
      title: `${presentation.title} · ${event.data.title}`,
      url: `${SITE_URL}${writeupRoute(ctfId, challengeFile)}`,
      description: presentation.description,
      contentHtml: await renderFeedHtml(entry.body),
      date: event.data.date,
      category: presentation.category,
      tags: presentation.tags,
      author: presentation.author,
    });
  }

  return items.sort((left, right) => right.date.getTime() - left.date.getTime());
}

async function renderFeedHtml(body: string | undefined) {
  const { html } = await renderContentView(body ?? "");
  return absolutizeHtml(html);
}

/**
 * Feed readers resolve links against the feed URL, so root-relative article
 * links and images have to carry the site origin before they leave the site.
 */
export function absolutizeHtml(html: string) {
  return html.replace(/(\b(?:href|src)\s*=\s*["'])\/(?!\/)/gi, `$1${SITE_URL}/`);
}

/** CDATA has no escaping, so a literal `]]>` must be split across sections. */
export function cdata(value: string) {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export function feedMetadata() {
  return {
    title: FEED_TITLE,
    description: SITE_DESCRIPTION,
    author: AUTHOR_NAME,
    homePageUrl: `${SITE_URL}/`,
  };
}

/** Category plus tags, de-duplicated case-insensitively (e.g. "PWN"/"pwn"). */
export function feedTags(category: string, tags: string[]) {
  const seen = new Set<string>();
  return [category, ...tags].filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/** RFC 822/RFC 1123 date for RSS; content dates are calendar days in UTC. */
export function rssDate(date: Date) {
  return date.toUTCString();
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
