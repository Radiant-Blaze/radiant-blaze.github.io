// Compatibility redirects for the retired query-string content viewers.
// These URLs are kept alive for bookmarks and shared links, but no article
// rendering happens here: every request is forwarded to the generated route.
(() => {
  const encodePath = (value) =>
    value.split("/").map((segment) => encodeURIComponent(segment)).join("/");

  const kind = document.body.dataset.legacyRedirect;
  const params = new URLSearchParams(location.search);
  let target = "/";

  if (kind === "post") {
    const file = params.get("post") || "";
    target = /\.md$/i.test(file)
      ? `/generated/posts/${encodePath(file.replace(/\.md$/i, ""))}.html`
      : "/pages/blog.html";
  } else if (kind === "writeup") {
    const ctf = params.get("ctf") || "";
    const challenge = params.get("challenge") || "";
    target = ctf && /\.md$/i.test(challenge)
      ? `/generated/writeups/${encodeURIComponent(ctf)}/${encodeURIComponent(challenge.replace(/\.md$/i, ""))}.html`
      : "/pages/ctf.html";
  }

  const fallback = document.querySelector("[data-legacy-fallback]");
  if (fallback) fallback.href = target;
  location.replace(target);
})();
