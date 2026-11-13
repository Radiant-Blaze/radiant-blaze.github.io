import { createReadStream } from "node:fs";
import { cp, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const musicRoot = path.join(root, "assets", "music");
const audioExtensions = new Set([".mp3", ".ogg", ".wav", ".m4a", ".aac", ".flac", ".opus", ".webm"]);
const musicMetadataPath = path.join(musicRoot, "metadata.json");
const musicManifestPath = "/assets/music/manifest.json";
const copiedFiles = ["favicon.svg", "og-image.png", "robots.txt", ".nojekyll"];
const legacyFallbackFiles = ["blog.js", "ctf.js", "content.js"];
// Modules that live in assets/js/ but are also served from /legacy/assets/js/
// because the compatibility fallback imports them as same-directory siblings.
const sharedLegacyFiles = ["list-utils.js", "markdown-renderer.js"];
const isCompatibilityJson = (relativePath) =>
  relativePath === "posts/index.json" ||
  relativePath === "ctfs/index.json" ||
  /^ctfs\/[^/]+\/ctf\.json$/.test(relativePath);
const isCompatibilityMarkdown = (relativePath) =>
  /^posts\/.+\.md$/.test(relativePath) || /^ctfs\/[^/]+\/.+\.md$/.test(relativePath);
const mimeTypes = {
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg; codecs=opus",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

async function createMusicManifest() {
  let metadata = {};
  try {
    metadata = JSON.parse(await readFile(musicMetadataPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Could not read music metadata: ${error.message}`, { cause: error });
  }
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    throw new TypeError("Music metadata must be a JSON object keyed by music-file path.");
  }

  const tracks = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !audioExtensions.has(path.extname(entry.name).toLowerCase())) continue;

      const relativePath = path.relative(musicRoot, absolutePath).split(path.sep).join("/");
      const details = metadata[relativePath] || {};
      if (!details || typeof details !== "object" || Array.isArray(details)) {
        throw new TypeError(`Music metadata for "${relativePath}" must be an object.`);
      }
      const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
      tracks.push({
        id: relativePath,
        path: relativePath,
        src: `/assets/music/${encodedPath}`,
        title: typeof details.title === "string" && details.title.trim()
          ? details.title.trim()
          : path.basename(entry.name, path.extname(entry.name)).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim(),
        artist: typeof details.artist === "string" && details.artist.trim()
          ? details.artist.trim()
          : "Unknown Artist",
        album: typeof details.album === "string" ? details.album : "",
        artwork: typeof details.artwork === "string" ? details.artwork : "",
        duration: Number.isFinite(details.duration) && details.duration > 0 ? details.duration : null,
        collection: relativePath.split("/")[0],
      });
    }
  }
  await visit(musicRoot);
  tracks.sort((left, right) => left.path.localeCompare(right.path));
  return { tracks };
}

const resolveSource = (pathname) => {
  if (
    pathname === "/content/runtime-read-model.json" ||
    (pathname.startsWith("/content/") && isCompatibilityJson(pathname.slice("/content/".length)))
  ) return null;
  const legacyJsPrefix = "/legacy/assets/js/";
  if (pathname.startsWith(legacyJsPrefix)) {
    const filename = pathname.slice(legacyJsPrefix.length);
    if (legacyFallbackFiles.includes(filename)) return path.join(root, "compat", "legacy-assets", "js", filename);
    if (sharedLegacyFiles.includes(filename)) return path.join(root, "assets", "js", filename);
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
        if (decodedPath === musicManifestPath) {
          createMusicManifest().then((manifest) => {
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify(manifest));
          }).catch((error) => {
            console.error("[radiant-blaze:music] Could not build music manifest.", error);
            response.statusCode = 500;
            response.end("Music manifest unavailable.");
          });
          return;
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
        await writeFile(
          path.join(output, "assets", "music", "manifest.json"),
          JSON.stringify(await createMusicManifest()),
        );
        const portfolioDirectory = path.join(output, "portfolio");
        await mkdir(portfolioDirectory, { recursive: true });
        await copyFile(path.join(output, "portfolio.html"), path.join(portfolioDirectory, "index.html"));
        const legacyJsOutput = path.join(output, "legacy", "assets", "js");
        await mkdir(legacyJsOutput, { recursive: true });
        await Promise.all([
          ...legacyFallbackFiles.map((file) =>
            copyFile(path.join(root, "compat", "legacy-assets", "js", file), path.join(legacyJsOutput, file)),
          ),
          ...sharedLegacyFiles.map((file) =>
            copyFile(path.join(root, "assets", "js", file), path.join(legacyJsOutput, file)),
          ),
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
