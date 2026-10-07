import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const compatRoot = path.join(root, "compat/legacy-assets/js");
const backupRoot = path.join(root, "backup/assets/js");
const compatibility = ["blog.js", "ctf.js", "content.js"];
for (const file of compatibility) {
  await access(path.join(compatRoot, file));
  await assert.rejects(access(path.join(backupRoot, file)));
}
await access(path.join(root, "assets/js/list-utils.js"));
const integration = await readFile(path.join(root, "astro-tools/source-assets.mjs"), "utf8");
assert.match(integration, /path\.join\(root, "compat", "legacy-assets", "js", filename\)/);
assert.match(integration, /legacyJsPrefix = "\/legacy\/assets\/js\/"/);
for (const file of [...compatibility, "list-utils.js"]) assert.match(integration, new RegExp(file.replace(".", "\\.")));
console.log("Compatibility asset mapping passed: source and public paths preserved.");
