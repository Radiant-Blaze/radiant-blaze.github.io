import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { PREVIEW } from "./read-model-test-utils.mjs";
import { launchBrowser, Session } from "./check-spa.mjs";

// Deterministic 500-record search fixture. It intercepts only the read-model
// request, so production content and the built site stay untouched.
const TAGS = ["heap", "xor", "web", "crypto", "pwn", "linux", "cli", "json-schema", "openapi", "forensics", "reverse", "misc", "arm", "mips", "yaml", "rust", "python", "bash", "network", "memory"];
const CATEGORIES = ["Crypto", "Pwn", "Web", "Programming", "Forensics", "Reverse", "Linux", "Projects"];

const buildFixture = (base) => {
  const posts = Array.from({ length: 100 }, (_, index) => ({
    ...base.posts[0],
    file: `linux/scale-post-${index}.md`,
    path: `linux/scale-post-${index}.md`,
    title: index === 99 ? "Scale marker post 99" : `Synthetic post ${index} about ${TAGS[index % TAGS.length]}`,
    description: `Record ${index} covering ${TAGS[index % TAGS.length]} and ${TAGS[(index + 1) % TAGS.length]}.`,
    category: CATEGORIES[index % CATEGORIES.length],
    date: `${2020 + (index % 7)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
    tags: [TAGS[index % TAGS.length], TAGS[(index + 1) % TAGS.length]],
    body: `synthetic body ${index} xor heap ${TAGS[index % TAGS.length]}`,
  }));

  const ctfs = Array.from({ length: 100 }, (_, eventIndex) => {
    const date = `${2020 + (eventIndex % 7)}-${String((eventIndex % 12) + 1).padStart(2, "0")}-01`;
    const challenges = Array.from({ length: 4 }, (_, challengeIndex) => {
      const index = eventIndex * 4 + challengeIndex;
      return {
        ...base.ctfs[0].challenges[0],
        file: `scale-chall-${eventIndex}-${challengeIndex}.md`,
        title: `Challenge ${eventIndex}-${challengeIndex} ${TAGS[index % TAGS.length]}`,
        description: `Scale challenge ${index}`,
        category: CATEGORIES[index % CATEGORIES.length],
        tags: [TAGS[index % TAGS.length]],
        // Numeric points guard the listing renderer's string coercion.
        points: 100 + challengeIndex * 50,
        body: `challenge body ${index}`,
      };
    });
    return {
      ...base.ctfs[0],
      id: `scale-event-${eventIndex}`,
      title: `Synthetic Event ${eventIndex}`,
      event: `Org ${eventIndex % 10}`,
      date,
      description: `Scale event ${eventIndex}`,
      challenges,
      challengeFiles: challenges.map((challenge) => challenge.file),
      challengeCount: challenges.length,
    };
  });

  return { ...base, posts, ctfs };
};

const main = async () => {
  const base = JSON.parse(await readFile(path.join("dist", "content", "runtime-read-model.json"), "utf8"));
  const fixture = buildFixture(base);
  assert.equal(fixture.posts.length + fixture.ctfs.reduce((sum, ctf) => sum + ctf.challenges.length, 0), 500);
  const payload = Buffer.from(JSON.stringify(fixture)).toString("base64");

  const { child, endpoint, userDataDir } = await launchBrowser();
  let session;
  const errors = [];
  try {
    const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
    const page = targets.find((target) => target.type === "page");
    assert.ok(page?.webSocketDebuggerUrl, "a browser page target is available");
    session = await Session.connect(page.webSocketDebuggerUrl);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Fetch.enable", {
      patterns: [{ urlPattern: "*runtime-read-model.json*", requestStage: "Request" }],
    });
    session.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      errors.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
    });
    session.on("Runtime.consoleAPICalled", (params) => {
      if (params.type === "error") errors.push(params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
    });
    session.on("Fetch.requestPaused", async ({ requestId }) => {
      try {
        await session.send("Fetch.fulfillRequest", {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
            { name: "Cache-Control", value: "no-store" },
          ],
          body: payload,
        });
      } catch {
        // The page may navigate while the fixture is being served.
      }
    });

    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 1366, height: 900, deviceScaleFactor: 1, mobile: false,
    });

    const loadSearch = async (url) => {
      await session.goto(`${PREVIEW}${url}`);
      await session.waitFor('document.querySelector("[data-record-count]")?.textContent.includes("FOUND")', "search render");
      await new Promise((resolve) => setTimeout(resolve, 200));
      return session.evaluate(`({
        count: document.querySelector("[data-record-count]").textContent,
        cards: document.querySelectorAll("[data-quest-list] .quest-card").length,
        controls: document.querySelectorAll("[data-search-pagination] [data-search-page]").length,
        topics: document.querySelectorAll("[data-search-topics] button").length,
        years: document.querySelectorAll("[data-search-years] button").length,
        nodes: document.querySelectorAll("*").length,
        firstTitle: document.querySelector("[data-quest-list] .quest-card h2")?.textContent ?? "",
      })`);
    };

    const initial = await loadSearch("/pages/search.html");
    assert.match(initial.count, /FOUND 500 RECORDS/);
    assert.equal(initial.cards, 5, "500 records paginate to five result cards");
    assert.ok(initial.controls >= 4 && initial.controls <= 8, `bounded pagination control count: ${initial.controls}`);
    assert.equal(initial.topics, 22, "all synthetic tags and categories are listed");
    assert.equal(initial.years, 8, "all years plus the all-years control are listed");
    assert.match(initial.count, /100 POSTS · 400 WRITEUPS/);
    const initialFilters = await session.evaluate(`({
      hidden: document.querySelector("[data-active-filters]").hidden,
      chips: document.querySelectorAll("[data-active-filters] [data-filter-kind]").length,
    })`);
    assert.equal(initialFilters.hidden, true, "no chips are shown without filters");
    assert.equal(initialFilters.chips, 0);

    const typing = await session.evaluate(`(() => {
      const input = document.querySelector("[data-search]");
      const terms = ["a", "e", "xor", "heap", "ctf", "zzz", "web", "post 9", "challenge 99", "yaml"];
      const times = [];
      for (const term of terms) {
        const start = performance.now();
        input.value = term;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        times.push(performance.now() - start);
      }
      return { times, max: Math.max(...times) };
    })()`);
    assert.ok(typing.max < 100, `search typing stayed under 100 ms (max ${typing.max.toFixed(1)} ms)`);

    const marker = await session.evaluate(`(() => {
      const input = document.querySelector("[data-search]");
      input.value = "Scale marker";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        count: document.querySelector("[data-record-count]").textContent,
        cards: document.querySelectorAll("[data-quest-list] .quest-card").length,
        title: document.querySelector("[data-quest-list] .quest-card h2")?.textContent ?? "",
      };
    })()`);
    assert.match(marker.count, /FOUND 1 RECORD/);
    assert.equal(marker.cards, 1);
    assert.match(marker.title, /Scale marker post 99/);

    const queryChip = await session.evaluate(`({
      chips: document.querySelectorAll("[data-active-filters] [data-filter-kind]").length,
      kinds: [...document.querySelectorAll("[data-active-filters] [data-filter-kind]")].map((chip) => chip.dataset.filterKind),
      marks: document.querySelectorAll("[data-quest-list] mark.search-hit").length,
    })`);
    assert.equal(queryChip.chips, 1, "the query is represented by one active chip");
    assert.deepEqual(queryChip.kinds, ["query"]);
    assert.ok(queryChip.marks > 0, "matched terms are highlighted");
    await session.evaluate(`document.querySelector('[data-active-filters] [data-filter-kind="query"]').click(); true`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const clearedQuery = await session.evaluate(`({
      count: document.querySelector("[data-record-count]").textContent,
      input: document.querySelector("[data-search]").value,
      hidden: document.querySelector("[data-active-filters]").hidden,
      href: location.search,
    })`);
    assert.match(clearedQuery.count, /FOUND 500 RECORDS/);
    assert.equal(clearedQuery.input, "");
    assert.equal(clearedQuery.hidden, true);
    assert.equal(clearedQuery.href, "");

    await session.evaluate(`document.querySelector('[data-search-filter="posts"]').click(); true`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const postsOnly = await session.evaluate(`({
      count: document.querySelector("[data-record-count]").textContent,
      chips: [...document.querySelectorAll("[data-active-filters] [data-filter-kind]")].map((chip) => chip.dataset.filterKind),
      href: location.search,
    })`);
    assert.match(postsOnly.count, /FOUND 100 RECORDS · 100 POSTS · 0 WRITEUPS/);
    assert.deepEqual(postsOnly.chips, ["type"]);
    assert.match(postsOnly.href, /type=posts/);
    await session.evaluate(`document.querySelector('[data-active-filters] [data-clear-filters]').click(); true`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.match(await session.evaluate(`document.querySelector("[data-record-count]").textContent`), /FOUND 500 RECORDS/);

    const unsafeQuery = await session.evaluate(`(() => {
      const input = document.querySelector("[data-search]");
      input.value = "<script>alert(1)</script>";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        scripts: document.querySelectorAll("[data-quest-list] script").length,
        recovery: Boolean(document.querySelector("[data-quest-list] [data-clear-filters]")),
      };
    })()`);
    assert.equal(unsafeQuery.scripts, 0, "search text is never interpreted as HTML");
    assert.equal(unsafeQuery.recovery, true, "no-result recovery is available");
    await session.evaluate(`document.querySelector('[data-quest-list] [data-clear-filters]').click(); true`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.match(await session.evaluate(`document.querySelector("[data-record-count]").textContent`), /FOUND 500 RECORDS/);

    const topic = await loadSearch("/pages/search.html?topic=heap");
    assert.match(topic.count, /FOUND 30 RECORDS · 10 POSTS · 20 WRITEUPS/, `topic filter count: ${topic.count}`);
    assert.equal(topic.cards, 5);
    assert.ok(await session.evaluate(`Boolean(document.querySelector('[data-active-filters] [data-filter-kind="topic"]'))`), "topic has an active chip");

    const year = await loadSearch("/pages/search.html?year=2026");
    assert.match(year.count, /FOUND 70 RECORDS · 14 POSTS · 56 WRITEUPS/, `year filter count: ${year.count}`);
    assert.equal(year.cards, 5);
    await session.evaluate(`document.querySelector('[data-active-filters] [data-filter-kind="year"]').click(); true`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.match(await session.evaluate(`document.querySelector("[data-record-count]").textContent`), /FOUND 500 RECORDS/);
    assert.equal(await session.evaluate(`document.querySelector("[data-active-filters]").hidden`), true);

    assert.deepEqual(errors, [], "the 500-record search fixture produces no console errors");
    console.log(JSON.stringify({
      fixture: { posts: fixture.posts.length, events: fixture.ctfs.length, challenges: 400, records: 500 },
      initial,
      typing: { maxMs: Math.round(typing.max * 10) / 10 },
      marker,
      topic,
      year,
      errors: errors.length,
      failures: 0,
    }, null, 2));
  } finally {
    if (session) await session.close();
    child.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
};

const watchdog = setTimeout(() => {
  console.error("Search scale test timed out after 120s");
  process.exit(1);
}, 120000);

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
}
