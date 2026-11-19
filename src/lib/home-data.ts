import { getOrderedArticles } from "./article-data";
import {
  homePostPageUrl,
  homeWriteupPageUrl,
  selectHomepageProjection,
  type HomeFeature,
} from "./home-selection";

export async function getHomepageProjection() {
  const { posts, writeups } = await getOrderedArticles();

  const postCandidates = posts
    .map(({ file, entry }): HomeFeature => ({
      type: "POST",
      title: entry.data.title,
      description: entry.data.description ?? "",
      href: homePostPageUrl(file),
      date: entry.data.date,
      category: entry.data.category || "ARCHIVE",
    }));

  const writeupCandidates = writeups
    .map(({ ctfId, challengeFile, entry, event }): HomeFeature => ({
      type: "WRITEUP",
      title: entry.data.title ?? challengeFile.replace(/\.md$/i, ""),
      description: entry.data.description || `Writeup from ${event.data.title}.`,
      href: homeWriteupPageUrl(ctfId, challengeFile),
      date: event.data.date,
      category: entry.data.category || event.data.title,
    }));

  return selectHomepageProjection(postCandidates, writeupCandidates);
}