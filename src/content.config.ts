import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    category: z.string().optional(),
    difficulty: z.union([z.number(), z.string()]).optional(),
    xp: z.union([z.number(), z.string()]).optional(),
    thumbnail: z.string().optional(),
    estimatedPlayTime: z.string().optional(),
    author: z.string().optional(),
    path: z.string().optional(),
  }),
});

const writeups = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./content/ctfs" }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    points: z.union([z.number(), z.string()]).optional(),
    difficulty: z.union([z.number(), z.string()]).optional(),
    flag: z.union([z.string(), z.number()]).nullish(),
    solves: z.union([z.string(), z.number()]).nullish(),
    tags: z.array(z.string()).default([]),
    author: z.string().optional(),
  }),
});

const events = defineCollection({
  loader: glob({ pattern: "**/ctf.json", base: "./content/ctfs" }),
  schema: z.object({
    title: z.string(),
    event: z.string().optional(),
    date: z.coerce.date(),
    difficulty: z.union([z.number(), z.string()]).optional(),
    url: z.string().optional(),
    description: z.string().optional(),
    challenges: z.array(z.string()).default([]),
  }),
});

export const collections = { posts, writeups, events };