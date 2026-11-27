// Compatibility redirects for the retired query-string content viewers.
// These URLs are kept alive for bookmarks and shared links, but no article
// rendering happens here: every request is forwarded to the generated route.
const encodePath = (value: string): string =>
  value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const isSafeRelativePath = (value: string): boolean =>
  value.length > 0 &&
  !value.startsWith("/") &&
  !value.includes("\\") &&
  value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");

const kind = document.body.dataset.legacyRedirect;
const params = new URLSearchParams(location.search);
let target = "/";

if (kind === "post") {
  const file = params.get("post") || "";
  target = /\.md$/i.test(file) && isSafeRelativePath(file)
    ? `/generated/posts/${encodePath(file.replace(/\.md$/i, ""))}.html`
    : "/pages/blog.html";
} else if (kind === "writeup") {
  const ctf = params.get("ctf") || "";
  const challenge = params.get("challenge") || "";
  target =
    ctf &&
    /\.md$/i.test(challenge) &&
    isSafeRelativePath(ctf) &&
    isSafeRelativePath(challenge)
      ? `/generated/writeups/${encodePath(ctf)}/${encodePath(challenge.replace(/\.md$/i, ""))}.html`
      : "/pages/ctf.html";
}

const fallback = document.querySelector<HTMLAnchorElement>("[data-legacy-fallback]");
if (fallback) fallback.href = target;
location.replace(target);
