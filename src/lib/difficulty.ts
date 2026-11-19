// Difficulty is shown as a five-segment meter plus a tier word. Star glyphs
// read as review ratings, which is the wrong signal on a challenge card.
const TIERS = ["UNRATED", "EASY", "MEDIUM", "HARD", "INSANE", "EXTREME"] as const;

export function normalizeDifficulty(value: unknown) {
  return Math.max(0, Math.min(5, Number.parseInt(String(value ?? "0"), 10) || 0));
}

export function difficultyMeterHtml(value: unknown) {
  const level = normalizeDifficulty(value);
  const tier = TIERS[level];
  const bars = Array.from({ length: 5 }, (_, index) => `<i${index < level ? ' class="on"' : ""}></i>`).join("");
  const label = `Difficulty: ${tier}, ${level} of 5`;
  return `<span class="difficulty-meter" data-level="${level}" role="img" aria-label="${label}" title="${label}"><span class="difficulty-meter__bars" aria-hidden="true">${bars}</span><span class="difficulty-meter__label" aria-hidden="true">${tier}</span></span>`;
}
