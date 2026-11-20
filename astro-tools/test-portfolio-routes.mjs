import assert from "node:assert/strict";
import { portfolioProjectRoute, portfolioSlug, publishedProjects } from "../src/lib/portfolio-data.ts";

const project = (id, overrides = {}) => ({
  id,
  data: {
    type: "project",
    title: id,
    description: "Project",
    category: "Web",
    technologies: [],
    links: [],
    published: true,
    featured: false,
    order: 100,
    ...overrides,
  },
});

assert.equal(portfolioSlug({ id: "projects/radiant-blaze-site" }), "radiant-blaze-site");
assert.equal(portfolioProjectRoute({ id: "projects/radiant-blaze-site" }), "/portfolio/projects/radiant-blaze-site.html");

const entries = [
  project("projects/older", { order: 2 }),
  project("projects/featured", { featured: true, order: 3 }),
  project("projects/hidden", { published: false }),
  { id: "skills/security", data: { type: "skill", published: true } },
];
const selected = publishedProjects(entries);
assert.deepEqual(selected.map((entry) => entry.id), ["projects/featured", "projects/older"], "published projects sort featured first");
assert.ok(!selected.some((entry) => entry.id === "projects/hidden"), "unpublished projects are excluded");
assert.ok(!selected.some((entry) => entry.id.startsWith("skills/")), "non-project entries are excluded");
assert.deepEqual(publishedProjects([]), [], "an empty portfolio is valid");

console.log(JSON.stringify({
  slug: portfolioSlug({ id: "projects/radiant-blaze-site" }),
  route: portfolioProjectRoute({ id: "projects/radiant-blaze-site" }),
  selected: selected.map((entry) => entry.id),
  empty: true,
  failures: 0,
}, null, 2));
