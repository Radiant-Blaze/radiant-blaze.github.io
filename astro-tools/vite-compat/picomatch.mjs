import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const picomatch = require("picomatch");

export default picomatch;
export const { isMatch, matchBase, scan, parse, makeRe } = picomatch;
