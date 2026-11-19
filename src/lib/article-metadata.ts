import { normalizeDifficulty } from "./difficulty.ts";

type PostMetadata = {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;
  author?: string | null;
  estimatedPlayTime?: string | null;
};

type WriteupMetadata = {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  points?: string | number | null;
  difficulty?: string | number | null;
  solves?: string | number | null;
  flag?: string | null;
  tags?: string[] | null;
  author?: string | null;
};

export function getPostPresentation(data: PostMetadata) {
  return {
    title: data.title ?? "Untitled Post",
    description: data.description ?? "Read this post on Radiant Blaze.",
    category: data.category ?? "POST",
    tags: data.tags ?? [],
    author: data.author ?? "Radiant Blaze",
    estimatedPlayTime: data.estimatedPlayTime ?? "",
  };
}

export function getWriteupPresentation(
  data: WriteupMetadata,
  challengeFile: string,
  eventTitle: string,
) {
  const title = data.title ?? challengeFile.replace(/\.md$/i, "");
  const difficulty = normalizeDifficulty(data.difficulty);

  return {
    title,
    description: data.description ?? `CTF writeup for ${title} from ${eventTitle}.`,
    category: (data.category ?? "MISC").toUpperCase(),
    points: data.points ?? "—",
    difficulty,
    solves: data.solves,
    flag: data.flag,
    tags: data.tags ?? [],
    author: data.author ?? "Radiant Blaze",
  };
}
