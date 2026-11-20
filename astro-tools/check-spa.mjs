import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PREVIEW, writeupUrl } from "./read-model-test-utils.mjs";

// Browser-level regression checks for the SPA lifecycle and the runtime
// behaviours that the first audit fixed. The suite drives a local Chrome over
// the DevTools protocol, so it needs no test dependency and no headless-browser
// package. Run `npm run preview` first, then `npm run check:spa`.

const WAIT = 30000;
const CTF = "Digital-Pakistan-Red-Team-CTF";
const NO_DIAGRAM_CTF = "cryptohack-Introduction to CryptoHack";
const NO_DIAGRAM = "chall1-Great-Snakes.md";
const DIAGRAM = "hoe-ap.md";
const PROJECT_DETAIL = "/portfolio/projects/radiant-blaze-site.html";

export const browserCandidates = () => {
  if (process.env.MERMAID_BROWSER_BIN) return [process.env.MERMAID_BROWSER_BIN];
  const windowsPaths = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ];
  const unixPaths = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/opt/google/chrome/chrome",
  ];
  const names = process.platform === "win32"
    ? ["chrome.exe", "msedge.exe"]
    : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  return [...(process.platform === "win32" ? windowsPaths : unixPaths), ...names];
};

const spawnBrowser = (binary, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    child.once("error", reject);
    let stderr = "";
    const onData = (chunk) => {
      stderr += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (match) {
        child.stderr.off("data", onData);
        resolve({ child, endpoint: match[1] });
      }
    };
    child.stderr.on("data", onData);
    child.once("exit", (code) => reject(new Error(`browser exited early (${code}): ${stderr.slice(-300)}`)));
  });

export const launchBrowser = async () => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "radiant-blaze-spa-"));
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ];
  const failures = [];
  for (const binary of browserCandidates()) {
    try {
      const launched = await spawnBrowser(binary, args);
      return { ...launched, binary, userDataDir };
    } catch (error) {
      failures.push(`${binary}: ${error.message.split("\n")[0]}`);
    }
  }
  throw new Error(
    `No Chrome/Chromium binary found for the SPA browser tests. Tried:\n  ${failures.join("\n  ")}\n` +
      "Set MERMAID_BROWSER_BIN to the browser executable.",
  );
};

export class Session {
  constructor(socket) {
    this.socket = socket;
    this.pending = new Map();
    this.listeners = new Map();
    this.nextId = 0;
    socket.addEventListener("message", (event) => this.dispatch(JSON.parse(event.data)));
  }

