import { readFile } from "node:fs/promises";
import path from "node:path";
import { getOrderedArticles } from "./article-data";

type ParsedMarkdown = Record<string, string | string[]> & {
  tags: string[];
  body: string;
  file: string;
};

function parseMarkdown(source: string, file: string): ParsedMarkdown {
  const [, frontmatter = "", body = ""] =
    source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/) || [];
  const data = Object.fromEntries(
    frontmatter.split("\n").map((line) => {
      const [key, ...value] = line.split(":");
      return [key?.trim(), value.join(":").trim().replace(/^\[|\]$/g, "")];
    }),
  ) as Record<string, string>;

  return {
    ...data,
    tags:
      data.tags
        ?.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean) || [],
    body,
    file,
  };
}

async function readMarkdown(filePath: string, file: string) {
  return parseMarkdown(await readFile(filePath, "utf8"), file);
}

export async function getRuntimeReadModel() {
  const root = process.cwd();
  const { posts, writeups, events } = await getOrderedArticles();
  const site = JSON.parse(
    await readFile(path.join(root, "content/site.json"), "utf8"),
  );

  const orderedPosts = await Promise.all(
    posts.map(async ({ file, entry }) => ({
      ...await readMarkdown(entry.filePath!, file),
    })),
  );

  const orderedCtfs = await Promise.all(
    events.map(async ({ ctfId, event, challengeFiles }) => {
      const metadata = JSON.parse(
        await readFile(path.join(root, "content/ctfs", ctfId, "ctf.json"), "utf8"),
      );
      const eventWriteups = writeups.filter((writeup) => writeup.ctfId === ctfId);
      const challenges = await Promise.all(
        eventWriteups.map(({ challengeFile, entry }) =>
          readMarkdown(entry.filePath!, challengeFile),
        ),
      );

      return {
        ...metadata,
        id: ctfId,
        challengeCount: challengeFiles.length,
        challengeFiles,
        challenges,
      };
    }),
  );

  return { version: 1, site, posts: orderedPosts, ctfs: orderedCtfs };
}