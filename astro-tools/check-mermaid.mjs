import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PREVIEW, getText, writeupUrl } from "./read-model-test-utils.mjs";

// Browser-level checks for the Mermaid integration. They drive a local Chrome
// over the DevTools protocol using Node's built-in WebSocket, so the suite
// needs no test dependency and no headless-browser package.
//
// Set MERMAID_BROWSER_BIN to point at a browser binary explicitly; otherwise
// the usual Chrome/Chromium locations and PATH names are tried. A missing
// browser is a failure, never a silent pass.

const CTF = "Digital-Pakistan-Red-Team-CTF";
const DIAGRAM_PAGES = ["meeeps.md", "hoe-ap.md", "helios-vault.md", "promise.md", "spec-warden.md"];
const CDN_PATTERN = "*cdn.jsdelivr.net*";
const WAIT = 30000;

const browserCandidates = () => {
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
  const names =
    process.platform === "win32"
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

const launchBrowser = async () => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "radiant-blaze-mermaid-"));
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
    `No Chrome/Chromium binary found for the Mermaid browser tests. Tried:\n  ${failures.join("\n  ")}\n` +
      "Install Chrome/Chromium or set MERMAID_BROWSER_BIN.",
  );
};

class Session {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
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
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
    return () => {
      const next = (this.listeners.get(method) ?? []).filter((item) => item !== listener);
      this.listeners.set(method, next);
    };
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
    const marker = `goto-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    // Mark the current document so the wait below cannot be satisfied by the
    // page we are navigating away from.
    await this.evaluate(`window.__gotoMarker = ${JSON.stringify(marker)}`).catch(() => {});
    await this.send("Page.navigate", { url });
    await this.waitFor(
      `window.__gotoMarker !== ${JSON.stringify(marker)} && document.readyState === "complete"`,
      `load of ${url}`,
    );
  }

  async waitFor(expression, label) {
    const deadline = Date.now() + WAIT;
    for (;;) {
      if (await this.evaluate(`Boolean(${expression})`)) return;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label ?? expression}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
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

// Helpers evaluated inside the page.
const PAGE_HELPERS = `
  const diagramSvgs = () => document.querySelectorAll(".quest-article .diagram svg");
  const diagramBlocks = () => document.querySelectorAll('.quest-article pre > code[data-language="mermaid"]');
  const tokenValue = (token) => {
    const probe = document.createElement("span");
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  };
`;

const run = (body) => `(() => { ${PAGE_HELPERS} ${body} })()`;

const consoleWarnings = (session) => {
  const messages = [];
  session.on("Runtime.consoleAPICalled", (params) => {
    if (params.type !== "warning") return;
    messages.push(params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
  });
  return messages;
};

const testSuccessfulRendering = async (session) => {
  const warnings = consoleWarnings(session);
  for (const page of DIAGRAM_PAGES) {
    const route = writeupUrl(CTF, page);
    // The server-rendered HTML must keep the fence: that is both the no-JS
    // fallback and the input the browser renders from.
    const html = await getText(route);
    assert.ok(html.includes('data-language="mermaid"'), `${page} ships its diagram source in the HTML`);
    assert.ok(html.includes("flowchart TD"), `${page} ships a Mermaid flowchart`);

    await session.goto(`${PREVIEW}${route}`);
    await session.waitFor(
      run('return diagramSvgs().length > 0 && diagramSvgs().length === diagramBlocks().length'),
      `${page} diagram`,
    );
    const state = await session.evaluate(
      run(`
        const blocks = [...diagramBlocks()];
        const shapeFor = (node) => node?.querySelector(":scope > rect, :scope > polygon, :scope > path, :scope > circle, :scope > ellipse");
        const shape = shapeFor(document.querySelector(".quest-article .diagram svg .node"));
        return {
          svgInsideArticle: !!document.querySelector(".quest-article .diagram svg"),
          blocks: blocks.length,
          svgs: diagramSvgs().length,
          allHidden: blocks.every((code) => code.closest("pre").hidden),
          sourcesKept: blocks.every((code) => code.textContent.includes("flowchart TD")),
          nodeFill: shape ? getComputedStyle(shape).fill : null,
          panelToken: tokenValue("--panel"),
          roleStrokes: [...document.querySelectorAll(".quest-article .diagram svg .node")].map((node) => {
            const shape = shapeFor(node);
            return { cls: [...node.classList].join(" "), stroke: shape ? getComputedStyle(shape).stroke : null };
          }),
          pinkToken: tokenValue("--accent-pink"),
          orangeToken: tokenValue("--accent-orange"),
        };
      `),
    );
    assert.equal(state.blocks, state.svgs, `${page}: every Mermaid block became one diagram`);
    assert.ok(state.svgInsideArticle, `${page}: the SVG lives in the article container`);
    assert.ok(state.allHidden, `${page}: the source block is hidden once rendered`);
    assert.ok(state.sourcesKept, `${page}: the source block is preserved for re-renders`);
    assert.equal(state.nodeFill, state.panelToken, `${page}: node fill comes from the --panel token`);
    const vuln = state.roleStrokes.find((node) => node.cls.split(" ").includes("vuln"));
    const attacker = state.roleStrokes.find((node) => node.cls.split(" ").includes("attacker"));
    assert.equal(vuln?.stroke, state.orangeToken, `${page}: vuln role stroke comes from --accent-orange`);
    assert.equal(attacker?.stroke, state.pinkToken, `${page}: attacker role stroke comes from --accent-pink`);
  }
  const diagramErrors = warnings.filter((message) => message.includes("Diagram could not"));
  assert.deepEqual(diagramErrors, [], "no diagram failed to render (no Mermaid parse errors)");
  return DIAGRAM_PAGES.length;
};

const testCdnFailure = async (session) => {
  await session.send("Network.enable");
  await session.send("Network.setBlockedURLs", { urls: [CDN_PATTERN] });
  try {
    const route = writeupUrl(CTF, "meeeps.md");
    await session.goto(`${PREVIEW}${route}`);
    await session.waitFor('document.querySelectorAll(".quest-article h2").length > 5', "article ready");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const state = await session.evaluate(
      run(`
        const blocks = [...diagramBlocks()];
        return {
          blocks: blocks.length,
          diagrams: document.querySelectorAll(".quest-article .diagram").length,
          visible: blocks.every((code) => {
            const pre = code.closest("pre");
            return !pre.hidden && pre.getBoundingClientRect().height > 0;
          }),
          headings: document.querySelectorAll(".quest-article h2").length,
          articleLength: document.querySelector(".quest-article").textContent.length,
        };
      `),
    );
    assert.ok(state.blocks > 0, "the diagram source is still in the DOM when the CDN is blocked");
    assert.equal(state.diagrams, 0, "no diagram is rendered when the CDN is blocked");
    assert.ok(state.visible, "the code block stays visible as the fallback");
    assert.ok(state.headings >= 5, "the article still rendered");
    assert.ok(state.articleLength > 1000, "the page did not break");
    return state.blocks;
  } finally {
    await session.send("Network.setBlockedURLs", { urls: [] });
    await session.send("Network.disable");
  }
};

const testSpaNavigation = async (session) => {
  await session.goto(`${PREVIEW}/pages/ctf.html?ctf=${encodeURIComponent(CTF)}`);
  await session.waitFor('document.querySelectorAll(\'a[href*="writeups"]\').length > 0', "event challenge cards");
  await session.evaluate(run(`window.__spaSentinel = "alive"; return true;`));
  await session.evaluate(
    run(`
      const link = [...document.querySelectorAll('a[href*="writeups"]')].find((item) => item.href.includes("meeeps"));
      link.click();
      return true;
    `),
  );
  await session.waitFor(run('return diagramSvgs().length > 0'), "diagram after SPA navigation into a generated writeup");
  const generated = await session.evaluate(run(`return { sentinel: window.__spaSentinel, svgs: diagramSvgs().length };`));
  assert.equal(generated.sentinel, "alive", "SPA navigation into a writeup did not reload the document");
  assert.ok(generated.svgs > 0, "the diagram rendered after SPA navigation");

  // Client-rendered writeup path (astro-pages.js) through the same router.
  const clientRoute = `/pages/writeup.html?ctf=${encodeURIComponent(CTF)}&challenge=meeeps.md`;
  await session.evaluate(
    run(`
      const link = document.createElement("a");
      link.href = ${JSON.stringify(clientRoute)};
      document.body.append(link);
      link.click();
      return true;
    `),
  );
  await session.waitFor(run(`return !!document.querySelector('[data-writeup] code[data-language="mermaid"]') && diagramSvgs().length > 0`), "diagram in the client-rendered writeup view");
  const clientRendered = await session.evaluate(
    run(`return { sentinel: window.__spaSentinel, svgs: diagramSvgs().length, hidden: [...diagramBlocks()].every((code) => code.closest("pre").hidden) };`),
  );
  assert.equal(clientRendered.sentinel, "alive", "client-rendered navigation kept the document");
  assert.ok(clientRendered.svgs > 0, "the diagram rendered in the client-rendered writeup view");
  assert.ok(clientRendered.hidden, "the source block is hidden after client-side rendering");
  return [generated.svgs, clientRendered.svgs];
};

const testThemeSwitch = async (session) => {
  await session.goto(`${PREVIEW}${writeupUrl(CTF, "spec-warden.md")}`);
  await session.waitFor(run('return diagramSvgs().length > 0'), "diagram before theme switch");
  const before = await session.evaluate(
    run(`
      const rect = document.querySelector(".quest-article .diagram svg .node rect");
      return {
        theme: document.documentElement.classList.contains("light-theme") ? "light" : "dark",
        fill: getComputedStyle(rect).fill,
        svgs: diagramSvgs().length,
        svgMarkup: document.querySelector(".quest-article .diagram svg").outerHTML.length,
      };
    `),
  );
  assert.equal(before.theme, "dark", "the site starts in the dark theme");
  await session.evaluate(
    run(`
      document.querySelector("[data-theme-toggle]").click();
      return true;
    `),
  );
  await session.waitFor(
    `document.documentElement.classList.contains("light-theme") &&
     getComputedStyle(document.querySelector(".quest-article .diagram svg .node rect")).fill !== ${JSON.stringify(before.fill)}`,
    "diagram re-rendered for the light theme",
  );
  const after = await session.evaluate(
    run(`
      const rect = document.querySelector(".quest-article .diagram svg .node rect");
      return {
        theme: document.documentElement.classList.contains("light-theme") ? "light" : "dark",
        fill: getComputedStyle(rect).fill,
        panelToken: tokenValue("--panel"),
        svgs: diagramSvgs().length,
      };
    `),
  );
  assert.equal(after.theme, "light", "the light theme is applied");
  assert.notEqual(after.fill, before.fill, "the diagram was re-rendered, not merely recoloured");
  assert.equal(after.fill, after.panelToken, "the light diagram uses the light --panel token");
  assert.equal(after.svgs, before.svgs, "re-rendering did not duplicate diagrams");
  // Return the site to its default theme for any later assertions.
  await session.evaluate(run(`document.querySelector("[data-theme-toggle]").click(); return true;`));
  return { before: before.theme, after: after.theme };
};

const testMobileLayout = async (session) => {
  const results = [];
  for (const [width, height, mobile] of [[390, 844, true], [768, 1024, false]]) {
    await session.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await session.goto(`${PREVIEW}${writeupUrl(CTF, "hoe-ap.md")}`);
    await session.waitFor(run('return diagramSvgs().length > 0'), `diagram at ${width}x${height}`);
    const state = await session.evaluate(
      run(`
        const diagram = document.querySelector(".quest-article .diagram");
        const styles = getComputedStyle(diagram);
        return {
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          containerOverflowX: styles.overflowX,
          containerMaxWidth: styles.maxWidth,
          containerWidth: diagram.clientWidth,
          svgWidth: diagram.querySelector("svg").getBoundingClientRect().width,
        };
      `),
    );
    assert.ok(state.pageOverflow <= 1, `${width}x${height}: the page does not overflow horizontally`);
    assert.equal(state.containerOverflowX, "auto", `${width}x${height}: wide diagrams scroll inside their container`);
    assert.equal(state.containerMaxWidth, "100%", `${width}x${height}: the diagram container is width-bound`);
    results.push({ viewport: `${width}x${height}`, pageOverflow: state.pageOverflow, svgWidth: Math.round(state.svgWidth) });
  }
  await session.send("Emulation.clearDeviceMetricsOverride");
  return results;
};

const stage = (name) => console.error(`[mermaid] ${name}`);

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
    stage("devtools session connected");
    await session.send("Page.enable");
    await session.send("Runtime.enable");

    stage("A: rendering diagrams");
    const diagrams = await testSuccessfulRendering(session);
    stage("B: blocking the CDN");
    const fallbackBlocks = await testCdnFailure(session);
    stage("C: SPA navigation");
    const spa = await testSpaNavigation(session);
    stage("D: theme switching");
    const theme = await testThemeSwitch(session);
    stage("E: mobile layout");
    const mobile = await testMobileLayout(session);

    console.log(
      JSON.stringify(
        {
          browser: binary,
          diagramsRendered: diagrams,
          cdnFailureKeptSourceBlocks: fallbackBlocks,
          spaNavigationDiagrams: spa,
          themeSwitch: theme,
          mobileLayout: mobile,
          failures: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    if (session) await session.close();
    child.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
};

// A ref'd watchdog keeps the event loop alive, so a stalled CDP call fails
// loudly instead of letting Node exit with `main()` still pending.
const watchdog = setTimeout(() => {
  console.error("Mermaid browser tests timed out after 300s");
  process.exit(1);
}, 300000);

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
}
