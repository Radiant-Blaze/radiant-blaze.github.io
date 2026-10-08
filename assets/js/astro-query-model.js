import { normalizeTopic, recordTopics, searchableText } from "./list-utils.js";

export const matchesBlogPost = (post, term) =>
  searchableText(
    post.title,
    post.description,
    post.category,
    post.tags || [],
    post.author,
    post.body,
  ).includes(term);

export const buildGlobalRecords = (posts, ctfs) => {
  const writeups = ctfs.flatMap((ctf) =>
    ctf.challenges.map((challenge) => ({ ctf, challenge })),
  );
  return [
    ...posts.map((item) => ({ type: "post", item, date: item.date })),
    ...writeups.map(({ ctf, challenge: item }) => ({
      type: "writeup",
      item,
      ctf,
      date: ctf.date,
    })),
  ].sort((left, right) => new Date(`${right.date}T00:00:00`) - new Date(`${left.date}T00:00:00`));
};

export const filterGlobalRecords = (
  records,
  { query, type = "all", topic = "all", year = "" },
) => {
  const term = query.trim().toLowerCase();
  const selectedYear = year || "";
  return records.filter((record) => {
    const { item, ctf } = record;
    const searchable = `${item.title} ${item.description || ""} ${item.category || ""} ${(item.tags || []).join(" ")} ${ctf?.title || ""}`.toLowerCase();
    const matchesQuery = !term || searchable.includes(term);
    const matchesYear = !selectedYear || new Date(`${record.date}T00:00:00`).getFullYear() === Number(selectedYear);
    const matchesType = type === "all" || (type === "posts" && record.type === "post") || (type === "writeups" && record.type === "writeup");
    const topics = recordTopics(item, ctf);
    const matchesTopic = topic === "all" || topics.some((value) => value.includes(normalizeTopic(topic)));
    return matchesQuery && matchesYear && matchesType && matchesTopic;
  });
};

const ctfMatches = (ctf, term) =>
  searchableText(ctf.title, ctf.event, ctf.description, ctf.date).includes(term);

const challengeMatches = (ctf, challenge, term) =>
  searchableText(
    challenge.title,
    challenge.description,
    challenge.category,
    challenge.tags || [],
    challenge.points,
    challenge.body,
    ctf.title,
    ctf.event,
  ).includes(term);

export const searchCtfRecords = (ctfs, term) =>
  ctfs.flatMap((ctf) => {
    const results = ctfMatches(ctf, term) ? [{ type: "ctf", ctf }] : [];
    ctf.challenges
      .filter((challenge) => challengeMatches(ctf, challenge, term))
      .forEach((challenge) => results.push({ type: "challenge", ctf, challenge }));
    return results;
  });
