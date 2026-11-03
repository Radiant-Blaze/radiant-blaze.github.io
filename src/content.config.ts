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
    flag: z.string().nullish(),
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

const portfolioLinkUrl = z.string().url().refine((value) => ["http:", "https:", "mailto:"].includes(new URL(value).protocol), "Links must use HTTP, HTTPS, or mailto");
const portfolioImageSource = z.string().min(1).refine((value) => value.startsWith("/") && !value.startsWith("//") || /^https:\/\//i.test(value), "Images must use a site path or HTTPS URL");

const portfolioBase = {
  published: z.boolean().default(true),
  featured: z.boolean().default(false),
  order: z.number().int().default(100),
  date: z.coerce.date().optional(),
  description: z.string().optional(),
  links: z.array(z.object({
    label: z.string(),
    url: portfolioLinkUrl,
  })).default([]),
};

const portfolio = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./content/portfolio" }),
  schema: z.discriminatedUnion("type", [
    z.object({
      ...portfolioBase,
      type: z.literal("profile"),
      title: z.string(),
    }),
    z.object({
      ...portfolioBase,
      type: z.literal("skill"),
      title: z.string(),
      category: z.string(),
      skills: z.array(z.string().min(1)).min(1),
    }),
    z.object({
      ...portfolioBase,
      type: z.literal("project"),
      title: z.string(),
      description: z.string(),
      category: z.string(),
      technologies: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([]),
      image: z.object({
        src: portfolioImageSource,
        alt: z.string().min(1),
      }).optional(),
    }),
    z.object({
      ...portfolioBase,
      type: z.literal("achievement"),
      title: z.string(),
      description: z.string(),
      category: z.string().optional(),
    }),
    z.object({
      ...portfolioBase,
      type: z.literal("research"),
      title: z.string(),
      description: z.string(),
      publication: z.string().optional(),
    }),
    z.object({
      ...portfolioBase,
      type: z.literal("certification"),
      title: z.string(),
      issuer: z.string(),
      credentialId: z.string().optional(),
    }),
    z.object({
      ...portfolioBase,
      type: z.literal("custom"),
      sectionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      title: z.string(),
    }),
  ]),
});

export const collections = { posts, writeups, events, portfolio };
