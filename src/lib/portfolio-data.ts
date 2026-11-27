import type { CollectionEntry } from "astro:content";

export type PortfolioEntry = CollectionEntry<"portfolio">;
export type PortfolioEntryData = PortfolioEntry["data"];
export type PortfolioEntryType = PortfolioEntryData["type"];
export type PortfolioDataOfType<T extends PortfolioEntryType> = Extract<
  PortfolioEntryData,
  { type: T }
>;
export type PortfolioEntryOfType<T extends PortfolioEntryType> = PortfolioEntry & {
  data: PortfolioDataOfType<T>;
};
export type PortfolioProjectEntry = PortfolioEntryOfType<"project">;

/**
 * The portfolio collection is a discriminated union of entry kinds, and
 * `Array#filter` cannot narrow a union on its own. This predicate lets callers
 * keep the discriminated types after filtering.
 */
export const isPortfolioEntry = <T extends PortfolioEntryType>(type: T) =>
  (entry: PortfolioEntry): entry is PortfolioEntryOfType<T> =>
    entry.data.type === type;

/** Stable public slug for a portfolio entry: the Markdown filename. */
export const portfolioSlug = (entry: Pick<PortfolioEntry, "id">) =>
  entry.id.split("/").pop()!.replace(/\.md$/i, "");

/** Detail routes use Astro's file output format, so the .html suffix is real. */
export const portfolioProjectRoute = (entry: Pick<PortfolioEntry, "id">) =>
  `/portfolio/projects/${encodeURIComponent(portfolioSlug(entry))}.html`;

export const publishedProjects = (entries: PortfolioEntry[]): PortfolioProjectEntry[] =>
  entries
    .filter(isPortfolioEntry("project"))
    .filter((entry) => entry.data.published)
    .sort((left, right) => {
      const featured = Number(right.data.featured) - Number(left.data.featured);
      if (featured) return featured;
      return left.data.order - right.data.order
        || (right.data.date?.getTime() ?? 0) - (left.data.date?.getTime() ?? 0);
    });
