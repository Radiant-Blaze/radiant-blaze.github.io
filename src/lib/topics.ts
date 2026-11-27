import { homePostPageUrl, homeWriteupPageUrl } from "./home-selection";

type TopicPostSource = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  date?: unknown;
  tags?: string[];
  file: string;
};

type TopicChallengeSource = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  tags?: string[];
  file: string;
};

type TopicCtfSource = {
  id: string;
  title?: unknown;
  date?: unknown;
  challenges?: TopicChallengeSource[];
};

/** The slice of the runtime read model that topic hubs care about. */
export type TopicSource = {
  posts: TopicPostSource[];
  ctfs: TopicCtfSource[];
};

export type TopicItem = {
  kind: "post" | "writeup";
  title: string;
  description: string;
  href: string;
  date: Date;
  category: string;
  event?: string;
};

export type Topic = {
  label: string;
  slug: string;
  count: number;
  posts: TopicItem[];
  writeups: TopicItem[];
  lastmod: Date;
};

export const TOPICS_INDEX_ROUTE = "/topics.html";

/**
 * Hubs below this many entries are too thin to rank on their own, so they stay
 * browsable for humans but are noindexed and omitted from the sitemap.
 */
export const MIN_TOPIC_ENTRIES = 2;

export const isThinTopic = (topic: Pick<Topic, "count">) => topic.count < MIN_TOPIC_ENTRIES;

/** Topic routes are plain lowercase ASCII slugs so they stay stable in URLs. */
export function slugifyTopic(label: string) {
  const slug = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "topic";
}

export const topicRoute = (slug: string) => `/topics/${slug}.html`;

const parseDate = (value: unknown) => {
  const date = new Date(`${String(value ?? "")}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const compareLabels = (left: string, right: string) => {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
};

const newestFirst = (left: TopicItem, right: TopicItem) =>
  right.date.getTime() - left.date.getTime() || left.title.localeCompare(right.title) || left.href.localeCompare(right.href);

/**
 * Builds one hub per distinct label (case-insensitive). Categories and tags
 * both feed the same topic, so a challenge tagged `pwn` joins the `Pwn`
 * category hub, and each entry is listed once even when its category and tag
 * spell the topic twice.
 */
export function collectTopics(readModel: TopicSource): Topic[] {
  type Accumulator = {
    label: string;
    posts: TopicItem[];
    writeups: TopicItem[];
    seen: Set<string>;
  };

  const accumulated = new Map<string, Accumulator>();

  const contribute = (rawLabel: unknown, item: TopicItem) => {
    if (typeof rawLabel !== "string") return;
    const label = rawLabel.trim();
    if (!label) return;
    const mergeKey = label.toLowerCase();
    let topic = accumulated.get(mergeKey);
    if (!topic) {
      topic = { label, posts: [], writeups: [], seen: new Set() };
      accumulated.set(mergeKey, topic);
    }
    if (topic.seen.has(item.href)) return;
    topic.seen.add(item.href);
    if (item.kind === "post") topic.posts.push(item);
    else topic.writeups.push(item);
  };

  for (const post of readModel.posts) {
    const date = parseDate(post.date);
    if (!date) continue;
    const item: TopicItem = {
      kind: "post",
      title: String(post.title || post.file),
      description: String(post.description || ""),
      href: homePostPageUrl(post.file),
      date,
      category: String(post.category || "POST"),
    };
    for (const label of [post.category, ...(post.tags || [])]) contribute(label, item);
  }

  for (const ctf of readModel.ctfs) {
    const date = parseDate(ctf.date);
    if (!date) continue;
    for (const challenge of ctf.challenges || []) {
      const item: TopicItem = {
        kind: "writeup",
        title: String(challenge.title || challenge.file),
        description: String(challenge.description || ""),
        href: homeWriteupPageUrl(ctf.id, challenge.file),
        date,
        category: String(challenge.category || "MISC").toUpperCase(),
        event: String(ctf.title || ctf.id),
      };
      for (const label of [challenge.category, ...(challenge.tags || [])]) contribute(label, item);
    }
  }

  // Sort before assigning slugs so collision suffixes do not depend on the
  // content collection's iteration order.
  const ordered = [...accumulated.values()].sort((left, right) => compareLabels(left.label, right.label));
  const usedSlugs = new Set(["index"]);
  return ordered.map((topic) => {
    const base = slugifyTopic(topic.label);
    let slug = base;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    usedSlugs.add(slug);
    const posts = [...topic.posts].sort(newestFirst);
    const writeups = [...topic.writeups].sort(newestFirst);
    const newest = [...posts, ...writeups].reduce(
      (latest, item) => (item.date.getTime() > latest.getTime() ? item.date : latest),
      new Date(0),
    );
    return {
      label: topic.label,
      slug,
      count: posts.length + writeups.length,
      posts,
      writeups,
      lastmod: newest,
    };
  });
}

/**
 * Other hubs, ranked by how many entries they share with the current one.
 * Every hub gets suggestions, including thin ones, so related links never
 * dead-end; ties fall back to the busiest then alphabetically first labels.
 */
export function relatedTopics(topics: Topic[], current: Topic, limit = 8): Topic[] {
  const currentHrefs = new Set(
    [...current.posts, ...current.writeups].map((item) => item.href),
  );

  return topics
    .filter((topic) => topic.slug !== current.slug)
    .map((topic) => ({
      topic,
      overlap: [...topic.posts, ...topic.writeups].reduce(
        (total, item) => total + (currentHrefs.has(item.href) ? 1 : 0),
        0,
      ),
    }))
    .sort(
      (left, right) =>
        right.overlap - left.overlap ||
        Number(isThinTopic(left.topic)) - Number(isThinTopic(right.topic)) ||
        right.topic.count - left.topic.count ||
        compareLabels(left.topic.label, right.topic.label),
    )
    .slice(0, limit)
    .map(({ topic }) => topic);
}
