import { loadData, loadCtfs, socialHtml } from "./content.js";

const yearEl = document.querySelector("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Wire the home status panel to the newest blog post or CTF writeup.
Promise.all([loadData("content/"), loadCtfs("content/")])
  .then(([{ site, posts }, { ctfs }]) => {
    const social = document.querySelector("[data-social]");
    if (social) social.innerHTML = socialHtml(site.social);

    const records = [
      ...posts.map((post) => ({
        type: "blog post",
        title: post.title,
        description: post.description,
        date: post.date,
        href: `pages/post.html?post=${encodeURIComponent(post.file)}`,
      })),
      ...ctfs.flatMap((ctf) =>
        ctf.challenges.map((challenge) => ({
          type: "CTF writeup",
          title: challenge.title,
          description: challenge.description || `Writeup from ${ctf.title}.`,
          date: ctf.date,
          href: `pages/writeup.html?ctf=${encodeURIComponent(ctf.id)}&challenge=${encodeURIComponent(challenge.file)}`,
        })),
      ),
    ];
    const panel = document.querySelector("[data-latest-post]");
    if (!panel || !records.length) return;
    const latest = records.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    panel.href = latest.href;
    panel.setAttribute("aria-label", `Read the latest ${latest.type}: ${latest.title}`);
    const title = panel.querySelector("[data-latest-title]");
    const copy = panel.querySelector("[data-latest-copy]");
    const type = panel.querySelector("[data-latest-type]");
    if (type) type.textContent = `LATEST ${latest.type.toUpperCase()}`;
    if (title) title.textContent = latest.title.toUpperCase();
    if (copy) copy.textContent = latest.description;
  })
  .catch(() => {});
