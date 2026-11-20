import type { CollectionEntry } from "astro:content";

export type PortfolioEntry = CollectionEntry<"portfolio">;

/** Stable public slug for a portfolio entry: the Markdown filename. */
export const portfolioSlug = (entry: Pick<PortfolioEntry, "id">) =>
  entry.id.split("/").pop()!.replace(/\.md$/i, "");

/** Detail routes use Astro's file output format, so the .html suffix is real. */
export const portfolioProjectRoute = (entry: Pick<PortfolioEntry, "id">) =>
  `/portfolio/projects/${encodeURIComponent(portfolioSlug(entry))}.html`;

export const publishedProjects = (entries: PortfolioEntry[]) =>
  entries
    .filter((entry) => entry.data.type === "project" && entry.data.published)
    .sort((left, right) => {
      const featured = Number(right.data.featured) - Number(left.data.featured);
      if (featured) return featured;
      return left.data.order - right.data.order
        || (right.data.date?.getTime() ?? 0) - (left.data.date?.getTime() ?? 0);
    });
