import { escapeHtml } from "./markdown.ts";

/** A post in newest-first order, reduced to the fields the pager needs. */
export type PostPagerItem = {
  id: string;
  title: string;
  href: string;
};

export type PostPagerNeighbor = {
  title: string;
  href: string;
};

export type PostPagerNeighbors = {
  /** The next-newer post, or null when the current post is already newest. */
  newer: PostPagerNeighbor | null;
  /** The next-older post, or null when the current post is already oldest. */
  older: PostPagerNeighbor | null;
};

const toNeighbor = ({ title, href }: PostPagerItem): PostPagerNeighbor => ({ title, href });

/**
 * Selects the adjacent posts for `currentId` from a newest-first list.
 * Returns two nulls when the id is absent or the list has a single post.
 */
export function selectPostNeighbors(
  posts: readonly PostPagerItem[],
  currentId: string,
): PostPagerNeighbors {
  const index = posts.findIndex((post) => post.id === currentId);
  if (index === -1) return { newer: null, older: null };

  return {
    newer: index > 0 ? toNeighbor(posts[index - 1]) : null,
    older: index < posts.length - 1 ? toNeighbor(posts[index + 1]) : null,
  };
}

const pagerLink = (direction: "newer" | "older", label: string, neighbor: PostPagerNeighbor) =>
  `<a class="post-pager__link post-pager__link--${direction}" href="${escapeHtml(neighbor.href)}">` +
  `<span class="post-pager__label">${label}</span>` +
  `<span class="post-pager__title">${escapeHtml(neighbor.title)}</span>` +
  `</a>`;

/** Renders the pager markup, or an empty string when there is nothing to link to. */
export function renderPostPager({ newer, older }: PostPagerNeighbors): string {
  const links = [
    newer ? pagerLink("newer", "NEWER POST", newer) : "",
    older ? pagerLink("older", "OLDER POST", older) : "",
  ].filter(Boolean);

  if (links.length === 0) return "";
  return `<nav class="post-pager" aria-label="Post navigation">${links.join("")}</nav>`;
}
