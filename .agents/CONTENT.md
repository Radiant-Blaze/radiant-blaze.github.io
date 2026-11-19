# Content system

Posts live in `content/posts/`. CTF writeups live in `content/ctfs/<event>/`. Posts and writeups use YAML frontmatter; events use `ctf.json`. `content/posts/index.json` orders posts, `content/ctfs/index.json` orders events, and each event's `challenges` array orders writeups.

Run `npm run content:sync` to discover files and update those indexes, or `npm run content:check` to fail if synchronization would change them. Existing valid entries retain order; new files are appended in deterministic natural filename order. Metadata is preserved rather than regenerated from filenames.

Astro glob loaders in `src/content.config.ts` load Markdown and event JSON. `src/lib/article-data.ts` joins collections to the authored order files for routes, navigation, projections, and sitemap generation.

## Converter

`src/lib/markdown-converter/` is independent of site directories and schemas:

- `frontmatter.ts` uses `js-yaml` and preserves YAML types and nested metadata.
- `html.ts` provides HTML escaping and protects math tokens.
- `index.ts` converts headings, paragraphs, nested lists, blockquotes, tables, fenced code, inline code, links, images, and math into Astro-insertable HTML.

Math is protected before table detection. These must remain valid and preserve their pipes:

```text
$|x|$
$P(A \mid B)$
$\{x \mid x > 0\}$
```

Block math is emitted as its own block, never inside a paragraph. Markdown table parsing must never consume pipes belonging to inline or block math.

## CTF writeup authoring standard

CTF-specific presentation is scoped to `.writeup-article`; blog articles keep their existing layout and typography. No new container HTML is required.

### Recommended structure

The page header supplies the challenge title from frontmatter. New writeups should start directly at `## Challenge Overview`; an authored `# Title` still renders, but as a muted report lead. Use `##` for phases, `###` for individual tasks, and `####` only when a task genuinely has sub-parts.

| Section | Use when | Notes |
| --- | --- | --- |
| `## Challenge Overview` | Always | Category, difficulty, points/solves (frontmatter supplies most), one-paragraph brief, objective |
| `## Initial Analysis` / `## Reconnaissance` | There is triage to show | Files, service banners, observations, initial hypothesis |
| `## Attack Chain` | The path is easiest to see as a graph | Put the Mermaid diagram immediately after the heading and keep one explanatory sentence |
| `## Technical Investigation` | Always | The vulnerability/weakness and the evidence that proves it |
| `## Exploitation` / `## Recovery` | Always | Numbered steps, commands, scripts, intermediate results, why each step works |
| `## Result` / `## Flag` | Always | Exploitation outcome and extraction method; the flag value itself lives in frontmatter |
| `## Key Takeaways` / `## Lessons Learned` | Optional but encouraged | Root cause, concepts, mitigations |
| `## Appendix` | Optional | Full exploit or long reference material |

Category-specific variants are expected:

- **Crypto:** `The Capture` → `The Mistake` → `Recovery` → `Verification`.
- **Web/API:** `Overview` → `Recon` → `Contract/Input handling` → `Bypass` → `Exploit` → `Impact`.
- **Pwn/RE:** `Triage` → `Protections` → `Reversing` → `Primitive` → `Exploit` → `Lessons`.
- **Forensics:** `Evidence` → `Analysis` → `Reconstruction` → `Result`.

Do not add a heading just to satisfy the list. Empty or one-line sections add noise.

### Markdown conventions

- **Headings:** no manual numbering required; if used (`## 3. Inspecting ...`), keep it consistent within the writeup. Heading IDs and the ToC are generated automatically.
- **Paragraphs:** one idea per paragraph. Put exact offsets, sizes, addresses, and flags in backticks; put multi-column values in a Markdown table.
- **Notes and findings:** use ordinary blockquotes. Writeup blockquotes render as `NOTE` callouts with an orange edge.

  ```markdown
  > **Finding:** the validator fails open on non-finite floats.
  ```

- **Code fences:** keep normal fenced syntax. Optional metadata follows the language:

  ````markdown
  ```python title="solve.py" {11-14,19-22}
  bits = ''.join(...)
  ```
  ````

  - `title="…"` → filename in the header badge and in the copy control.
  - `{11-14,19-22}` → 1-based line highlight.
  - Both are optional and backward-compatible.

- **Shell commands:** use `bash`, `sh`, `shell`, or `zsh`. The block gets a cyan edge and a language badge.
- **Terminal/output data:** use `console`, `text`, `plaintext`, or `terminal`. These are not syntax-highlighted and get an orange edge. Use `text` for mixed raw output/data; do not invent a new fence type for every output shape.
- **Source files:** use the real language (`python`, `c`, `asm`, `yaml`, `json`, …) and add a `title` when the filename helps reproduction.
- **Do not put commands and their output in one fence.** Separate fences keep copy behavior and the shell/output distinction intact.

  ````markdown
  ```bash
  curl -sS "http://<ip>:<port>/openapi.yaml"
  ```

  ```text
  HTTP/1.1 200 OK
  content-type: application/yaml
  ```
  ````

