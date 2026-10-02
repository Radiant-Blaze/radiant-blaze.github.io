import { homePostPageUrl, homeWriteupPageUrl } from "./home-selection";
import { escapeHtml } from "./markdown";

export function formatClientDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
    .format(new Date(`${value}T00:00:00`))
    .toUpperCase();
}

export function formatClientMonth(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  })
    .format(new Date(`${value}T00:00:00`))
    .toUpperCase();
}

export function postCardHtml(post: Record<string, any>) {
  return `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art thumbnail for ${escapeHtml(post.title)}"></div><div><p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p><div class="quest-meta"><span>${escapeHtml(post.estimatedPlayTime).toUpperCase()} READ</span><span>${formatClientDate(post.date)}</span><span><b>${escapeHtml(post.category).toUpperCase()}</b></span></div><a class="pixel-button start-button" href="${homePostPageUrl(post.file)}">READ POST →</a></div></article>`;
}

export function ctfCardHtml(ctf: Record<string, any>) {
  const difficulty = Math.max(0, Math.min(5, Number.parseInt(String(ctf.difficulty ?? "0"), 10) || 0));
  const stars = "★".repeat(difficulty) + "☆".repeat(5 - difficulty);
  const challengeCount = ctf.challengeCount ?? ctf.challenges.length;
  return `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art badge for ${escapeHtml(ctf.title)}"></div><div><p class="quest-number">CTF · ${new Date(`${ctf.date}T00:00:00`).getFullYear()}</p><h2>${escapeHtml(ctf.title)}</h2><p>${escapeHtml(ctf.description || "")}</p><div class="quest-meta"><span><b>${challengeCount}</b> ${challengeCount === 1 ? "CHALLENGE" : "CHALLENGES"}</span><span>${formatClientDate(ctf.date)}</span><span class="difficulty" title="Difficulty">${stars}</span></div><a class="pixel-button start-button" href="ctf.html?ctf=${encodeURIComponent(ctf.id)}">ENTER EVENT →</a></div></article>`;
}

export function writeupCardHtml(ctf: Record<string, any>, challenge: Record<string, any>) {
  const category = (challenge.category || "MISC").toUpperCase();
  const difficulty = Math.max(0, Math.min(5, Number.parseInt(String(challenge.difficulty ?? "0"), 10) || 0));
  const stars = "★".repeat(difficulty) + "☆".repeat(5 - difficulty);
  return `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art badge for ${escapeHtml(challenge.title)}"></div><div><p class="quest-number">CHALLENGE · ${escapeHtml(category)}</p><h2>${escapeHtml(challenge.title)}</h2><p>${escapeHtml(challenge.description || "")}</p><div class="quest-meta"><span><b>${escapeHtml(challenge.points || "—")}</b> PTS</span><span class="difficulty" title="Difficulty">${stars}</span><span><b>${escapeHtml(category)}</b></span></div><a class="pixel-button start-button" href="${homeWriteupPageUrl(ctf.id, challenge.file)}">READ WRITEUP →</a></div></article>`;
}

export function socialLinksHtml(social: Array<{ label: string; icon: string; url: string }>) {
  return social
    .map((item) => {
      const valid = /^(https?:|mailto:)/i.test(item.url || "");
      const external = valid && !item.url.startsWith("mailto:");
      const icon = `<span aria-hidden="true">${item.icon}</span>`;
      return valid
        ? `<a class="social-link" href="${item.url}"${external ? ' target="_blank" rel="noopener"' : ""} aria-label="${item.label}">${icon}</a>`
        : `<span class="social-link is-pending" title="${item.label} · coming soon" aria-label="${item.label} · coming soon">${icon}</span>`;
    })
    .join("");
}