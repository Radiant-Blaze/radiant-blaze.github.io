/* Radiant Blaze Mermaid viewer.
 *
 * Mermaid is bundled locally through the Astro/Vite build and imported
 * dynamically, so pages without diagrams never download it. The original
 * Mermaid source stays in the DOM as the canonical fallback; a rendered SVG is
 * inserted only after Mermaid reports success.
 *
 * The module is loaded again by the SPA router with a cache-busting query. All
 * state and listeners therefore live on the window singleton below, which is
 * created once per document.
 */

const VIEWER_KEY = "__radiantBlazeDiagramViewer";
const BLOCK_SELECTOR = 'pre > code[data-language="mermaid"]';
const MERMAID_FONT_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const DIAGRAM_TOKENS = {
  "--panel": { key: "panel", fallback: "#272044" },
  "--text": { key: "text", fallback: "#fff7de" },
  "--muted": { key: "muted", fallback: "#baaed6" },
  "--accent-pink": { key: "pink", fallback: "#ff5e9d" },
  "--accent-orange": { key: "orange", fallback: "#ffb347" },
  "--accent-cyan": { key: "cyan", fallback: "#65e7e3" },
};
const DIAGRAM_FALLBACK_KEYS = Object.fromEntries(
  Object.values(DIAGRAM_TOKENS).map(({ key, fallback }) => [fallback.toLowerCase(), key]),
);
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const readTheme = () => {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  const tokens = {};
  for (const [name, { key, fallback }] of Object.entries(DIAGRAM_TOKENS)) {
    tokens[key] = read(name, fallback);
  }
  tokens.font = read("--font-code", MERMAID_FONT_FALLBACK);
  tokens.light = document.documentElement.classList.contains("light-theme");
  return tokens;
};

const applyThemeTokens = (source, tokens) =>
  source.replace(/^[ \t]*classDef\b.*$/gm, (definition) =>
    definition.replace(/#[\da-f]{6}\b/gi, (fallback) => {
      const key = DIAGRAM_FALLBACK_KEYS[fallback.toLowerCase()];
      return key ? tokens[key] : fallback;
    }),
  );

/* Typography: the diagram labels use the site's code stack. November was
 * evaluated as the terminal face, but its condensed glyphs hurt readability at
 * small sizes, so diagrams keep the normal-width mono stack while the rest of
 * the interface uses the pixel faces. */
const mermaidConfig = (tokens) => ({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  fontFamily: tokens.font,
  flowchart: { useMaxWidth: false, wrappingWidth: 320 },
  themeVariables: {
    darkMode: !tokens.light,
    background: tokens.panel,
    mainBkg: tokens.panel,
    nodeBorder: tokens.cyan,
    nodeTextColor: tokens.text,
    lineColor: tokens.muted,
    textColor: tokens.text,
    titleColor: tokens.text,
    primaryColor: tokens.panel,
    primaryTextColor: tokens.text,
    primaryBorderColor: tokens.cyan,
    secondaryColor: tokens.panel,
    secondaryTextColor: tokens.text,
    secondaryBorderColor: tokens.pink,
    tertiaryColor: tokens.panel,
    tertiaryTextColor: tokens.text,
    tertiaryBorderColor: tokens.orange,
    clusterBkg: tokens.panel,
    clusterBorder: tokens.muted,
    edgeLabelBackground: tokens.panel,
    errorBkgColor: tokens.panel,
    errorTextColor: tokens.text,
    fontSize: "13px",
  },
});

let mermaidPromise = null;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const waitForFonts = async () => {
  if (!document.fonts) return;
  // `document.fonts.ready` can resolve before the first layout requests the
  // page fonts, so force a layout and then wait for the loading batch.
  try {
    await nextFrame();
    await document.fonts.ready;
    const deadline = performance.now() + 2000;
    while (document.fonts.status === "loading" && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch {
    // Missing fonts must not block the diagram renderer.
  }
};

const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid")
      .then((module) => {
        const api = module.default ?? module;
        api.initialize(mermaidConfig(readTheme()));
        return api;
      })
      .catch((error) => {
        mermaidPromise = null;
        throw error;
      });
  }
  return mermaidPromise;
};

const svgAccessibility = (svg) => {
  const title = svg.querySelector("title")?.textContent?.trim() || "";
  const description = svg.querySelector("desc")?.textContent?.trim() || "";
  return { title, description };
};