  static async connect(endpoint) {
    const socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error(`Could not connect to ${endpoint}`)), { once: true });
    });
    return new Session(socket);
  }

  dispatch(message) {
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
      else resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, listener) {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }

  async goto(url) {
    await this.send("Page.navigate", { url });
    await this.waitFor('document.readyState === "complete"', `load of ${url}`);
  }

  async waitFor(expression, label) {
    const deadline = Date.now() + WAIT;
    for (;;) {
      if (await this.evaluate(`Boolean(${expression})`)) return;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async spaNavigate(route) {
    await this.evaluate(`(() => {
      const anchor = document.createElement("a");
      anchor.href = ${JSON.stringify(route)};
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      return true;
    })()`);
  }

  async metrics() {
    await this.send("HeapProfiler.collectGarbage");
    const { metrics } = await this.send("Performance.getMetrics");
    const read = (name) => metrics.find((item) => item.name === name)?.value ?? 0;
    return {
      heap: read("JSHeapUsedSize"),
      nodes: read("Nodes"),
      listeners: read("JSEventListeners"),
      documents: read("Documents"),
    };
  }

  async close() {
    try {
      await this.send("Browser.close");
    } catch {
      // The browser may already be gone; closing the socket is enough.
    }
    this.socket.close();
  }
}

const stage = (name) => console.error(`[spa] ${name}`);

const testConditionalMermaidLoading = async (session) => {
  const requested = [];
  session.on("Network.requestWillBeSent", ({ request }) => requested.push(request.url));
  await session.goto(`${PREVIEW}${writeupUrl(NO_DIAGRAM_CTF, NO_DIAGRAM)}`);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const withoutDiagram = requested.filter((url) => /mermaid|QuestShell\.astro_astro_type_script/i.test(url));
  assert.equal(withoutDiagram.length, 0, "articles without diagrams must not load the Mermaid viewer");

  requested.length = 0;
  await session.goto(`${PREVIEW}${writeupUrl(CTF, DIAGRAM)}`);
  await session.waitFor('document.querySelectorAll(".diagram__stage > svg").length > 0', "diagram render");
  const withDiagram = requested.filter((url) => /mermaid|QuestShell\.astro_astro_type_script/i.test(url));
  assert.ok(withDiagram.length > 0, "articles with diagrams load the Mermaid viewer");
  const counts = await session.evaluate(`({
    blocks: document.querySelectorAll('pre > code[data-language="mermaid"]').length,
    svgs: document.querySelectorAll(".diagram__stage > svg").length,
  })`);
  assert.equal(counts.svgs, counts.blocks, "one SVG is rendered per Mermaid block");
  return { withoutDiagramRequests: withoutDiagram.length, withDiagramRequests: withDiagram.length, ...counts };
};

const testThemeSwitch = async (session) => {
  const before = await session.evaluate(`document.querySelectorAll(".diagram__stage > svg").length`);
  await session.evaluate(`document.querySelector("[data-theme-toggle]").click(); true`);
  await session.waitFor('document.documentElement.classList.contains("light-theme")', "light theme");
  await new Promise((resolve) => setTimeout(resolve, 800));
  const after = await session.evaluate(`({
    theme: document.documentElement.classList.contains("light-theme") ? "light" : "dark",
    svgs: document.querySelectorAll(".diagram__stage > svg").length,
    figures: document.querySelectorAll(".diagram").length,
  })`);
  await session.evaluate(`document.querySelector("[data-theme-toggle]").click(); true`);
  await session.waitFor('document.documentElement.classList.contains("dark-theme")', "dark theme");
  assert.equal(after.svgs, before, "theme switching must not duplicate diagram SVGs");
  assert.equal(after.figures, before, "theme switching must not duplicate diagram figures");
  return { before, after };
};

const testSpaStability = async (session) => {
  await session.goto(`${PREVIEW}/`);
  const routes = [
    "/pages/blog.html",
    "/pages/ctf.html",
    "/pages/search.html?q=xor",
    "/portfolio.html",
    PROJECT_DETAIL,
    "/generated/posts/linux/021-tiny-command-line-toolkit.html",
    writeupUrl(CTF, DIAGRAM),
    "/",
  ];
  const rows = [];
  for (let cycle = 0; cycle < 4; cycle += 1) {
    for (const route of routes) {
      await session.spaNavigate(route);
      if (route.includes("/writeups/")) {
        await session.waitFor('document.querySelectorAll(".diagram__stage > svg").length > 0', `diagram in cycle ${cycle}`);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    rows.push(await session.metrics());
  }
  const firstSettled = rows[1];
  const last = rows.at(-1);
  assert.ok(last.nodes - firstSettled.nodes < 200, `SPA navigation leaked DOM: ${firstSettled.nodes} -> ${last.nodes}`);
  assert.ok(last.listeners - firstSettled.listeners < 15, `SPA navigation leaked listeners: ${firstSettled.listeners} -> ${last.listeners}`);
  assert.ok(last.heap - firstSettled.heap < 2 * 1024 * 1024, "SPA navigation grew the heap by more than 2 MB");

  // Direct navigation and refresh of the generated project route.
  await session.goto(`${PREVIEW}${PROJECT_DETAIL}`);
  await session.waitFor('document.querySelector("h1.quest-title")?.textContent?.includes("Radiant Blaze Website")', "project detail heading");
  const firstTitle = await session.evaluate(`document.querySelector("h1.quest-title").textContent.trim()`);
  await session.goto(`${PREVIEW}${PROJECT_DETAIL}`);
  const refreshedTitle = await session.evaluate(`document.querySelector("h1.quest-title").textContent.trim()`);
  assert.equal(firstTitle, refreshedTitle, "project detail survives a direct refresh");

  return { rows, projectDetail: { firstTitle, refreshedTitle, route: PROJECT_DETAIL } };
};

const readSpaMetadata = (session) => session.evaluate(`({
  path: location.pathname,
  title: document.title,
  canonical: document.querySelector('link[rel="canonical"]')?.href ?? "",
  description: document.querySelector('meta[name="description"]')?.content ?? "",
  ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? "",
  ogDescription: document.querySelector('meta[property="og:description"]')?.content ?? "",
  ogUrl: document.querySelector('meta[property="og:url"]')?.content ?? "",
  ogType: document.querySelector('meta[property="og:type"]')?.content ?? "",
  counts: {
    canonical: document.querySelectorAll('link[rel="canonical"]').length,
    description: document.querySelectorAll('meta[name="description"]').length,
    ogTitle: document.querySelectorAll('meta[property="og:title"]').length,
    ogDescription: document.querySelectorAll('meta[property="og:description"]').length,
    ogUrl: document.querySelectorAll('meta[property="og:url"]').length,
  },
})`);

const testHomepageFonts = async (session) => {
  await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      window.__homepageCls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__homepageCls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    })();`,
  });
  await session.goto(`${PREVIEW}/`);
  const data = await session.evaluate(`(async () => {
    await document.fonts.ready;
    const preloads = [...document.querySelectorAll('link[rel="preload"][as="font"]')];
    const stylesheet = document.querySelector('link[rel="stylesheet"]');
    const stylesheetIndex = [...document.head.children].indexOf(stylesheet);
    const preloadState = preloads.map((link) => ({
      href: link.getAttribute("href"),
      index: [...document.head.children].indexOf(link),
    }));
    return {
      preloads: preloadState,
      stylesheetIndex,
      fonts: [...document.fonts].filter((font) => ["SF Pixelate", "Press Start K"].includes(font.family)).map((font) => [font.family, font.status]),
      heroFont: getComputedStyle(document.querySelector(".hero h1")).fontFamily,
      uiFont: getComputedStyle(document.querySelector(".home-nav a")).fontFamily,
      cls: window.__homepageCls,
    };
  })()`);
  for (const url of [
    "/assets/fonts/press-start/press-start-k.woff2",
    "/assets/fonts/sf-pixelate/sf-pixelate-bold.woff2",
  ]) {
    const preload = data.preloads.find((item) => item.href === url);
    assert.ok(preload, `homepage preloads ${url}`);
    assert.ok(preload.index < data.stylesheetIndex, `${url} preload precedes the stylesheet`);
  }
  assert.ok(data.heroFont.includes("Press Start K"), "hero uses the display face");
  assert.ok(data.uiFont.includes("SF Pixelate"), "navigation uses the UI face");
  assert.ok(data.fonts.every(([, status]) => status === "loaded"), "critical homepage fonts finish loading");
  assert.ok(data.cls < 0.1, `homepage layout shift is below 0.1 (got ${data.cls})`);
  return { preloads: data.preloads.map((item) => item.href), fonts: data.fonts, cls: data.cls };
};

const testSpaMetadata = async (session) => {
  await session.goto(`${PREVIEW}/`);
  const home = await readSpaMetadata(session);
  assert.equal(home.canonical, "https://radiant-blaze.github.io/", "home canonical");
  assert.equal(home.description, "A pixel-powered cybersecurity portfolio with software field notes and CTF writeups.", "home description");

  await session.spaNavigate(PROJECT_DETAIL);
  await session.waitFor(`location.pathname === ${JSON.stringify(PROJECT_DETAIL)}`, "project path");
  const project = await readSpaMetadata(session);
  assert.equal(project.title, "Radiant Blaze Website · Portfolio · Radiant Blaze", "project title after SPA");
  assert.equal(project.canonical, "https://radiant-blaze.github.io/portfolio/projects/radiant-blaze-site.html", "project canonical after SPA");
  assert.equal(project.description, "A content-driven personal site for software notes, Linux workflows, and cybersecurity writeups.", "project description after SPA");
  assert.equal(project.ogTitle, "Radiant Blaze Website · Radiant Blaze", "project og:title after SPA");
  assert.equal(project.ogUrl, "https://radiant-blaze.github.io/portfolio/projects/radiant-blaze-site.html", "project og:url after SPA");
  assert.equal(project.ogDescription, project.description, "project og:description after SPA");
  for (const [name, count] of Object.entries(project.counts)) assert.equal(count, 1, `project has one ${name} element`);

  await session.spaNavigate("/portfolio.html");
  await session.waitFor('location.pathname === "/portfolio.html"', "portfolio path");
  const portfolio = await readSpaMetadata(session);
  assert.equal(portfolio.title, "Portfolio · Radiant Blaze", "portfolio title after SPA");
  assert.equal(portfolio.canonical, "https://radiant-blaze.github.io/portfolio/", "portfolio canonical after SPA");
  assert.equal(portfolio.description, "A personal portfolio of software projects, areas of learning, and CTF writeups.", "portfolio description after SPA");
  assert.equal(portfolio.ogUrl, "https://radiant-blaze.github.io/portfolio/", "portfolio og:url after SPA");

  await session.evaluate("history.back(); true");
  await session.waitFor(`location.pathname === ${JSON.stringify(PROJECT_DETAIL)} && document.querySelector('link[rel="canonical"]')?.href === ${JSON.stringify("https://radiant-blaze.github.io/portfolio/projects/radiant-blaze-site.html")}`, "back to project");
  const backProject = await readSpaMetadata(session);
  assert.equal(backProject.canonical, project.canonical, "back restores project canonical");
  assert.equal(backProject.description, project.description, "back restores project description");
  assert.equal(backProject.ogTitle, project.ogTitle, "back restores project og:title");

  await session.evaluate("history.back(); true");
  await session.waitFor(`location.pathname === "/" && document.querySelector('link[rel="canonical"]')?.href === ${JSON.stringify("https://radiant-blaze.github.io/")}`, "back to home");
  const backHome = await readSpaMetadata(session);
  assert.equal(backHome.canonical, home.canonical, "back restores home canonical");
  assert.equal(backHome.description, home.description, "back restores home description");

  await session.evaluate("history.forward(); true");
  await session.waitFor(`location.pathname === ${JSON.stringify(PROJECT_DETAIL)} && document.querySelector('link[rel="canonical"]')?.href === ${JSON.stringify("https://radiant-blaze.github.io/portfolio/projects/radiant-blaze-site.html")}`, "forward to project");
  const forwardProject = await readSpaMetadata(session);
  assert.equal(forwardProject.canonical, project.canonical, "forward restores project canonical");
  assert.equal(forwardProject.ogUrl, project.ogUrl, "forward restores project og:url");

  await session.spaNavigate(writeupUrl(CTF, DIAGRAM));
  await session.waitFor(`location.pathname === ${JSON.stringify(writeupUrl(CTF, DIAGRAM))} && document.querySelector('meta[property="og:type"]')?.content === "article"`, "writeup metadata");
  const writeup = await readSpaMetadata(session);
  assert.equal(writeup.ogType, "article", "writeup replaces og:type with article");
  assert.ok(writeup.canonical.endsWith(writeupUrl(CTF, DIAGRAM)), "writeup canonical after SPA");

  await session.goto(`${PREVIEW}${PROJECT_DETAIL}`);
  const direct = await readSpaMetadata(session);
  assert.equal(direct.canonical, project.canonical, "direct project load canonical");
  await session.goto(`${PREVIEW}${PROJECT_DETAIL}`);
  const refreshed = await readSpaMetadata(session);
  assert.equal(refreshed.canonical, project.canonical, "project refresh canonical");

  return { home: home.canonical, project: project.canonical, portfolio: portfolio.canonical, back: backProject.canonical, forward: forwardProject.canonical, writeupType: writeup.ogType, direct: direct.canonical };
};

const testMusicSingleton = async (session) => {
  await session.goto(`${PREVIEW}/`);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const before = await session.metrics();
  const singleton = await session.evaluate(`({
    roots: document.querySelectorAll("#rb-music-root").length,
    audio: document.querySelectorAll("audio[data-radiant-blaze-music]").length,
    same: window.RadiantBlazeMusic?.audio === document.querySelector("audio[data-radiant-blaze-music]"),
  })`);
  assert.equal(singleton.roots, 1, "exactly one music root");
  assert.equal(singleton.audio, 1, "exactly one music audio element");
  assert.equal(singleton.same, true, "the advertised audio instance is the rendered one");

  for (let index = 0; index < 5; index += 1) {
    await session.evaluate(`document.querySelector('[data-music-action="open"]').click(); true`);
    await session.waitFor('document.querySelector("#rb-music-player").hidden === false', "music open");
    await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await session.waitFor('document.querySelector("#rb-music-player").hidden === true', "music close");
  }
  const after = await session.metrics();
  assert.ok(after.listeners - before.listeners < 5, `music open/close leaked listeners: ${before.listeners} -> ${after.listeners}`);
  return { singleton, listenerDelta: after.listeners - before.listeners };
};

const testReducedMotion = async (session) => {
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await session.goto(`${PREVIEW}/`);
  const scrollBehavior = await session.evaluate(`getComputedStyle(document.documentElement).scrollBehavior`);
  assert.equal(scrollBehavior, "auto", "reduced motion disables smooth scrolling");

  await session.goto(`${PREVIEW}/pages/ctf.html`);
  await session.waitFor('document.querySelectorAll(".event-viewport__screen").length > 0', "CTF posters");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const sources = await session.evaluate(`[...document.querySelectorAll(".event-viewport__screen")].map((image) => image.getAttribute("src"))`);
  assert.ok(sources.length > 0, "CTF cards have viewport images");
  assert.ok(sources.every((source) => source.includes("/ctf-animations/static/")), "reduced motion uses static posters");
  await session.send("Emulation.setEmulatedMedia", { features: [] });
  return { scrollBehavior, staticSources: sources.length };
};

const testOffscreenPause = async (session) => {
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: 800, height: 600, deviceScaleFactor: 1, mobile: false,
  });
  await session.goto(`${PREVIEW}/pages/ctf.html`);
  await session.waitFor('document.querySelectorAll(".event-viewport__screen").length > 0', "CTF posters");
  await new Promise((resolve) => setTimeout(resolve, 600));
  const firstAnimated = await session.evaluate(`document.querySelector(".event-viewport__screen").getAttribute("src").includes("/static/") === false`);
  assert.equal(firstAnimated, true, "a visible card uses the animated poster");
  await session.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight); true`);
  await new Promise((resolve) => setTimeout(resolve, 600));
  const firstStatic = await session.evaluate(`document.querySelector(".event-viewport__screen").getAttribute("src").includes("/static/")`);
  assert.equal(firstStatic, true, "an offscreen card falls back to the static poster");
  await session.send("Emulation.clearDeviceMetricsOverride");
  return { firstAnimated, firstStatic };
};