- **Mermaid:** author the diagram after the heading that introduces it. Add accessibility text when the shape is not obvious:

  ````markdown
  ```mermaid
  flowchart TD
      accTitle: Relay control attack chain
      accDescr: Flow from the gateway contract to the maintenance console and flag.
      A --> B
  ```
  ````

  Figure labels (`FIG. n`), controls, source fallback, and theme sync are automatic.
- **Images:** use standard `![alt text](path)` Markdown. Alt text must describe the evidence, not the file name. Images preserve their aspect ratio and are never cropped. Figure captions are currently automatic numeric labels; authored captions are not supported.
- **Links:** standard Markdown links only; no raw HTML.
- **Flags:** store the flag only in frontmatter `flag:`. The writeup renders the existing `.writeup-flag` panel with a `COPY FLAG` control. Do not repeat the value in a code fence or a findings list.
- **Frontmatter:** category, points, difficulty, solves, tags, author, and description drive the header, metadata, difficulty meter, and projections.

### Presentation decisions intentionally retained

- **Shiki uses one `github-dark` palette** in both site themes. The dark code island maintains strong contrast (measured >14:1 for inline code) and a consistent terminal identity; a dual-theme pipeline is not needed while this remains readable.
- **Figures are numbered automatically** (`FIG. n`). Authored captions are not supported until real diagrams need them.
- **`text` fences stay generic** because they currently carry arithmetic, banners, hex, and command output. Adding more fence types would require migrating 200+ blocks without a demonstrated readability win.
- **No image lightbox** because there are zero evidence images. The CSS preserves image proportions and provides `figure`/`figcaption` styling for future use.
- **Desktop ToC is sticky** and its rail is slightly denser on writeups. The current section is scrolled into view automatically inside the rail, so long ToCs do not require a second manual scroll search. Mobile keeps the existing collapsed ToC above the article.
- **Line annotations** are supported through fence-level `{n-n}` highlighting; there is no inline per-line annotation syntax because no writeup currently needs it.

### Evidence image lightbox requirements (future)

There are currently no evidence images in CTF writeups. Do not add a lightbox until real screenshots need one. When that happens, it must support Escape, focus trapping/return, meaningful labels, mobile gestures, background scroll lock, SPA cleanup, and reduced-motion preferences.

## Content validation

Run before committing content:

```text
npm run content:sync       # only when adding/removing files or events
npm run content:check      # indexes match discovered files
npm run content:validate   # frontmatter, flags, Markdown, links, CTF references
npm run test:content-validation
```

CI runs `content:check` and `content:validate` before the build, and runs the validation fixtures with the unit tests.

**Blocking errors** set a non-zero exit code: missing/mistyped required fields, invalid dates, non-string flags, broken local links/assets/anchors, missing CTF metadata or challenge references, malformed indexes.

**Warnings** do not block: unexpected fields, heading-level jumps, duplicate heading slugs, empty code fences, empty Mermaid blocks, unusual fence metadata, duplicate/case-variant tags, non-kebab tags, unrecognized internal routes. Fix warnings when they are real; they are signals, not a rigid template.

### Frontmatter requirements

| Collection | Required | Types |
| --- | --- | --- |
| Posts | `title`, `date` | title string; date `YYYY-MM-DD`; tags array of strings; other schema fields optional |
| Writeups | none (title/description/category fall back) | `flag` must be a YAML **string** or null; points/difficulty/solves number or string; tags array |
| Events (`ctf.json`) | `title`, `date`, `challenges` | date `YYYY-MM-DD`; challenges array of Markdown filenames; url absolute http(s) |

- **Flags:** quote numeric-looking and boolean-looking values (`flag: "123456"`). An empty/null flag is allowed when none was captured. Validation never prints flag values. Never rewrite an existing flag.
- **Dates:** always `YYYY-MM-DD`. Dates are projected into the header and homepage tiles.
- **Tags:** lowercase kebab-case (`heap`, `json-schema`). Duplicate tags (case-insensitive) are flagged. Do not add a catch-all `ctf` tag unless the archive genuinely needs it; current categories already provide context.
- **Categories:** use a consistent spelling (`Crypto`, `Pwn`, `Web`, `Programming`, `Forensics`, `Reverse`). The validator warns about case variants; it does not enforce a fixed taxonomy.
- **CTF relationships:** an event directory contains `ctf.json`; every Markdown file in it must be listed in `challenges`, and every listed file must exist. The event must be listed in `content/ctfs/index.json`. The validator treats unlisted writeups and missing challenge files as errors because they become unreachable.
- **Internal links:** prefer absolute site paths (`/pages/ctf.html`, `/generated/...`, `/images/...`). The validator checks generated routes, raw `/content/` files, local assets, and anchors. External links are syntax-checked only; CI never depends on third-party availability.
- **Images:** use `/images/...` or `/assets/...` absolute paths. Relative images resolve against the generated page URL, not the source file. Always provide meaningful alt text.