const downloadSvg = (svg, name) => {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // outerHTML uses HTML serialization for the XHTML labels inside
  // <foreignObject>, which leaves void tags like <br> unclosed and produces
  // invalid XML. XMLSerializer emits well-formed markup for the download.
  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.svg`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand?.("copy") ?? false;
    area.remove();
    return ok;
  }
};

class DiagramViewer {
  constructor() {
    this.figures = new WeakMap();
    this.renders = new WeakMap();
    this.sequence = 0;
    this.figureCount = 0;
    this.generation = 0;
    this.timer = 0;
    addEventListener("radiantblaze:contentchange", () => this.schedule(document, false));
    addEventListener("radiantblaze:themechange", () => this.schedule(document, true));
  }

  /** Public hook used by tests and the SPA router. */
  render(root = document) {
    this.schedule(root, false);
  }

  schedule(root, themeChange) {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.run(root, generation, themeChange);
    }, themeChange ? 60 : 0);
  }

  async run(root, generation, themeChange) {
    const blocks = [...(root ?? document).querySelectorAll(BLOCK_SELECTOR)];
    if (!blocks.length) return;
    await waitForFonts();
    if (generation !== this.generation) return;

    let api;
    try {
      api = await loadMermaid();
    } catch (error) {
      this.failBlocks(blocks, "The diagram renderer could not load. The Mermaid source is shown below.", error);
      return;
    }
    if (generation !== this.generation) return;
    if (themeChange) api.initialize(mermaidConfig(readTheme()));

    for (const code of blocks) {
      if (generation !== this.generation) return;
      const pre = code.closest("pre");
      if (!pre || !code.isConnected) continue;
      if (themeChange) {
        if (pre.dataset.diagram !== "rendered") continue;
      } else if (pre.dataset.diagram) {
        continue;
      }
      await this.renderBlock(api, code, pre, generation, themeChange);
    }
  }

  async renderBlock(api, code, pre, generation, isThemeRerender) {
    const source = code.textContent ?? "";
    if (!source.trim()) {
      this.showError(pre, "This Mermaid block is empty.");
      return;
    }
    if (pre.dataset.diagram === "rendering") return;
    const existingFigure = this.figures.get(pre);
    if (isThemeRerender && !existingFigure) return;

    const previousState = pre.dataset.diagram === "rendered" ? "rendered" : "";
    pre.dataset.diagram = "rendering";
    const stale = () => {
      if (!pre.isConnected) return true;
      if (generation === this.generation) return false;
      if (previousState) pre.dataset.diagram = previousState;
      else delete pre.dataset.diagram;
      return true;
    };
    const id = `rb-mermaid-${++this.sequence}`;
    try {
      const { svg, bindFunctions } = await api.render(id, applyThemeTokens(source, readTheme()));
      if (stale()) return;
      const figure = existingFigure ?? this.createFigure(pre, source);
      this.paintFigure(figure, svg, bindFunctions, source);
      pre.hidden = true;
      pre.dataset.diagram = "rendered";
    } catch (error) {
      if (stale()) return;
      if (isThemeRerender && existingFigure) {
        // Keep the last good SVG rather than blanking the diagram; the source
        // remains available through the viewer controls.
        console.warn("[radiant-blaze] Diagram could not be re-rendered for the new theme.", error);
        pre.dataset.diagram = "rendered";
        return;
      }
      this.showError(pre, "Diagram could not be rendered. The Mermaid source is shown below.", error);
    }
  }

  failBlocks(blocks, message, error) {
    if (error) console.error("[radiant-blaze] Mermaid module could not be loaded.", error);
    for (const code of blocks) {
      const pre = code.closest("pre");
      if (pre) this.showError(pre, message);
    }
  }

  showError(pre, message, error) {
    if (error) console.error(`[radiant-blaze] ${message}`, error);
    pre.dataset.diagram = "error";
    pre.hidden = false;
    const figure = this.figures.get(pre);
    if (figure) figure.remove();
    this.figures.delete(pre);
    if (pre.previousElementSibling?.classList.contains("diagram-error")) {
      pre.previousElementSibling.textContent = message;
      return;
    }
    const note = document.createElement("p");
    note.className = "diagram-error";
    note.setAttribute("role", "status");
    note.textContent = message;
    pre.before(note);
  }

  createFigure(pre, source) {
    const index = ++this.figureCount;
    const figure = document.createElement("figure");
    figure.className = "diagram";
    figure.dataset.diagramFigure = String(index);
    figure.__source = source;

    const bar = document.createElement("div");
    bar.className = "diagram__bar";

    const label = document.createElement("span");
    label.className = "diagram__label";
    label.textContent = "DIAGRAM";
    bar.append(label);

    const actions = document.createElement("div");
    actions.className = "diagram__actions";

    const sourceId = `rb-mermaid-source-${index}`;
    pre.id = pre.id || sourceId;

    const sourceButton = this.button("SOURCE", "Show the original Mermaid source", "diagram__btn");
    sourceButton.setAttribute("aria-controls", pre.id);
    sourceButton.setAttribute("aria-expanded", "false");
    sourceButton.addEventListener("click", () => {
      const show = pre.hidden;
      pre.hidden = !show;
      sourceButton.setAttribute("aria-expanded", String(show));
      sourceButton.textContent = show ? "HIDE" : "SOURCE";
      sourceButton.setAttribute("aria-label", show ? "Hide the original Mermaid source" : "Show the original Mermaid source");
    });

    const copyButton = this.button("COPY", "Copy the original Mermaid source", "diagram__btn");
    copyButton.addEventListener("click", async () => {
      const copied = await copyText(figure.__source ?? "");
      this.status(figure, copied ? "SOURCE COPIED" : "COPY FAILED");
    });

    const expandButton = this.button("EXPAND", "Open the diagram in an expanded view", "diagram__btn");
    expandButton.addEventListener("click", () => this.openDialog(figure));

    actions.append(sourceButton, copyButton, expandButton);
    bar.append(actions);

    const stage = document.createElement("div");
    stage.className = "diagram__stage";
    stage.setAttribute("role", "img");
    stage.setAttribute("aria-label", "Mermaid diagram");

    const status = document.createElement("p");
    status.className = "diagram__status";
    status.setAttribute("aria-live", "polite");

    figure.append(bar, stage, status);
    this.figures.set(pre, figure);
    pre.after(figure);
    return figure;
  }

  button(text, label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.setAttribute("aria-label", label);
    return button;
  }

  status(figure, message) {
    const status = figure.querySelector(".diagram__status");
    if (!status) return;
    status.textContent = message;
    clearTimeout(status.__clear);
    status.__clear = setTimeout(() => {
      status.textContent = "";
    }, 1800);
  }

  paintFigure(figure, svgMarkup, bindFunctions, source) {
    figure.__source = source;
    const stage = figure.querySelector(".diagram__stage");
    stage.innerHTML = svgMarkup;
    const svg = stage.querySelector("svg");
    if (!svg) return;
    bindFunctions?.(stage);
    const { title, description } = svgAccessibility(svg);
    const intrinsic = Number.parseFloat(svg.getAttribute("width")) || svg.viewBox?.baseVal?.width || 0;
    if (intrinsic > 0) {
      // 92% keeps desktop frames from sprouting a scrollbar over a few pixels
      // while still preventing unreadable downscaling on phones.
      svg.style.setProperty("--diagram-min-width", `${Math.round(intrinsic * 0.92)}px`);
    }
    const index = figure.dataset.diagramFigure;
    stage.setAttribute("aria-label", title || `Diagram ${index}`);
    if (description) stage.setAttribute("aria-description", description);
    else stage.removeAttribute("aria-description");
    figure.dataset.fontsReady = document.fonts?.status === "loading" ? "settled" : "loaded";
    figure.dataset.renderMs = String(Math.round(performance.now()));
    figure.dataset.rendered = "true";
    const dialog = figure.querySelector(".diagram-dialog");
    if (dialog) this.fillDialogCanvas(dialog, svg, figure);
  }

  openDialog(figure) {
    let dialog = figure.querySelector(".diagram-dialog");
    if (!dialog) dialog = this.createDialog(figure);
    this.fillDialogCanvas(dialog, figure.querySelector(".diagram__stage svg"), figure);
    dialog.__zoom = 1;
    this.applyZoom(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector("[data-diagram-close]")?.focus();
  }

  createDialog(figure) {
    const dialog = document.createElement("dialog");
    dialog.className = "diagram-dialog";
    dialog.setAttribute("aria-label", "Expanded Mermaid diagram");

    const bar = document.createElement("div");
    bar.className = "diagram-dialog__bar";
    const title = document.createElement("span");
    title.className = "diagram-dialog__title";
    title.textContent = "DIAGRAM";
    bar.append(title);

    const actions = document.createElement("div");
    actions.className = "diagram-dialog__actions";

    const zoomOut = this.button("−", "Zoom out", "diagram__btn");
    zoomOut.dataset.diagramZoomOut = "";
    zoomOut.addEventListener("click", () => {
      dialog.__zoom = Math.max(ZOOM_MIN, (dialog.__zoom ?? 1) - ZOOM_STEP);
      this.applyZoom(dialog);
    });

    const reset = this.button("100%", "Reset diagram zoom", "diagram__btn diagram__btn--zoom");
    reset.dataset.diagramZoomReset = "";
    reset.addEventListener("click", () => {
      dialog.__zoom = 1;
      this.applyZoom(dialog);
    });

    const zoomIn = this.button("+", "Zoom in", "diagram__btn");
    zoomIn.dataset.diagramZoomIn = "";
    zoomIn.addEventListener("click", () => {
      dialog.__zoom = Math.min(ZOOM_MAX, (dialog.__zoom ?? 1) + ZOOM_STEP);
      this.applyZoom(dialog);
    });

    const download = this.button("SVG", "Download the diagram as an SVG file", "diagram__btn");
    download.addEventListener("click", () => {
      const svg = dialog.querySelector(".diagram-dialog__canvas svg");
      if (svg) downloadSvg(svg, `radiant-blaze-diagram-${figure.dataset.diagramFigure ?? "1"}`);
    });

    const close = this.button("CLOSE", "Close the expanded diagram", "diagram__btn");
    close.dataset.diagramClose = "";
    close.addEventListener("click", () => dialog.close?.());

    actions.append(zoomOut, reset, zoomIn, download, close);
    bar.append(actions);

    const viewport = document.createElement("div");
    viewport.className = "diagram-dialog__viewport";
    const canvas = document.createElement("div");
    canvas.className = "diagram-dialog__canvas";
    viewport.append(canvas);

    dialog.append(bar, viewport);
    dialog.addEventListener("close", () => {
      dialog.__zoom = 1;
      this.applyZoom(dialog);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close?.();
    });
    figure.append(dialog);
    return dialog;
  }

  fillDialogCanvas(dialog, svg, figure) {
    if (!svg) return;
    const canvas = dialog.querySelector(".diagram-dialog__canvas");
    const clone = svg.cloneNode(true);
    const suffix = dialog.closest(".diagram")?.dataset.diagramFigure ?? "x";
    const oldRootId = clone.id;
    if (oldRootId) {
      const newRootId = `${oldRootId}-dialog-${suffix}`;
      // Mermaid scopes its internal stylesheet to the SVG root id. Renaming ids
      // without rewriting the selectors strips the label styles and clips text.
      for (const style of clone.querySelectorAll("style")) {
        style.textContent = style.textContent.split(`#${oldRootId}`).join(`#${newRootId}`);
      }
    }
    const idMap = new Map();
    for (const node of [clone, ...clone.querySelectorAll("[id]")]) {
      if (!node.id) continue;
      const next = `${node.id}-dialog-${suffix}`;
      idMap.set(node.id, next);
      node.id = next;
    }
    for (const node of [clone, ...clone.querySelectorAll("[aria-labelledby], [aria-describedby]")]) {
      for (const attribute of ["aria-labelledby", "aria-describedby"]) {
        const value = node.getAttribute(attribute);
        if (!value) continue;
        node.setAttribute(attribute, value.split(/\s+/).map((token) => idMap.get(token) ?? token).join(" "));
      }
    }
    canvas.replaceChildren(clone);
    const { title } = svgAccessibility(svg);
    dialog.setAttribute("aria-label", title ? `Expanded diagram: ${title}` : "Expanded Mermaid diagram");
    dialog.querySelector(".diagram-dialog__title").textContent = title ? title.toUpperCase() : "DIAGRAM";
    if (figure) dialog.dataset.diagramFor = figure.dataset.diagramFigure ?? "";
  }

  applyZoom(dialog) {
    const zoom = dialog.__zoom ?? 1;
    const canvas = dialog.querySelector(".diagram-dialog__canvas");
    if (canvas) canvas.style.width = `${zoom * 100}%`;
    const reset = dialog.querySelector("[data-diagram-zoom-reset]");
    if (reset) reset.textContent = `${Math.round(zoom * 100)}%`;
    const out = dialog.querySelector("[data-diagram-zoom-out]");
    const inButton = dialog.querySelector("[data-diagram-zoom-in]");
    if (out) out.disabled = zoom <= ZOOM_MIN;
    if (inButton) inButton.disabled = zoom >= ZOOM_MAX;
  }
}

const viewer = (window[VIEWER_KEY] ??= new DiagramViewer());
window.RadiantBlazeDiagrams = viewer;
viewer.render(document);
