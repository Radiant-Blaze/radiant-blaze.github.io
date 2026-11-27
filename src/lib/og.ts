import { encodePath } from "./markdown";
import { SITE_URL } from "./seo";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const DEFAULT_OG_IMAGE_PATH = "og-image.png";

/** Absolute URL of the fallback banner used by pages without a generated article image. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/${DEFAULT_OG_IMAGE_PATH}`;

const decodeSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * Article output path (without `.html`) → unencoded PNG output path on disk.
 * Example: `generated/posts/linux/intro` → `og/generated/posts/linux/intro.png`.
 */
export function ogOutputPath(articlePath: string) {
  const normalized = articlePath
    .replace(/^\/+/, "")
    .replace(/[?#].*$/, "")
    .replace(/\.html$/i, "");
  return `og/${normalized}.png`;
}

/**
 * Canonical article URL (absolute or site-relative, percent-encoded) → absolute,
 * percent-encoded OG image URL. The PNG output path and this URL share
 * `ogOutputPath`, so the endpoint file and the meta tag cannot drift.
 */
export function ogImageUrl(canonical: string) {
  const pathname = canonical
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "")
    .replace(/[?#].*$/, "");
  const articlePath = pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(decodeSegment)
    .join("/");
  return `${SITE_URL}/${encodePath(ogOutputPath(articlePath))}`;
}

export type OgImageData = {
  title: string;
  category: string;
  /** Date or event/date label shown beside the category badge. */
  meta: string;
};

export function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

const TITLE_MAX_CHARS = 26;
const TITLE_MAX_LINES = 3;
const TITLE_FONT_SIZE = 64;
const TITLE_MIN_FONT_SIZE = 38;
const TITLE_MAX_WIDTH = 1040;

/** Rough advance-width estimate for the generic sans-serif face used by sharp. */
function estimateTextWidth(line: string, fontSize: number) {
  const width = [...line].reduce((total, character) => {
    if ("WM@%&".includes(character)) return total + 1;
    if ("ABCDEFGHJKLNOPQRSTUVXYZ0123456789#".includes(character)) return total + 0.75;
    if ("iljI.,:;'!|()[]-–—".includes(character)) return total + 0.32;
    if (character === " ") return total + 0.3;
    return total + 0.6;
  }, 0);
  return width * fontSize;
}

function titleFontSize(line: string) {
  const width = estimateTextWidth(line, TITLE_FONT_SIZE);
  if (width <= TITLE_MAX_WIDTH) return TITLE_FONT_SIZE;
  return Math.max(
    TITLE_MIN_FONT_SIZE,
    Math.floor((TITLE_FONT_SIZE * TITLE_MAX_WIDTH) / width),
  );
}

function chunkWord(word: string) {
  if (word.length <= TITLE_MAX_CHARS) return [word];
  const chunks: string[] = [];
  for (let index = 0; index < word.length; index += TITLE_MAX_CHARS) {
    chunks.push(word.slice(index, index + TITLE_MAX_CHARS));
  }
  return chunks;
}

/** Greedy wrap into at most three lines; oversized words are chunked, overflow is ellipsized. */
export function wrapOgTitle(title: string) {
  const words = title
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 0)
    .flatMap(chunkWord);

  if (words.length === 0) return ["Untitled"];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= TITLE_MAX_CHARS || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length <= TITLE_MAX_LINES) return lines;

  const kept = lines.slice(0, TITLE_MAX_LINES);
  let last = kept[TITLE_MAX_LINES - 1];
  while (`${last}…`.length > TITLE_MAX_CHARS && last.length > 0) {
    last = last.slice(0, -1);
  }
  kept[TITLE_MAX_LINES - 1] = `${last.trimEnd()}…`;
  return kept;
}

export function renderOgSvg({ title, category, meta }: OgImageData) {
  const lines = wrapOgTitle(title);
  const lineHeight = 78;
  const titleStart = 246;
  const lastTitleBaseline = titleStart + (lines.length - 1) * lineHeight;
  const badgeY = lastTitleBaseline + 44;
  const badgeHeight = 44;
  const badgeLabel = (category || "ARTICLE").toUpperCase();
  const badgeWidth = Math.max(150, badgeLabel.length * 15 + 44);
  const metaX = 80 + badgeWidth + 24;
  const metaMaxChars = Math.max(8, Math.floor((1120 - metaX) / 12));
  const metaLabel =
    meta.length > metaMaxChars ? `${meta.slice(0, Math.max(0, metaMaxChars - 1)).trimEnd()}…` : meta;

  const titleText = lines
    .map(
      (line, index) =>
        `<text x="80" y="${titleStart + index * lineHeight}" font-family="sans-serif" font-size="${titleFontSize(line)}" font-weight="700" fill="#f7f1ff">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <pattern id="og-grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="40" height="40" fill="none" />
      <rect x="0" y="0" width="3" height="3" fill="#ffffff" fill-opacity="0.05" />
    </pattern>
  </defs>
  <rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="#171329" />
  <rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="url(#og-grid)" />
  <rect x="0" y="0" width="420" height="10" fill="#ff4d9d" />
  <rect x="420" y="0" width="340" height="10" fill="#ffa14d" />
  <rect x="760" y="0" width="440" height="10" fill="#4de1ff" />
  <rect x="0" y="${OG_IMAGE_HEIGHT - 10}" width="1200" height="10" fill="#ff4d9d" fill-opacity="0.35" />
  <rect x="80" y="82" width="18" height="18" fill="#ff4d9d" />
  <rect x="106" y="82" width="18" height="18" fill="#ffa14d" fill-opacity="0.75" />
  <rect x="132" y="82" width="18" height="18" fill="#4de1ff" fill-opacity="0.75" />
  <text x="168" y="100" font-family="monospace" font-size="26" letter-spacing="4" fill="#4de1ff">RADIANT BLAZE</text>
  <rect x="80" y="180" width="6" height="${Math.max(60, lastTitleBaseline - 174)}" fill="#ff4d9d" />
  ${titleText}
  <rect x="80" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}" rx="6" fill="#ffa14d" />
  <text x="${80 + badgeWidth / 2}" y="${badgeY + 30}" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" letter-spacing="2" fill="#171329">${escapeXml(badgeLabel)}</text>
  <text x="${metaX}" y="${badgeY + 30}" font-family="sans-serif" font-size="22" fill="#a89ec4">${escapeXml(metaLabel)}</text>
  <rect x="80" y="534" width="1040" height="2" fill="#ffffff" fill-opacity="0.12" />
  <text x="80" y="578" font-family="monospace" font-size="22" letter-spacing="1" fill="#a89ec4">radiant-blaze.github.io</text>
  <rect x="1008" y="558" width="14" height="14" fill="#4de1ff" fill-opacity="0.8" />
  <rect x="1026" y="558" width="14" height="14" fill="#ff4d9d" fill-opacity="0.8" />
  <rect x="1044" y="558" width="14" height="14" fill="#ffa14d" fill-opacity="0.8" />
  <rect x="1062" y="558" width="14" height="14" fill="#ffffff" fill-opacity="0.12" />
  <rect x="1080" y="558" width="14" height="14" fill="#ffffff" fill-opacity="0.12" />
  <rect x="1098" y="558" width="14" height="14" fill="#ffffff" fill-opacity="0.12" />
</svg>`;

  return svg;
}
