export type RelatedWriteup = {
  ctfId: string;
  challengeFile: string;
  title: string;
  category?: string;
  tags: string[];
  eventTitle: string;
  date?: Date | string;
};

export type RelatedOptions = {
  limit?: number;
  /** Routes or ctfId/challengeFile pairs already shown as previous/next. */
  exclude?: Array<{ ctfId: string; challengeFile: string }>;
};

const timestamp = (value: Date | string | undefined) => {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? 0 : time;
};

/**
 * Deterministic related-challenge selection from existing metadata only.
 * Shared tags carry the most weight, then the same category, then the same
 * event. Candidates unrelated to all three are omitted rather than invented.
 */
export function selectRelatedWriteups(
  current: RelatedWriteup,
  candidates: RelatedWriteup[],
  { limit = 4, exclude = [] }: RelatedOptions = {},
) {
  const currentTags = new Set(current.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  const excluded = new Set([
    `${current.ctfId}/${current.challengeFile}`,
    ...exclude.map((item) => `${item.ctfId}/${item.challengeFile}`),
  ]);
  return candidates
    .filter((candidate) => !excluded.has(`${candidate.ctfId}/${candidate.challengeFile}`))
    .map((candidate) => {
      const candidateTags = new Set(candidate.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
      const sharedTags = [...candidateTags].filter((tag) => currentTags.has(tag)).length;
      const sameCategory = Boolean(current.category && candidate.category === current.category);
      const sameEvent = candidate.ctfId === current.ctfId;
      return {
        candidate,
        sharedTags,
        sameCategory,
        sameEvent,
      };
    })
    .filter(({ sharedTags, sameCategory, sameEvent }) => sharedTags > 0 || sameCategory || sameEvent)
    .sort((left, right) =>
      right.sharedTags - left.sharedTags
      || Number(right.sameCategory) - Number(left.sameCategory)
      || Number(right.sameEvent) - Number(left.sameEvent)
      || timestamp(right.candidate.date) - timestamp(left.candidate.date)
      || left.candidate.title.localeCompare(right.candidate.title),
    )
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate);
}
