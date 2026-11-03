import { z } from "astro:content";

const sectionType = z.enum([
  "profile",
  "skills",
  "projects",
  "ctfs",
  "achievements",
  "research",
  "certifications",
  "custom",
]);

const sectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  type: sectionType,
  title: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  navigation: z.boolean().default(false),
  order: z.number().int().default(100),
  showEmpty: z.boolean().default(false),
  sort: z.enum(["order", "date"]).default("order"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  itemLimit: z.number().int().positive().optional(),
  challengeLimit: z.number().int().positive().optional(),
});

export const portfolioConfigSchema = z.object({
  pageTitle: z.string().min(1),
  description: z.string().min(1),
  heroEyebrow: z.string().min(1),
  displayName: z.string().min(1),
  focusLine: z.string().min(1),
  sections: z.array(sectionSchema).min(1).superRefine((sections, context) => {
    const ids = new Set<string>();
    const types = new Set<string>();
    sections.forEach((section, index) => {
      if (ids.has(section.id)) {
        context.addIssue({ code: "custom", path: [index, "id"], message: "Section IDs must be unique" });
      }
      if (section.type !== "custom" && types.has(section.type)) {
        context.addIssue({ code: "custom", path: [index, "type"], message: "Section types must be unique" });
      }
      ids.add(section.id);
      if (section.type !== "custom") types.add(section.type);
    });
  }),
});

export type PortfolioConfig = z.infer<typeof portfolioConfigSchema>;
export type PortfolioSectionConfig = PortfolioConfig["sections"][number];
