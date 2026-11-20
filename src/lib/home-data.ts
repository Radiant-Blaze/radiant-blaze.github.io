import { getCollection } from "astro:content";
import { getOrderedArticles } from "./article-data";
import { portfolioProjectRoute, publishedProjects } from "./portfolio-data";
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

  const home = selectHomepageProjection(postCandidates, writeupCandidates);
  const projectEntries = publishedProjects(await getCollection("portfolio"));
  const project = projectEntries[0];
  const featuredProject = project
    ? {
      title: project.data.type === "project" ? project.data.title : "",
      description: project.data.type === "project" ? project.data.description : "",
      category: project.data.type === "project" ? project.data.category : "",
      technologies: project.data.type === "project" ? project.data.technologies : [],
      href: portfolioProjectRoute(project),
      date: project.data.date ?? null,
    }
    : null;
  return { ...home, featuredProject };
}