const testPosterObserverLifecycle = async (session) => {
  await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      window.__posterObserverAudit = { created: 0, disconnected: 0, active: 0 };
      const Native = window.IntersectionObserver;
      window.IntersectionObserver = class extends Native {
        constructor(...args) {
          super(...args);
          this.__posterAuditTracked = true;
          window.__posterObserverAudit.created += 1;
          window.__posterObserverAudit.active += 1;
        }
        disconnect() {
          if (this.__posterAuditTracked) {
            this.__posterAuditTracked = false;
            window.__posterObserverAudit.disconnected += 1;
            window.__posterObserverAudit.active -= 1;
          }
          super.disconnect();
        }
      };
    })();`,
  });
  await session.goto(`${PREVIEW}/pages/ctf.html`);
  await session.waitFor('document.querySelectorAll(".event-viewport__screen").length > 0', "CTF posters for observer audit");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const initial = await session.evaluate("({ ...window.__posterObserverAudit })");
  assert.equal(initial.created, 1, "the CTF page creates exactly one poster IntersectionObserver");

  await session.spaNavigate("/pages/blog.html");
  await session.waitFor('location.pathname === "/pages/blog.html"', "leave CTF page");
  await new Promise((resolve) => setTimeout(resolve, 300));
  const left = await session.evaluate("({ ...window.__posterObserverAudit })");
  assert.equal(left.active, 0, "leaving the CTF page disconnects its poster observer");

  await session.spaNavigate("/pages/ctf.html");
  await session.waitFor('document.querySelectorAll(".event-viewport__screen").length > 0', "return to CTF page");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const returned = await session.evaluate("({ ...window.__posterObserverAudit })");
  assert.equal(returned.active, 1, "returning to the CTF page has one active poster observer");
  assert.equal(returned.created, initial.created + 1, "returning creates one replacement poster observer");
  return { initial, left, returned };
};

const main = async () => {
  stage("launching browser");
  const { child, endpoint, userDataDir, binary } = await launchBrowser();
  stage(`browser ready (${binary})`);
  let session;
  try {
    const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
    const page = targets.find((target) => target.type === "page");
    assert.ok(page?.webSocketDebuggerUrl, "a browser page target is available");
    session = await Session.connect(page.webSocketDebuggerUrl);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Network.enable");
    await session.send("Performance.enable");
    await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 1366, height: 900, deviceScaleFactor: 1, mobile: false,
    });

    stage("A: conditional Mermaid loading");
    const conditional = await testConditionalMermaidLoading(session);
    stage("B: theme switching");
    const theme = await testThemeSwitch(session);
    stage("C: SPA DOM/listener stability");
    const stability = await testSpaStability(session);
    stage("D: homepage font loading");
    const homepageFonts = await testHomepageFonts(session);
    stage("E: SPA metadata");
    const spaMetadata = await testSpaMetadata(session);
    stage("E: music singleton and Escape");
    const music = await testMusicSingleton(session);
    stage("E: reduced motion");
    const reducedMotion = await testReducedMotion(session);
    stage("F: offscreen poster pause");
    const offscreen = await testOffscreenPause(session);
    stage("G: poster observer lifecycle");
    const posterObservers = await testPosterObserverLifecycle(session);

    console.log(JSON.stringify({
      browser: binary,
      conditionalMermaid: conditional,
      themeSwitch: theme,
      spaStability: stability,
      homepageFonts,
      spaMetadata,
      music,
      reducedMotion,
      offscreen,
      posterObservers,
      failures: 0,
    }, null, 2));
  } finally {
    if (session) await session.close();
    child.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
};

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const watchdog = setTimeout(() => {
    console.error("SPA browser tests timed out after 240s");
    process.exit(1);
  }, 240000);

  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
  }
}
