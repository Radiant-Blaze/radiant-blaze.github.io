export type PlayerStatsVariant = "blog" | "ctf";

export type PlayerStat = {
  key: string;
  label: string;
  value: string;
  description: string;
};

export type PlayerStats = {
  blogPosts: number;
  writeups: number;
  totalArticles: number;
  categories: number;
  wordsWritten: number;
  ctfEvents: number;
  challengesDocumented: number;
  categoryCounts: Record<string, number>;
  xp: number;
  level: number;
  levelProgress: number;
  currentStreak: number;
  longestStreak: number;
  blogMetrics: PlayerStat[];
  ctfMetrics: PlayerStat[];
};

type ArticleLike = {
  body?: string;
  category?: string;
  tags?: string[];
  date?: string;
};

type CtfLike = {
  id: string;
  date?: string;
  challenges?: ArticleLike[];
};

export type PlayerStatsSource = {
  posts: ArticleLike[];
  ctfs: CtfLike[];
};

export const XP_WEIGHTS = {
  blogPost: 100,
  writeup: 50,
  ctfEvent: 100,
};

const WORD_PATTERN = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;

export const countWords = (body = "") =>
  (body.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, " ").replace(/```[\s\S]*?```/g, " ").match(WORD_PATTERN) || []).length;

const validDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const dayDistance = (left: string, right: string) =>
  Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86400000);

const streaks = (dates: string[]) => {
  const unique = [...new Set(dates)].sort();
  if (!unique.length) return { current: 0, longest: 0 };
  let longest = 1;
  let run = 1;
  for (let index = 1; index < unique.length; index += 1) {
    run = dayDistance(unique[index - 1], unique[index]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const today = isoDay(new Date());
  const latest = unique[unique.length - 1];
  // A streak is active only when the latest publication was today or yesterday.
  if (dayDistance(latest, today) > 1 || dayDistance(latest, today) < 0) return { current: 0, longest };
  let current = 1;
  for (let index = unique.length - 1; index > 0; index -= 1) {
    if (dayDistance(unique[index - 1], unique[index]) !== 1) break;
    current += 1;
  }
  return { current, longest };
};

const metric = (key: string, label: string, value: string | number, description: string): PlayerStat => ({
  key, label, value: String(value), description,
});

export function calculatePlayerStats(source: PlayerStatsSource): PlayerStats {
  const writeups = source.ctfs.flatMap((ctf) => ctf.challenges || []);
  const allArticles = [...source.posts, ...writeups];
  const categories = new Set(allArticles.flatMap((article) => [article.category, ...(article.tags || [])]).filter(Boolean));
  const categoryCounts: Record<string, number> = {};
  writeups.forEach((article) => {
    const category = (article.category || "MISC").toUpperCase();
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });
  const dates = source.posts.map((article) => article.date).concat(source.ctfs.map((ctf) => ctf.date)).filter((date): date is string => Boolean(validDate(date)));
  const { current, longest } = streaks(dates);
  const xp = source.posts.length * XP_WEIGHTS.blogPost + writeups.length * XP_WEIGHTS.writeup + source.ctfs.length * XP_WEIGHTS.ctfEvent;
  const level = Math.floor(xp / 500) + 1;
  const levelProgress = xp % 500;
  const wordsWritten = allArticles.reduce((total, article) => total + countWords(article.body), 0);
  const format = (value: number) => value.toLocaleString("en-US");
  return {
    blogPosts: source.posts.length,
    writeups: writeups.length,
    totalArticles: allArticles.length,
    categories: categories.size,
    wordsWritten,
    ctfEvents: source.ctfs.length,
    challengesDocumented: writeups.length,
    categoryCounts,
    xp,
    level,
    levelProgress,
    currentStreak: current,
    longestStreak: longest,
    blogMetrics: [
      metric("posts", "BLOG POSTS", source.posts.length, "Published blog posts"),
      metric("writeups", "CTF WRITEUPS", writeups.length, "Published CTF writeups"),
      metric("articles", "TOTAL ARTICLES", allArticles.length, "Blog posts plus CTF writeups"),
      metric("categories", "CATEGORIES", categories.size, "Distinct categories and tags"),
      metric("words", "WORDS WRITTEN", format(wordsWritten), "Words in published article bodies"),
      metric("xp", "XP EARNED", format(xp), "100 per post, 50 per writeup, 100 per event"),
      metric("streak", "CURRENT STREAK", `${current} DAY${current === 1 ? "" : "S"}`, "Consecutive publication days, active through today or yesterday"),
    ],
    ctfMetrics: [
      metric("writeups", "WRITEUPS PUBLISHED", writeups.length, "Published writeups; not a claim of verified solves"),
      metric("events", "CTF EVENTS", source.ctfs.length, "Distinct events represented in the content index"),
      metric("challenges", "CHALLENGES DOCUMENTED", writeups.length, "Distinct challenge files in the published event index"),
      ...["CRYPTO", "WEB", "PWN", "REV", "FORENSICS", "MISC"].map((category) => metric(category.toLowerCase(), category, categoryCounts[category] || 0, `Writeups classified as ${category}`)),
      metric("words", "WORDS WRITTEN", format(writeups.reduce((total, article) => total + countWords(article.body), 0)), "Words in published CTF writeup bodies"),
      metric("xp", "CTF XP", format(writeups.length * XP_WEIGHTS.writeup + source.ctfs.length * XP_WEIGHTS.ctfEvent), "50 per writeup plus 100 per event"),
    ],
  };
}
