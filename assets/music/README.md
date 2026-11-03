# Adding music

Put supported audio files (`mp3`, `ogg`, `wav`, `m4a`, `aac`, `flac`, `opus`,
or `webm`) in one of these folders:

- `Blogs and CTFs/` for the blog and CTF indexes
- `Portfolio and Main Page/` for the homepage and portfolio
- `Reading CTFs and Blogs/` for individual posts and writeups

The music manifest is discovered from the folders during development and each
production build. Add an entry to `metadata.json` keyed by the file's path
relative to this directory to provide a title and artist. `album`, `artwork`,
and `duration` (seconds) are optional. Without an entry, the title is derived
from the filename and the artist is shown as `Unknown Artist`.
