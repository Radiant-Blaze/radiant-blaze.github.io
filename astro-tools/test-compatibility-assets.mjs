import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const compatRoot = path.join(root, "compat/legacy-assets/js");
const compatibility = ["blog.js", "ctf.js", "content.js"];
for (const file of compatibility) {
  await access(path.join(compatRoot, file));
}

// These two modules are shared with the frozen `/legacy/assets/js/` fallback,
// so their bytes are part of a public contract: any edit silently changes the
// behavior of the compatibility copies as well. Keep their hashes pinned.
const protectedHashes = new Map([
  ["list-utils.js", "ae995eb5c8cc9e71a483d5dc7d60cd470909a9bcae7b135d327e80528e9e2242"],
  ["markdown-renderer.js", "8ebdd3a1c40344c35c02d3f42b75dfbb286266b20e1fca4c8074319c886f0f47"],
]);

async function sha256(file) {
  const contents = await readFile(file);
  return createHash("sha256").update(contents).digest("hex");
}

async function assertProtectedFile(file, expectedHash) {
  const publicPath = path.join(root, "public/assets/js", file);
  await access(publicPath);
  assert.equal(await sha256(publicPath), expectedHash, `${file} must remain byte-identical`);

  // The build copies these files into `dist/legacy/assets/js/`; when a build is
  // present, verify the deployed copy carries the same bytes.
  const legacyPath = path.join(root, "dist/legacy/assets/js", file);
  try {
    await access(legacyPath);
  } catch {
    return;
  }
  assert.equal(await sha256(legacyPath), expectedHash, `dist legacy copy of ${file} must remain byte-identical`);
}

for (const [file, expectedHash] of protectedHashes) {
  await assertProtectedFile(file, expectedHash);
}

const integration = await readFile(path.join(root, "astro-tools/source-assets.mjs"), "utf8");
assert.match(integration, /path\.join\(root, "compat", "legacy-assets", "js", filename\)/);
assert.match(integration, /path\.join\(publicRoot, "assets", "js", file\)/);
assert.match(integration, /legacyJsPrefix = "\/legacy\/assets\/js\/"/);
for (const file of [...compatibility, "list-utils.js", "markdown-renderer.js"]) assert.match(integration, new RegExp(file.replace(".", "\\.")));
console.log("Compatibility asset mapping passed: source and public paths preserved; protected files byte-identical.");
