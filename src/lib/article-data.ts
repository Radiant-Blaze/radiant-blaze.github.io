import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCollection } from "astro:content";
import { encodePath } from "./markdown";

type ArticleOrder = {
  posts: string[];
  ctfs: string[];
};

export type OrderedWriteup = {
  ctfId: string;
  challengeFile: string;
  entry: Awaited<ReturnType<typeof getCollection<"writeups">>>[number];
  event: Awaited<ReturnType<typeof getCollection<"events">>>[number];
  challengeFiles: string[];
};

export const postOutputPath = (entryId: string) => `generated/posts/${entryId}.html`;

export const writeupOutputPath = (ctfId: string, challengeFile: string) =>
  `generated/writeups/${ctfId}/${challengeFile.replace(/\.md$/i, ".html")}`;

export const postRoute = (entryId: string) => `/${encodePath(postOutputPath(entryId))}`;

export const writeupRoute = (ctfId: string, challengeFile: string) =>
  `/${encodePath(writeupOutputPath(ctfId, challengeFile))}`;

export async function getOrderedArticles() {
  const root = process.cwd();
  const order = JSON.parse(
    await readFile(path.join(root, "content/posts/index.json"), "utf8"),
  ) as ArticleOrder;
  const ctfOrder = JSON.parse(
    await readFile(path.join(root, "content/ctfs/index.json"), "utf8"),
  ) as ArticleOrder;

  const [postEntries, writeupEntries, eventEntries] = await Promise.all([
    getCollection("posts"),
    getCollection("writeups"),
    getCollection("events"),
  ]);

  const postsById = new Map(postEntries.map((entry) => [`${entry.id}.md`, entry]));
  const postArticles = order.posts.map((file) => {
    const entry = postsById.get(file);
    if (!entry) throw new Error(`Post index entry is missing from the collection: ${file}`);
    return { file, entry };
  });

  const writeupArticles: OrderedWriteup[] = [];
  const orderedEvents = [];
  for (const ctfId of ctfOrder.ctfs) {
    const event = eventEntries.find(
      (item) => item.filePath && path.basename(path.dirname(item.filePath)) === ctfId,
    );
    if (!event) throw new Error(`CTF event is missing from the collection: ${ctfId}`);

    const challengeFiles = event.data.challenges;
    orderedEvents.push({ ctfId, event, challengeFiles });
    for (const challengeFile of challengeFiles) {
      const entry = writeupEntries.find(
        (item) =>
          item.filePath &&
          path.basename(path.dirname(item.filePath)) === ctfId &&
          path.basename(item.filePath) === challengeFile,
      );
      if (!entry) {
        throw new Error(`Challenge is missing from the collection: ${ctfId}/${challengeFile}`);
      }
      writeupArticles.push({
        ctfId,
        challengeFile,
        entry,
        event,
        challengeFiles,
      });
    }
  }

  return { posts: postArticles, writeups: writeupArticles, events: orderedEvents };
}

export async function getAstroArticleOrder() {
  const { posts, writeups } = await getOrderedArticles();
  return [
    ...posts.map(({ entry }) => postOutputPath(entry.id)),
    ...writeups.map(({ ctfId, challengeFile }) => writeupOutputPath(ctfId, challengeFile)),
  ];
}