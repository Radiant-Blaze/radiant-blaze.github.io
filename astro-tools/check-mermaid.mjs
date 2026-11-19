import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
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
  const diagramSvgs = () => document.querySelectorAll(".quest-article .diagram__stage > svg");
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

const UNSAFE_JS_FRAGMENT_CHARACTERS = {
  "<": "\\u003C",
  ">": "\\u003E",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

const escapeUnsafeJsFragment = (str) =>
  JSON.stringify(str).replace(/[<>&\u2028\u2029]/g, (character) => UNSAFE_JS_FRAGMENT_CHARACTERS[character]);

const run = (body) =>
  `(() => { ${PAGE_HELPERS} return eval("(function(){" + ${escapeUnsafeJsFragment(body)} + "})")(); })()`;

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
        const shape = shapeFor(document.querySelector(".quest-article .diagram__stage svg .node"));
        return {
          svgInsideArticle: !!document.querySelector(".quest-article .diagram__stage > svg"),
          blocks: blocks.length,
          svgs: diagramSvgs().length,
          figures: document.querySelectorAll(".quest-article .diagram").length,
          allHidden: blocks.every((code) => code.closest("pre").hidden),
          sourcesKept: blocks.every((code) => code.textContent.includes("flowchart TD")),
          nodeFill: shape ? getComputedStyle(shape).fill : null,
          panelToken: tokenValue("--panel"),
          roleStrokes: [...document.querySelectorAll(".quest-article .diagram__stage svg .node")].map((node) => {
            const shape = shapeFor(node);
            return { cls: [...node.classList].join(" "), stroke: shape ? getComputedStyle(shape).stroke : null };
          }),
          pinkToken: tokenValue("--accent-pink"),
          orangeToken: tokenValue("--accent-orange"),
          fontsReady: [...document.querySelectorAll(".quest-article .diagram")].every((figure) => figure.dataset.fontsReady === "loaded" || figure.dataset.fontsReady === "settled"),
          fontStates: [...document.querySelectorAll(".quest-article .diagram")].map((figure) => figure.dataset.fontsReady),
          fontStatus: document.fonts.status,
          labelled: [...document.querySelectorAll(".quest-article .diagram__stage")].every((stage) => {
            const label = stage.getAttribute("aria-label") || "";
            return stage.getAttribute("role") === "img" && label.length > 0;
          }),
          controls: [...document.querySelectorAll(".quest-article .diagram")].every((figure) => {
            const buttons = [...figure.querySelectorAll(".diagram__bar button")];
            return buttons.length === 3 && buttons.every((button) => button.getAttribute("aria-label"));
          }),
        };
      `),
    );
    assert.equal(state.blocks, state.svgs, `${page}: every Mermaid block became one diagram`);
    assert.equal(state.figures, state.blocks, `${page}: every block has exactly one viewer frame`);
    assert.ok(state.svgInsideArticle, `${page}: the SVG lives in the article container`);
    assert.ok(state.allHidden, `${page}: the source block is hidden once rendered`);
    assert.ok(state.sourcesKept, `${page}: the source block is preserved for re-renders`);
    assert.ok(state.fontsReady, `${page}: diagrams render after fonts are ready (${JSON.stringify(state.fontStates)} / ${state.fontStatus})`);
    assert.ok(state.labelled, `${page}: every rendered diagram has an accessible name`);
    assert.ok(state.controls, `${page}: every viewer exposes source, copy, and expand controls with labels`);
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

const testOfflineRendering = async (session) => {
  await session.send("Network.enable");
  await session.send("Network.setBlockedURLs", { urls: [CDN_PATTERN] });
  try {
    await session.goto(`${PREVIEW}${writeupUrl(CTF, "spec-warden.md")}`);
    await session.waitFor(run("return diagramSvgs().length > 0"), "local diagram with external CDNs blocked");
    const state = await session.evaluate(
      run(`
        return {
          svgs: diagramSvgs().length,
          blocks: diagramBlocks().length,
          errors: document.querySelectorAll(".diagram-error").length,
          headings: document.querySelectorAll(".quest-article h2").length,
        };
      `),
    );
    assert.equal(state.svgs, state.blocks, "locally bundled Mermaid renders while external CDNs are blocked");
    assert.equal(state.errors, 0, "no diagram error is shown when only external CDNs are blocked");
    assert.ok(state.headings >= 5, "the article still renders");
    return state.svgs;
  } finally {
    await session.send("Network.setBlockedURLs", { urls: [] });
  }
};

const testMissingModule = async (session) => {
  await session.send("Network.enable");
  await session.send("Network.setBlockedURLs", { urls: ["*mermaid*"] });
  try {
    await session.goto(`${PREVIEW}${writeupUrl(CTF, "hoe-ap.md")}`);
    await session.waitFor('document.querySelector(".diagram-error") !== null', "module-missing fallback");
    const blocked = await session.evaluate(
      run(`
        const blocks = [...diagramBlocks()];
        return {
          blocks: blocks.length,
          svgs: diagramSvgs().length,
          visible: blocks.every((code) => !code.closest("pre").hidden && code.closest("pre").getBoundingClientRect().height > 0),
          error: document.querySelector(".diagram-error").textContent,
          headings: document.querySelectorAll(".quest-article h2").length,
        };
      `),
    );
    assert.ok(blocked.blocks > 0, "the diagram source remains in the DOM");
    assert.equal(blocked.svgs, 0, "no SVG is inserted when the Mermaid module cannot load");
    assert.ok(blocked.visible, "the source block is the visible fallback");
    assert.match(blocked.error, /could not load/i, "the fallback explains the renderer is unavailable");
    assert.ok(blocked.headings >= 5, "the article survives a missing renderer");
  } finally {
    await session.send("Network.setBlockedURLs", { urls: [] });
  }
  // A fresh page load can retry the module now that the network is unblocked.
  await session.goto(`${PREVIEW}${writeupUrl(CTF, "hoe-ap.md")}`);
  await session.waitFor(run("return diagramSvgs().length > 0"), "diagram after the module loads again");
  return true;
};

const testViewerControls = async (session) => {
  await session.send("Browser.grantPermissions", {
    origin: PREVIEW,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  await session.goto(`${PREVIEW}${writeupUrl(CTF, "spec-warden.md")}`);
  await session.waitFor(run("return document.querySelectorAll('.diagram__bar').length > 0"), "viewer controls");

  // Source toggle keeps the canonical Mermaid source reachable.
  await session.evaluate(run("document.querySelector('.diagram__bar .diagram__btn').click(); return true;"));
  const shown = await session.evaluate(
    run(`
      const block = diagramBlocks()[0];
      const pre = block.closest("pre");
      const button = document.querySelector(".diagram__bar .diagram__btn");
      return { hidden: pre.hidden, expanded: button.getAttribute("aria-expanded"), text: button.textContent, visible: pre.getBoundingClientRect().height > 0 };
    `),
  );
  assert.equal(shown.hidden, false, "the source control reveals the original Mermaid source");
  assert.equal(shown.visible, true, "the revealed source has layout");
  assert.equal(shown.expanded, "true", "the source control exposes its expanded state");
  await session.evaluate(run("document.querySelector('.diagram__bar .diagram__btn').click(); return true;"));

  // Copy writes the original source, not the rendered SVG.
  await session.evaluate(run("document.querySelectorAll('.diagram__bar .diagram__btn')[1].click(); return true;"));
  await session.waitFor(run("return document.querySelector('.diagram__status').textContent.length > 0"), "copy feedback");
  const copiedStatus = await session.evaluate(run("return document.querySelector('.diagram__status').textContent"));
  const copiedClipboard = await session.evaluate("navigator.clipboard.readText()");
  const copiedSource = await session.evaluate(run("return diagramBlocks()[0].textContent"));
  assert.match(copiedStatus, /COPIED/i, "copy control reports success");
  const normalize = (value) => String(value).replace(/\r\n/g, "\n").trim();
  assert.equal(normalize(copiedClipboard), normalize(copiedSource), "copy writes the exact Mermaid source");

  // Expanded viewer: modal dialog, zoom, reset, keyboard close.
  await session.evaluate(run("document.querySelectorAll('.diagram__bar .diagram__btn')[2].click(); return true;"));
  await session.waitFor(run("return document.querySelector('dialog.diagram-dialog')?.open === true"), "expanded dialog");
  const expanded = await session.evaluate(
    run(`
      const dialog = document.querySelector("dialog.diagram-dialog");
      return {
        modal: dialog.matches(":modal"),
        labelled: !!dialog.getAttribute("aria-label"),
        buttons: [...dialog.querySelectorAll("button")].map((button) => button.getAttribute("aria-label")),
        zoom: dialog.querySelector("[data-diagram-zoom-reset]").textContent,
        focus: document.activeElement === dialog.querySelector("[data-diagram-close]"),
        svg: !!dialog.querySelector(".diagram-dialog__canvas svg"),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    `),
  );
  assert.equal(expanded.modal, true, "the expanded view is a native modal dialog");
  assert.ok(expanded.labelled, "the expanded view has an accessible name");
  assert.ok(expanded.buttons.every(Boolean), "every expanded-view control has an accessible label");
  assert.equal(expanded.zoom, "100%", "the expanded view starts at 100%");
  assert.equal(expanded.focus, true, "focus moves to the close control");
  assert.equal(expanded.svg, true, "the expanded view receives the rendered SVG");

  await session.evaluate(run("document.querySelector('[data-diagram-zoom-in]').click(); return true;"));
  const zoomed = await session.evaluate(
    run(`return document.querySelector("[data-diagram-zoom-reset]").textContent;`),
  );
  assert.equal(zoomed, "125%", "zoom in updates the viewer");
  await session.evaluate(run("document.querySelector('[data-diagram-zoom-reset]').click(); return true;"));
  const reset = await session.evaluate(
    run(`return document.querySelector("[data-diagram-zoom-reset]").textContent;`),
  );
  assert.equal(reset, "100%", "reset returns the diagram to its base size");

  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session.waitFor(run("return document.querySelector('dialog.diagram-dialog')?.open === false"), "Escape closes the dialog");
  return true;
};

const testErrorFallback = async (session) => {
  await session.goto(`${PREVIEW}${writeupUrl(CTF, "spec-warden.md")}`);
  await session.waitFor(run("return diagramSvgs().length > 0"), "baseline diagram");
  await session.evaluate(
    run(`
      const article = document.querySelector(".quest-article");
      const add = (source) => {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.dataset.language = "mermaid";
        code.textContent = source;
        pre.append(code);
        article.append(pre);
        return pre;
      };
      window.__badPre = add("flowchart TD\\n  A[broken -->");
      window.__emptyPre = add("   ");
      window.RadiantBlazeDiagrams.render(article);
      return true;
    `),
  );
  await session.waitFor(run("return document.querySelectorAll('.diagram-error').length >= 2"), "error fallbacks");
  const state = await session.evaluate(
    run(`
      const errors = [...document.querySelectorAll(".diagram-error")].map((node) => node.textContent);
      return {
        errors,
        existingSvgs: diagramSvgs().length,
        badVisible: !window.__badPre.hidden && window.__badPre.getBoundingClientRect().height > 0,
        emptyVisible: !window.__emptyPre.hidden,
        badState: window.__badPre.dataset.diagram,
        emptyState: window.__emptyPre.dataset.diagram,
        headings: document.querySelectorAll(".quest-article h2").length,
      };
    `),
  );
  assert.equal(state.existingSvgs, 1, "a broken diagram does not remove the valid diagram");
  assert.ok(state.badVisible, "invalid syntax keeps the source block visible");
  assert.ok(state.emptyVisible, "empty blocks keep the source block visible");
  assert.equal(state.badState, "error", "invalid syntax is marked as an error");
  assert.equal(state.emptyState, "error", "empty input is marked as an error");
  assert.ok(state.errors.some((text) => /empty/i.test(text)), "empty blocks get a clear message");
  assert.ok(state.errors.every((text) => !/Error:|\\bat .*\\.js:/i.test(text)), "fallback messages do not expose stack traces");
  assert.ok(state.headings >= 5, "the article still renders after diagram errors");
  return state.errors.length;
};

const testRepeatedInitialization = async (session) => {
  await session.goto(`${PREVIEW}${writeupUrl(CTF, "meeeps.md")}`);
  await session.waitFor(run("return diagramSvgs().length > 0"), "diagram before repeated initialization");
  const before = await session.evaluate(
    run(`return { svgs: diagramSvgs().length, figures: document.querySelectorAll(".diagram").length };`),
  );
  await session.evaluate(
    run(`
      window.RadiantBlazeDiagrams.render(document);
      window.RadiantBlazeDiagrams.render(document);
      return true;
    `),
  );
  await new Promise((resolve) => setTimeout(resolve, 700));
  const after = await session.evaluate(
    run(`
      return {
        svgs: diagramSvgs().length,
        figures: document.querySelectorAll(".diagram").length,
        hidden: [...diagramBlocks()].every((code) => code.closest("pre").hidden),
      };
    `),
  );
  assert.equal(after.svgs, before.svgs, "repeated initialization does not duplicate SVGs");
  assert.equal(after.figures, before.figures, "repeated initialization does not duplicate frames");
  assert.ok(after.hidden, "the source stays hidden after repeated initialization");
  return after.svgs;
};

const testSpaNavigation = async (session) => {
  // Blog listing -> CTF listing -> event -> writeup, all through the SPA router.
  await session.goto(`${PREVIEW}/pages/blog.html`);
  await session.waitFor(run("return document.querySelectorAll('.quest-nav a').length > 0"), "blog listing nav");
  await session.evaluate(run(`window.__spaSentinel = "alive"; return true;`));
  await session.evaluate(
    run(`
      const link = [...document.querySelectorAll(".quest-nav a")].find((item) => (item.getAttribute("href") || "").includes("ctf"));
      link.click();
      return true;
    `),
  );
  await session.waitFor(
    run(`return location.pathname.endsWith("/ctf.html") && document.querySelectorAll('a[href*="ctf.html?ctf="]').length > 0`),
    "CTF listing via SPA",
  );
  const blogToCtf = await session.evaluate(
    run(`return { sentinel: window.__spaSentinel, path: location.pathname, events: document.querySelectorAll('a[href*="ctf.html?ctf="]').length };`),
  );
  assert.equal(blogToCtf.sentinel, "alive", "SPA navigation from the blog listing to the CTF listing did not reload the document");
  assert.equal(blogToCtf.path, "/pages/ctf.html", "SPA navigation reached the CTF listing route");
  assert.ok(blogToCtf.events > 0, "the CTF listing rendered its events after SPA navigation");

  await session.evaluate(
    run(`
      const link = [...document.querySelectorAll('a[href*="ctf.html?ctf="]')].find((item) => item.getAttribute("href").includes(${JSON.stringify(CTF)}));
      link.click();
      return true;
    `),
  );
  await session.waitFor('document.querySelectorAll(\'a[href*="writeups"]\').length > 0', "event challenge cards via SPA");
  await session.evaluate(
    run(`
      const link = [...document.querySelectorAll('a[href*="writeups"]')].find((item) => item.href.includes("meeeps"));
      link.click();
      return true;
    `),
  );
  await session.waitFor(run('return diagramSvgs().length > 0'), "diagram after SPA navigation into a generated writeup");
  const generated = await session.evaluate(
    run(`return { sentinel: window.__spaSentinel, blocks: diagramBlocks().length, svgs: diagramSvgs().length, figures: document.querySelectorAll(".diagram").length };`),
  );
  assert.equal(generated.sentinel, "alive", "SPA navigation into a writeup did not reload the document");
  assert.equal(generated.svgs, generated.blocks, "each diagram rendered once after SPA navigation");
  assert.equal(generated.figures, generated.blocks, "SPA navigation did not duplicate diagram frames");

  // Legacy query URL compatibility: the old viewer shell must redirect to the
  // generated Astro writeup, which then renders the diagram itself.
  const legacyRoute = `/pages/writeup.html?ctf=${encodeURIComponent(CTF)}&challenge=meeeps.md`;
  await session.goto(`${PREVIEW}${legacyRoute}`);
  await session.waitFor(
    run(`return location.pathname.includes("/generated/writeups/") && diagramSvgs().length > 0`),
    "legacy writeup redirect",
  );
  const redirected = await session.evaluate(
    run(`return { path: location.pathname, blocks: diagramBlocks().length, svgs: diagramSvgs().length, hidden: [...diagramBlocks()].every((code) => code.closest("pre").hidden) };`),
  );
  assert.match(redirected.path, /\/generated\/writeups\//, "legacy writeup URL redirected to the generated route");
  assert.equal(redirected.svgs, redirected.blocks, "each diagram rendered once after the legacy redirect");
  assert.ok(redirected.hidden, "the source block is hidden after client-side rendering");
  return [generated.svgs, redirected.svgs];
};

const testThemeSwitch = async (session) => {
  await session.goto(`${PREVIEW}${writeupUrl(CTF, "spec-warden.md")}`);
  await session.waitFor(run('return diagramSvgs().length > 0'), "diagram before theme switch");
  const before = await session.evaluate(
    run(`
      const rect = document.querySelector(".quest-article .diagram__stage svg .node rect");
      return {
        theme: document.documentElement.classList.contains("light-theme") ? "light" : "dark",
        fill: getComputedStyle(rect).fill,
        svgs: diagramSvgs().length,
        svgMarkup: document.querySelector(".quest-article .diagram__stage svg").outerHTML.length,
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
     getComputedStyle(document.querySelector(".quest-article .diagram__stage svg .node rect")).fill !== ${JSON.stringify(before.fill)}`,
    "diagram re-rendered for the light theme",
  );
  const after = await session.evaluate(
    run(`
      const rect = document.querySelector(".quest-article .diagram__stage svg .node rect");
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
  // Return the site to its default theme, then fire two toggles quickly. The
  // debounced renderer must settle on the final theme without duplicating SVGs.
  await session.evaluate(run(`document.querySelector("[data-theme-toggle]").click(); return true;`));
  await session.waitFor('document.documentElement.classList.contains("dark-theme")', "dark theme restored");
  await session.evaluate(
    run(`
      const toggle = document.querySelector("[data-theme-toggle]");
      toggle.click();
      toggle.click();
      return true;
    `),
  );
  await session.waitFor('document.documentElement.classList.contains("dark-theme")', "rapid toggle settles on the dark theme");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const rapid = await session.evaluate(
    run(`
      return {
        theme: document.documentElement.classList.contains("light-theme") ? "light" : "dark",
        svgs: diagramSvgs().length,
        fill: getComputedStyle(document.querySelector(".quest-article .diagram__stage svg .node rect")).fill,
      };
    `),
  );
  assert.equal(rapid.theme, "dark", "rapid theme toggles end on the requested theme");
  assert.equal(rapid.svgs, before.svgs, "rapid theme toggles do not duplicate diagrams");
  return { before: before.theme, after: after.theme, rapid: rapid.theme };
};

const testMobileLayout = async (session) => {
  const results = [];
  for (const [width, height, mobile] of [
    [390, 844, true],
    [768, 1024, false],
    [1440, 900, false],
    [1920, 1080, false],
  ]) {
    await session.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await session.goto(`${PREVIEW}${writeupUrl(CTF, "hoe-ap.md")}`);
    await session.waitFor(run('return diagramSvgs().length > 0'), `diagram at ${width}x${height}`);
    const state = await session.evaluate(
      run(`
        const frame = document.querySelector(".quest-article .diagram");
        const stage = frame.querySelector(".diagram__stage");
        const svg = stage.querySelector("svg");
        const article = document.querySelector(".writeup-article");
        return {
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          stageOverflowX: getComputedStyle(stage).overflowX,
          frameWidth: frame.getBoundingClientRect().width,
          articleWidth: article.getBoundingClientRect().width,
          stageWidth: stage.clientWidth,
          stageScrollWidth: stage.scrollWidth,
          svgWidth: svg.getBoundingClientRect().width,
          svgHeight: svg.getBoundingClientRect().height,
          controls: frame.querySelectorAll(".diagram__bar button").length,
          controlsVisible: [...frame.querySelectorAll(".diagram__bar button")].every((button) => button.getBoundingClientRect().height > 0),
        };
      `),
    );
    assert.ok(state.pageOverflow <= 1, `${width}x${height}: the page does not overflow horizontally`);
    assert.equal(state.stageOverflowX, "auto", `${width}x${height}: wide diagrams scroll inside their frame`);
    assert.ok(state.frameWidth <= state.articleWidth + 1, `${width}x${height}: the diagram frame stays inside the article column`);
    assert.ok(state.svgWidth > 0 && state.svgHeight > 0, `${width}x${height}: the SVG scales to the frame`);
    assert.ok(state.svgWidth >= state.stageWidth - 1, `${width}x${height}: the SVG never shrinks below the scrollable stage`);
    assert.ok(state.stageScrollWidth >= state.svgWidth - 1, `${width}x${height}: wide diagrams scroll inside their frame`);
    assert.equal(state.controls, 3, `${width}x${height}: the compact control set stays available`);
    assert.ok(state.controlsVisible, `${width}x${height}: controls remain visible`);
    results.push({
      viewport: `${width}x${height}`,
      pageOverflow: state.pageOverflow,
      frameWidth: Math.round(state.frameWidth),
      svgWidth: Math.round(state.svgWidth),
    });
  }
  await session.send("Emulation.clearDeviceMetricsOverride");
  return results;
};

const waitForDownload = async (directory, existing, label) => {
  const deadline = Date.now() + 10000;
  for (;;) {
    const files = await readdir(directory).catch(() => []);
    const finished = files.filter((file) => file.endsWith(".svg") && !existing.has(file));
    if (finished.length > 0) {
      return path.join(directory, finished[0]);
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label} SVG download`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

const testSvgDownload = async (session, downloadDir) => {
  await session.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  await session.goto(`${PREVIEW}${writeupUrl(CTF, "spec-warden.md")}`);
  await session.waitFor(run("return document.querySelectorAll('.diagram__bar button').length === 3"), "downloader");

  const runDownload = async (theme, expectedFill) => {
    for (const file of await readdir(downloadDir)) {
      await rm(path.join(downloadDir, file), { force: true });
    }
    const existing = new Set();
    await session.evaluate(run("document.querySelectorAll('.diagram__bar .diagram__btn')[2].click(); return true;"));
    await session.waitFor(run("return document.querySelector('dialog.diagram-dialog')?.open === true"), `${theme} dialog`);
    await session.evaluate(
      run(`document.querySelector('[aria-label="Download the diagram as an SVG file"]').click(); return true;`),
    );
    const file = await waitForDownload(downloadDir, existing, theme);
    const text = await readFile(file, "utf8");
    assert.match(text, /^<\?xml version="1\.0" encoding="UTF-8"\?>/, `${theme}: export starts with an XML declaration`);
    assert.match(text, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${theme}: export carries the SVG namespace`);

    const parsed = await session.evaluate(`
      (() => {
        const doc = new DOMParser().parseFromString(${JSON.stringify(text)}, "image/svg+xml");
        const svg = doc.documentElement;
        return {
          error: Boolean(doc.querySelector("parsererror")),
          errorText: doc.querySelector("parsererror")?.textContent?.slice(0, 300) ?? "",
          tag: svg.nodeName,
          width: svg.getAttribute("width"),
          height: svg.getAttribute("height"),
          viewBox: svg.getAttribute("viewBox"),
          title: svg.querySelector("title")?.textContent ?? "",
          hasStyle: Boolean(svg.querySelector("style")),
          hasNode: Boolean(svg.querySelector(".node")),
          text: svg.textContent.slice(0, 4000),
        };
      })()
    `);
    assert.equal(parsed.error, false, `${theme}: downloaded SVG parses as XML (${parsed.errorText})`);
    assert.equal(parsed.tag.toLowerCase(), "svg", `${theme}: the root element is svg`);
    assert.ok(Number.parseFloat(parsed.width) > 0, `${theme}: width is retained`);
    assert.ok(Number.parseFloat(parsed.height) > 0, `${theme}: height is retained`);
    assert.ok(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/.test(parsed.viewBox), `${theme}: viewBox is retained`);
    assert.match(parsed.title, /Relay control attack chain/, `${theme}: accessibility title is exported`);
    assert.ok(parsed.hasStyle, `${theme}: styles are embedded in the export`);
    assert.ok(parsed.hasNode, `${theme}: diagram nodes are present in the export`);
    assert.ok(parsed.text.includes("Gateway") || parsed.text.includes("maintenance"), `${theme}: node labels are exported`);
    assert.ok(text.toLowerCase().includes(expectedFill), `${theme}: exported colors match the ${theme} theme (${expectedFill})`);

    await session.evaluate(run("document.querySelector('[data-diagram-close]').click(); return true;"));
    await session.waitFor(run("return document.querySelector('dialog.diagram-dialog')?.open === false"), `${theme} dialog close`);
    return { theme, bytes: Buffer.byteLength(text), width: parsed.width, height: parsed.height, viewBox: parsed.viewBox };
  };

  const dark = await runDownload("dark", "#272044");
  await session.evaluate(run(`document.querySelector("[data-theme-toggle]").click(); return true;`));
  await session.waitFor(
    'document.documentElement.classList.contains("light-theme") && getComputedStyle(document.querySelector(".diagram__stage svg .node rect")).fill === "rgb(255, 253, 243)"',
    "light theme re-render before download",
  );
  const light = await runDownload("light", "#fffdf3");
  await session.evaluate(run(`document.querySelector("[data-theme-toggle]").click(); return true;`));
  return [dark, light];
};

const testPerformance = async (session) => {
  await session.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const blog = await (async () => {
    await session.goto(`${PREVIEW}/generated/posts/linux/021-tiny-command-line-toolkit.html`);
    await session.waitFor("document.readyState === 'complete'", "blog load");
    await new Promise((resolve) => setTimeout(resolve, 400));
    return session.evaluate(
      run(`
        const urls = [...performance.getEntriesByType("resource")].map((entry) => entry.name);
        return {
          mermaidRequests: urls.filter((url) => /mermaid/i.test(url)).length,
          jsBytes: urls.filter((url) => url.includes("/_astro/")).reduce((sum, url) => {
            const entry = performance.getEntriesByName(url)[0];
            return sum + (entry?.decodedBodySize ?? 0);
          }, 0),
        };
      `),
    );
  })();
  assert.equal(blog.mermaidRequests, 0, "a blog post without diagrams never loads Mermaid");

  const ctfListing = await (async () => {
    await session.goto(`${PREVIEW}/pages/ctf.html?ctf=${encodeURIComponent(CTF)}`);
    await session.waitFor("document.readyState === 'complete'", "CTF listing load");
    await new Promise((resolve) => setTimeout(resolve, 300));
    return session.evaluate(
      run(`
        const urls = [...performance.getEntriesByType("resource")].map((entry) => entry.name);
        return { mermaidRequests: urls.filter((url) => /mermaid/i.test(url)).length };
      `),
    );
  })();
  assert.equal(ctfListing.mermaidRequests, 0, "a CTF listing without diagrams never loads Mermaid");

  await session.goto(`${PREVIEW}${writeupUrl(CTF, "spec-warden.md")}`);
  await session.waitFor(run("return diagramSvgs().length > 0"), "diagram for performance sample");
  const render = await session.evaluate(
    run(`
      return {
        renderMs: Number(document.querySelector(".diagram").dataset.renderMs),
        mermaidRequests: [...performance.getEntriesByType("resource")]
          .map((entry) => entry.name)
          .filter((url) => /mermaid/i.test(url)).length,
      };
    `),
  );
  assert.ok(render.renderMs > 0, "the first diagram records a render timestamp");
  assert.ok(render.mermaidRequests > 0, "diagram pages load the local Mermaid chunks");

  const repeated = await (async () => {
    const start = performance.now();
    await session.evaluate(run("window.RadiantBlazeDiagrams.render(document); window.RadiantBlazeDiagrams.render(document); return true;"));
    return Math.round(performance.now() - start);
  })();

  const themeStart = performance.now();
  await session.evaluate(run(`document.querySelector("[data-theme-toggle]").click(); return true;`));
  await session.waitFor(
    'document.documentElement.classList.contains("light-theme") && getComputedStyle(document.querySelector(".diagram__stage svg .node rect")).fill === "rgb(255, 253, 243)"',
    "light theme diagram re-render",
  );
  const themeMs = Math.round(performance.now() - themeStart);
  await session.evaluate(run(`document.querySelector("[data-theme-toggle]").click(); return true;`));
  await session.send("Emulation.clearDeviceMetricsOverride");

  return {
    blogWithoutMermaid: blog,
    ctfListingWithoutMermaid: ctfListing,
    firstDiagramRenderMs: render.renderMs,
    repeatedRenderMs: repeated,
    themeSwitchMs: themeMs,
  };
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
    await session.send("Network.enable");
    await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    const requests = [];
    session.on("Network.requestWillBeSent", (event) => requests.push(event.request.url));

    stage("A: rendering diagrams");
    const diagrams = await testSuccessfulRendering(session);
    stage("B: external CDNs blocked");
    const offlineDiagrams = await testOfflineRendering(session);
    stage("C: Mermaid module blocked");
    await testMissingModule(session);
    stage("D: viewer controls");
    await testViewerControls(session);
    stage("E: parse and empty-block errors");
    const fallbackErrors = await testErrorFallback(session);
    stage("F: repeated initialization");
    const repeated = await testRepeatedInitialization(session);
    stage("G: SPA navigation");
    const spa = await testSpaNavigation(session);
    stage("H: theme switching");
    const theme = await testThemeSwitch(session);
    stage("I: responsive layout");
    const mobile = await testMobileLayout(session);
    stage("J: SVG export");
    const downloadDir = path.join(userDataDir, "downloads");
    await mkdir(downloadDir, { recursive: true });
    const downloads = await testSvgDownload(session, downloadDir);
    stage("K: performance");
    const performanceSample = await testPerformance(session);

    const localMermaid = requests.filter((url) => /mermaid/i.test(url));
    assert.ok(localMermaid.length > 0, "Mermaid is fetched as a local build chunk");
    assert.ok(
      localMermaid.every((url) => url.startsWith(PREVIEW)),
      `no external Mermaid request: ${localMermaid.filter((url) => !url.startsWith(PREVIEW)).join(", ")}`,
    );
    assert.ok(
      !requests.some((url) => /cdn\.jsdelivr\.net/.test(url) && /mermaid/i.test(url)),
      "the runtime no longer imports Mermaid from jsDelivr",
    );

    console.log(
      JSON.stringify(
        {
          browser: binary,
          diagramsRendered: diagrams,
          offlineDiagrams,
          fallbackErrors,
          repeatedInitializationSvgs: repeated,
          spaNavigationDiagrams: spa,
          themeSwitch: theme,
          responsiveLayout: mobile,
          svgDownloads: downloads,
          performance: performanceSample,
          localMermaidRequests: localMermaid.length,
          externalMermaidRequests: 0,
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
