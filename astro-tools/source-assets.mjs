import { createReadStream } from "node:fs";
import { cp, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const copiedFiles = ["favicon.svg", "og-image.png", "robots.txt", ".nojekyll"];
const legacyFallbackFiles = ["blog.js", "ctf.js", "content.js"];
const isCompatibilityJson = (relativePath) =>
  relativePath === "posts/index.json" ||
  relativePath === "ctfs/index.json" ||
  /^ctfs\/[^/]+\/ctf\.json$/.test(relativePath);
const isCompatibilityMarkdown = (relativePath) =>
  /^posts\/.+\.md$/.test(relativePath) || /^ctfs\/[^/]+\/.+\.md$/.test(relativePath);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

const resolveSource = (pathname) => {
  if (
    pathname === "/content/runtime-read-model.json" ||
    (pathname.startsWith("/content/") && isCompatibilityJson(pathname.slice("/content/".length)))
  ) return null;
  const legacyJsPrefix = "/legacy/assets/js/";
  if (pathname.startsWith(legacyJsPrefix)) {
    const filename = pathname.slice(legacyJsPrefix.length);
    if (legacyFallbackFiles.includes(filename)) return path.join(root, "compat", "legacy-assets", "js", filename);
    if (filename === "list-utils.js") return path.join(root, "assets", "js", filename);
    return null;
  }
  for (const prefix of ["/assets/", "/content/"]) {
    if (!pathname.startsWith(prefix)) continue;
    const base = path.join(root, prefix.slice(1, -1));
    const target = path.resolve(base, pathname.slice(prefix.length));
    if (!target.startsWith(`${base}${path.sep}`)) return null;
    return target;
  }

  if (copiedFiles.includes(pathname.slice(1))) return path.join(root, pathname.slice(1));
  return null;
};

function devSourceFiles() {
  return {
    name: "radiant-blaze-source-files",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url) return next();

        let requestUrl;
        try {
          requestUrl = new URL(request.url, "http://localhost");
        } catch {
          return next();
        }

        let decodedPath;
        try {
          decodedPath = decodeURIComponent(requestUrl.pathname);
        } catch {
          return next();
        }
        const target = resolveSource(decodedPath);
        if (!target) return next();

        response.setHeader(
          "Content-Type",
          mimeTypes[path.extname(target).toLowerCase()] || "application/octet-stream",
        );
        const stream = createReadStream(target);
        stream.on("error", next);
        stream.pipe(response);
      });
    },
  };
}

export function sourceAssetsIntegration() {
  return {
    name: "radiant-blaze-source-assets",
    hooks: {
      "astro:config:setup"({ updateConfig }) {
        updateConfig({ vite: { plugins: [devSourceFiles()] } });
      },
      async "astro:build:done"({ dir }) {
        const output = fileURLToPath(dir);
        await cp(path.join(root, "assets"), path.join(output, "assets"), { recursive: true });
        const legacyJsOutput = path.join(output, "legacy", "assets", "js");
        await mkdir(legacyJsOutput, { recursive: true });
        await Promise.all([
          ...legacyFallbackFiles.map((file) =>
            copyFile(path.join(root, "compat", "legacy-assets", "js", file), path.join(legacyJsOutput, file)),
          ),
          copyFile(path.join(root, "assets", "js", "list-utils.js"), path.join(legacyJsOutput, "list-utils.js")),
        ]);
        const contentRoot = path.join(root, "content");
        await cp(contentRoot, path.join(output, "content"), {
          recursive: true,
          filter: (source) => {
            const relativePath = path.relative(contentRoot, source).split(path.sep).join("/");
            return !isCompatibilityJson(relativePath) && !isCompatibilityMarkdown(relativePath);
          },
        });
        await Promise.all(
          copiedFiles.map((file) => copyFile(path.join(root, file), path.join(output, file))),
        );
      },
    },
  };
}
