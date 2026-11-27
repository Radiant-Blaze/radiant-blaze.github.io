import site from "../../content/site.json";
import portfolioSettings from "../../content/portfolio/config.json";

/**
 * Structured-data builders for the site's pages.
 *
 * Every entity is derived from build-time content: the author identity from the
 * portfolio profile, social profiles from `content/site.json`, and article
 * fields from Markdown frontmatter. Nothing is invented here, and pages that
 * cannot supply a property simply omit it.
 */

export const SITE_URL = "https://radiant-blaze.github.io";
export const SITE_NAME = "Radiant Blaze";
export const AUTHOR_NAME = portfolioSettings.displayName;
export const AUTHOR_ALTERNATE_NAME = SITE_NAME;
export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SITE_DESCRIPTION =
  "CTF writeups, Linux field notes, and software build logs from Talha Ahmed's cybersecurity and programming journey.";

type Entity = Record<string, unknown>;

export const absoluteUrl = (path: string) =>
  /^https?:\/\//i.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

/** JSON must not be able to close the embedding <script> element. */
export function serializeJsonLd(data: Entity) {
  return JSON.stringify(data)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function jsonLdGraph(...entities: Entity[]): Entity {
  const graph = entities.length === 1 ? entities[0] : { "@graph": entities };
  return { "@context": "https://schema.org", ...graph };
}

const sameAsProfiles = (site.social as Array<{ url?: string }>)
  .map((item) => item.url ?? "")
  .filter((url) => /^https?:\/\//i.test(url));

export function personEntity(): Entity {
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: AUTHOR_NAME,
    alternateName: AUTHOR_ALTERNATE_NAME,
    url: `${SITE_URL}/`,
    description: portfolioSettings.focusLine,
    ...(sameAsProfiles.length ? { sameAs: sameAsProfiles } : {}),
  };
}

export function websiteEntity(description: string): Entity {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description,
    inLanguage: "en",
    publisher: { "@id": PERSON_ID },
  };
}

export function webPageEntity({
  type = "WebPage",
  name,
  description,
  url,
}: {
  type?: "WebPage" | "CollectionPage" | "ProfilePage";
  name: string;
  description: string;
  url: string;
}): Entity {
  return {
    "@type": type,
    "@id": `${url}#webpage`,
    name,
    description,
    url,
    isPartOf: { "@id": WEBSITE_ID },
    inLanguage: "en",
  };
}

export function breadcrumbEntity(items: Array<{ name: string; path: string }>): Entity {
  const url = absoluteUrl(items[items.length - 1].path);
  return {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function itemListEntity({
  name,
  url,
  items,
}: {
  name: string;
  url: string;
  items: Array<{ name: string; path: string }>;
}): Entity {
  return {
    "@type": "ItemList",
    "@id": `${url}#itemlist`,
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

export function articleEntity({
  type,
  headline,
  description,
  url,
  datePublished,
  articleSection,
  keywords,
}: {
  type: "BlogPosting" | "TechArticle";
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  articleSection?: string;
  keywords?: string[];
}): Entity {
  return {
    "@type": type,
    "@id": `${url}#article`,
    headline,
    description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished,
    ...(articleSection ? { articleSection } : {}),
    ...(keywords && keywords.length ? { keywords: keywords.join(", ") } : {}),
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
    isPartOf: { "@id": WEBSITE_ID },
    inLanguage: "en",
  };
}

export function projectEntity({
  name,
  description,
  url,
  datePublished,
  keywords,
}: {
  name: string;
  description: string;
  url: string;
  datePublished?: string;
  keywords?: string[];
}): Entity {
  return {
    "@type": "CreativeWork",
    "@id": `${url}#project`,
    name,
    description,
    url,
    ...(datePublished ? { datePublished } : {}),
    ...(keywords && keywords.length ? { keywords: keywords.join(", ") } : {}),
    author: { "@id": PERSON_ID },
    isPartOf: { "@id": WEBSITE_ID },
    inLanguage: "en",
  };
}

/** Frontmatter dates are parsed by Astro's schema, so always render ISO-8601. */
export const isoDate = (value: Date | string) =>
  (value instanceof Date ? value : new Date(`${value}T00:00:00Z`)).toISOString();
