# automation/ — the Artisan publisher

Everything in this folder belongs to the automated post pipeline, and **all of it is
published to the site as static files** — Jekyll copies every path that does not start with
`_`, and `_config.yml` sets no `exclude:`. `README.md`, `topics.json` and `skills.md` are all
served from `https://scotch83.github.io/automation/…`. Treat every file in this folder as
public.

## What runs

| Workflow (n8n) | Trigger | What it does |
|---|---|---|
| `artisan-publisher · weekly-post` | Sunday 21:00 Europe/Rome | Takes the next topic from `topics.json`, generates a post, opens a pull request |
| `artisan-publisher · generate` | Called by the above, or manually | The engine: topic in, post + front matter + cover SVG out |
| `artisan-publisher · topic-planner` | Every 2 months | Tops `queue` back up to ~16 topics and opens a small PR |

Nothing publishes itself. Every run ends in a pull request that you review and merge.

## The weekly run, step by step

1. Read `automation/topics.json` and `automation/skills.md` from `main`.
2. Take the first topic in `queue`.
3. Write the post: ~500–1000 words in the house style, `<!--more-->` after the intro,
   `## Conclusion` + "Happy coding!" at the end, 3–4 tags from the closed vocabulary.
4. Draw the cover, in two calls. A second DeepSeek pass writes the brief and must name the
   technology and draw its real mark. **OpenAI `gpt-image-2.5-sunburst`** renders that brief
   at 1536×1024, quality high, `background: transparent` (measured: $0.0435 — 1,372 image
   output tokens plus 469 prompt tokens), and Recraft's `/v1/images/vectorize` traces it to
   SVG for $0.01. The PNG is kept as the LinkedIn twin; the traced SVG is what the site
   renders. The cover is transparent on purpose: it sits on the white page exactly like the
   nine existing covers, with the mark large and centred and the white title over its
   saturated body. The brief also requires the mark's real **faceting** — Angular's shield is
   two flat tones of the same hue, the right side about 18% darker, not one flat fill.
   This call is an HTTP Request rather than n8n's OpenAI node on purpose: the node's option
   collection only forwards schema-defined fields (so `background` is dropped), and it does
   not expose `usage`, which is how the cost above is measured.
5. Validate everything — front matter keys, tag vocabulary, word count, no unsafe SVG
   content, no `{{` outside `{% raw %}`, and a **contrast gate** that rejects a full-bleed
   pale cover, because the post title is white. A rejected cover is retried once with a
   hardened brief; any other failure aborts the run and alerts. The traced artwork is also
   wrapped in the same **soft drop shadow** the existing covers carry (a
   `feGaussianBlur`/`feOffset` filter, about 500 bytes) — the image model draws flat, and
   vectorising a blurred shadow would produce dozens of banded paths.
6. Create branch `artisan/<YYYY-MM-DD>-<HHMMSS>` from `main` and commit — the time suffix
   makes every attempt its own branch, so retrying a run that failed halfway cannot
   collide with the branch and file blobs the failed attempt left behind:
   - `_posts/<YYYY-MM-DD>-<slug>.md`
   - `assets/images/<slug>.svg`
   - `assets/images/<slug>.png`
   - `automation/topics.json` (topic moved from `queue` to `published`)
7. Open the pull request with the draft inline. There is no polling step: the PNG is
   generated before the commit, so nothing waits on another system.
8. Send a Telegram message with the PR link.

## Why the PNG exists at all

`feed.xml` publishes `<linkedin-img>` for every post, and that feed drives a LinkedIn
automation. So each cover ships in two formats:

- **`.svg`** — the traced cover. It is a full-bleed dark field by design: the post title is
  white and sits across the middle, so a pale or transparent cover would make it unreadable.
  It scales cleanly in the post list (a 192×192 box, 100×100 on mobile).
- **`.png`** — the 1536×1024 raster the image model drew, before tracing, alpha preserved like the existing covers. This is the file LinkedIn
  pulls through `feed.xml`.

WebP is never used: the LinkedIn automation re-fetches the image, and PNG is the only format
already proven end to end.

## Operating it

**Regenerate a post you did not like.** Run `artisan-publisher · generate` from the n8n UI
with a topic. It does not touch the branch or the PR — you get the markdown and the SVG to
inspect, and you can re-run without consuming the queue. Each run does spend one Recraft
generation and one vectorize (about $0.054) and two DeepSeek calls.

**Change what it writes about.** Edit `automation/skills.md`. It is embedded into the writing
and planning prompts verbatim, and it is the only place the model learns your voice, your
stack and the topics that are off limits.

**Add or reorder topics.** Edit `queue` in `automation/topics.json`. Order is the publish
order. `published` records what has already been used and is appended to automatically —
do not hand-edit it except to remove a mistake.

**Change the tags.** `vocabulary` is a closed list. Add a tag there before a post can use it;
the workflow rejects a post carrying a tag outside the list. `core` marks the tags the writer
prefers when the choice is free.

**Pause it.** Deactivate `artisan-publisher · weekly-post` in n8n. The topic planner is inert
until its two-month schedule fires, but the legacy rasteriser Action is **not** harmless on
its own: it runs on any push that touches a cover SVG, so pausing the publisher does not
make it dormant.

**The legacy rasteriser.** `.github/workflows/raster-svg.yml` still exists for the pre-Recraft
pipeline. The weekly run does not depend on it and never waits for it. If you invoke it
manually it only uploads PNGs as a workflow artifact — it never commits, so it cannot write
to `main`. Delete the workflow once you are happy with the Recraft path.

## Failure handling

All three workflows report through the shared n8n error workflow, which messages Telegram.
The posting rule is strict: **a failure never opens a pull request and never writes to
`main`, so nothing publishes.** It can, however, leave a branch behind: the run pushes
`artisan/<date>-<time>` and its commits before it opens the PR. That branch is inert, and
because every attempt gets its own timestamped name, re-running simply starts a new one.

The cover path has one recoverable failure: the contrast gate rejects a full-bleed pale
image because white type sits across the middle. That triggers a single retry with a
hardened brief; a second failure aborts with an alert rather than publishing an unreadable
cover.

There is no retry command from Telegram (the bot's single trigger belongs to another
workflow) — re-run `artisan-publisher · generate` from the n8n UI, or the weekly workflow.

## Security notes

- The artwork is machine-authored and lands in a public repository, so `Validate Cover` in
  n8n runs a guard **before anything is committed**. The rasteriser Action carries the same
  guard as a backstop for the legacy path. Both reject: `<script>`, `<foreignObject>`,
  `<iframe>`, `<object>`, `<embed>`, `<set>`, `<animate>` and the other animation elements —
  including namespace-prefixed spellings such as `x:script` — any `on*` event handler, an
  `<!ENTITY>` declaration, a `SYSTEM` doctype, a `javascript:` URL, an `@import`, a `url(...)`
  pointing off-origin or at a `data:` payload, and a remote or `data:` `href`/`src`. Attribute
  values are HTML-decoded and whitespace-stripped before matching, so entity-encoded and
  line-broken variants (`jav&#x61;script:`, a `javascript:` scheme split across a newline) do
  not slip through.
- Because the guard runs in n8n before the commit, a rejected SVG never reaches a branch on
  the weekly path. The Action's copy only matters if you use the legacy rasteriser directly,
  and there a rejection blocks the PNG rather than the already-pushed SVG.
- The n8n GitHub credential is a fine-grained token scoped to this repository only, with
  **Contents: read and write** and **Pull requests: read and write**. No other permissions.
- `topics.json` is public. Treat it as a public editorial calendar: never put anything in it
  you would not be happy to see tweeted.
