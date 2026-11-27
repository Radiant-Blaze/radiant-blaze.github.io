import { homePostPageUrl, homeWriteupPageUrl } from "./home-selection";
import { difficultyMeterHtml } from "./difficulty";
import { escapeHtml, formatDate } from "./markdown";

export function postCardHtml(post: Record<string, any>) {
  const tags = (post.tags || []).map((tag: string) => `<span class="listing-tag">#${escapeHtml(tag).toUpperCase()}</span>`).join("");
  return `<article class="quest-card listing-entry listing-entry--post"><div class="listing-entry__main"><p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p><div class="listing-tags">${tags}</div><div class="quest-meta"><span>${formatDate(post.date)}</span><span>${escapeHtml(post.estimatedPlayTime).toUpperCase()} READ</span><span><b>${escapeHtml(post.category).toUpperCase()}</b></span></div></div><a class="listing-entry__action pixel-button start-button" href="${homePostPageUrl(post.file)}">READ POST →</a></article>`;
}

function ctfViewportVariant(_ctf: Record<string, any>, index = 0) {
  const variants = ["rain", "pulse", "stars", "crt-tv", "glitch"];
  return variants[index % variants.length];
}

export function ctfCardHtml(ctf: Record<string, any>, index = 0) {
  const challengeCount = ctf.challengeCount ?? ctf.challenges.length;
  const viewportVariant = ctfViewportVariant(ctf, index);
  // Every event card carries real links to its writeups so the listings stay
  // crawlable and usable without JavaScript.
  const writeupLinks = (ctf.challenges || [])
    .map((challenge: Record<string, any>) => `<li><a href="${homeWriteupPageUrl(ctf.id, challenge.file)}">${escapeHtml(challenge.title || challenge.file)}</a></li>`)
    .join("");
  return `<article class="quest-card listing-entry listing-entry--event"><div class="event-viewport event-viewport--${viewportVariant}" aria-hidden="true"><img class="event-viewport__screen" src="/assets/ctf-animations/static/${viewportVariant}.svg" data-animated-src="/assets/ctf-animations/${viewportVariant}.svg" data-static-src="/assets/ctf-animations/static/${viewportVariant}.svg" width="64" height="64" loading="lazy" decoding="async" alt="" /></div><div class="listing-entry__main"><div class="event-kicker"><span class="quest-number">CTF EVENT</span></div><h2>${escapeHtml(ctf.title)}</h2><p class="listing-event">${escapeHtml(ctf.event || "INDEPENDENT EVENT")}</p><p>${escapeHtml(ctf.description || "")}</p><ul class="event-writeups" aria-label="Writeups from ${escapeHtml(ctf.title)}">${writeupLinks}</ul><div class="event-stats"><span>${formatDate(ctf.date)}</span><span><b>${challengeCount}</b> ${challengeCount === 1 ? "CHALLENGE" : "CHALLENGES"}</span><span class="event-difficulty">${difficultyMeterHtml(ctf.difficulty)} DIFFICULTY</span></div></div><a class="listing-entry__action pixel-button start-button" href="ctf.html?ctf=${encodeURIComponent(ctf.id)}">ENTER EVENT <span aria-hidden="true">→</span></a></article>`;
}

export function writeupCardHtml(ctf: Record<string, any>, challenge: Record<string, any>) {
  const category = (challenge.category || "MISC").toUpperCase();
  const tags = (challenge.tags || []).map((tag: string) => `<span class="listing-tag">#${escapeHtml(tag).toUpperCase()}</span>`).join("");
  return `<article class="quest-card listing-entry listing-entry--writeup"><div class="listing-entry__main"><p class="quest-number">WRITEUP · ${escapeHtml(category)}</p><p class="listing-event">${escapeHtml(ctf.title).toUpperCase()}</p><h2>${escapeHtml(challenge.title)}</h2><p>${escapeHtml(challenge.description || "")}</p><div class="listing-tags">${tags}</div><div class="quest-meta"><span>${formatDate(ctf.date)}</span><span><b>${escapeHtml(String(challenge.points ?? "—"))}</b> PTS</span><span>${difficultyMeterHtml(challenge.difficulty)}</span></div></div><a class="listing-entry__action pixel-button start-button" href="${homeWriteupPageUrl(ctf.id, challenge.file)}">READ WRITEUP →</a></article>`;
}

export function socialLinksHtml(social: Array<{ label: string; icon: string; url: string }>) {
  const socialIcon = (label: string) => label === "LinkedIn"
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 22H4v-2h16v2ZM4 20H2V4h2v16Zm18 0h-2V4h2v16ZM9 17H7v-6h2v6Zm6-6v2h-2v4h-2v-6h4Zm2 6h-2v-4h2v4ZM9 9H7V7h2v2Zm11-5H4V2h16v2Z" /></svg>'
    : label === "GitHub"
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h4v2H7v2H5V2Zm0 10H3V6h2v6Zm2 2H5v-2h2v2Zm2 2v-2H7v2H3v-2H1v2h2v2h4v4h2v-4h2v-2H9Zm0 0v2H7v-2h2Zm6-12v2H9V4h6Zm4 2h-2V4h-2V2h4v4Zm0 6V6h2v6h-2Zm-2 2v-2h2v2h-2Zm-2 2v-2h2v2h-2Zm0 2h-2v-2h2v2Zm0 0h2v4h-2v-4Z" /></svg>'
    : label === "X"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20H4v-2h2v2Zm14-2h2v2h-6v-2h2v-2h2v2ZM8 18H6v-2h2v2Zm8 0h-2v-2h2v2Zm-6-2H8v-2h2v2Zm4 0h-2v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2h-2v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H8v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H6V8h2v2Zm4 0h-2V8h2v2Zm4 0h-2V8h2v2ZM8 6H6v2H4V6H2V4h6v2Zm2 2H8V6h2v2Zm8 0h-2V6h2v2Zm2-2h-2V4h2v2Z" /></svg>'
      : label === "RSS"
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.18 17.82a2.18 2.18 0 1 1-3.08 3.09 2.18 2.18 0 0 1 3.08-3.09ZM3 10.9v3.6c3.6 0 6.5 2.9 6.5 6.5h3.6c0-5.58-4.52-10.1-10.1-10.1ZM3 4v3.6c7.5 0 13.4 5.9 13.4 13.4H20C20 11.5 12.5 4 3 4Z" /></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H4v-2h16v2ZM4 18H2V6h2v12Zm18 0h-2V6h2v12Zm-8-4h-4v-2h4v2Zm-4-2H8v-2h2v2Zm6 0h-2v-2h2v2Zm-8-2H6V8h2v2Zm10 0h-2V8h2v2Zm2-4H4V4h16v2Z" /></svg>';
  return social
    .map((item) => {
      const url = item.url || "";
      const internal = url.startsWith("/");
      const valid = internal || /^(https?:|mailto:)/i.test(url);
      const external = /^https?:/i.test(url);
      const icon = `<span class="social-icon">${socialIcon(item.label)}</span>`;
      const kind = external ? "OPEN LINK" : /^mailto:/i.test(url) ? "SEND NOTE" : "SUBSCRIBE";
      const label = `<span class="social-label">${item.label}</span><span class="social-kind">${kind}</span>`;
      return valid
        ? `<a class="social-link" href="${url}"${external ? ' target="_blank" rel="noopener"' : ""}>${label}${icon}</a>`
        : `<span class="social-link is-pending" title="${item.label} · coming soon" aria-label="${item.label} · coming soon"><span class="social-label">${item.label}</span><span class="social-kind">STANDBY</span>${icon}</span>`;
    })
    .join("");
}
