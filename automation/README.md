# automation/ — the Artisan publisher

Everything in this folder belongs to the automated post pipeline. Nothing here is part of
the Jekyll build; Jekyll ignores files that do not start with `_` or sit in a known folder,
and `automation/` is not published to the site.

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
4. Write the cover: a separate LLM call turns the finished post into a **transparent SVG**
   (`viewBox="0 0 1024 1024"`, no background, flat shapes, colour meaningful to the subject).
5. Validate everything — front matter keys, tag vocabulary, word count, no unsafe SVG
   content, no `{{` outside `{% raw %}`. Any failure aborts the run and alerts.
6. Create branch `artisan/<YYYY-MM-DD>` from `main` and commit:
   - `_posts/<YYYY-MM-DD>-<slug>.md`
   - `assets/images/<slug>.svg`
   - `automation/topics.json` (topic moved from `queue` to `published`)
7. The push triggers **`.github/workflows/raster-svg.yml`**, which rasterises the new SVG to
   `assets/images/<slug>.png` (1024px wide, alpha preserved) and commits it to the same branch.
8. Poll for that PNG for up to about three minutes (nine attempts, twenty seconds apart),
   then open the pull request with the draft inline.
9. Send a Telegram message with the PR link.

## Why the PNG exists at all

`feed.xml` publishes `<linkedin-img>` for every post, and that feed drives a LinkedIn
automation. So each cover ships in two formats:

- **`.svg`** — transparent, scales perfectly in the post list (a 192×192 box, 100×100 on
  mobile) and behind the post title. This is the file the site renders.
- **`.png`** — the raster twin LinkedIn pulls. Alpha preserved, 1024px wide.

WebP is never used: the LinkedIn automation re-fetches the image, and PNG is the only format
already proven end to end.

## Operating it

**Regenerate a post you did not like.** Run `artisan-publisher · generate` from the n8n UI
with a topic. It does not touch the branch or the PR — you get the markdown and the SVG to
inspect, and you can re-run as often as you like without consuming the queue.

**Change what it writes about.** Edit `automation/skills.md`. It is embedded into the writing
and planning prompts verbatim, and it is the only place the model learns your voice, your
stack and the topics that are off limits.

**Add or reorder topics.** Edit `queue` in `automation/topics.json`. Order is the publish
order. `published` records what has already been used and is appended to automatically —
do not hand-edit it except to remove a mistake.

**Change the tags.** `vocabulary` is a closed list. Add a tag there before a post can use it;
the workflow rejects a post carrying a tag outside the list. `core` marks the tags the writer
prefers when the choice is free.

**Pause it.** Deactivate `artisan-publisher · weekly-post` in n8n. The topic planner and the
rasteriser are harmless on their own.

## Failure handling

All three workflows report through the shared n8n error workflow, which messages Telegram.
The posting rule is strict: **a failure never opens a pull request and never writes to
`main`, so nothing publishes.** Be precise about the second half of that, though — by the
time the run reaches the PNG poll it has already pushed `artisan/<date>` and three commits
to the remote. A failure after that point therefore leaves an inert branch behind. `main` is
untouched, so the queue and the published list stay correct, but `weekly-post` will stop at
*Create Branch* if you re-run it for the same date until that branch is deleted.

There is no retry command from Telegram (the bot's single trigger belongs to another
workflow) — re-run `artisan-publisher · generate` from the n8n UI instead.

The one merge-blocking prerequisite: **`.github/workflows/raster-svg.yml` must be on `main`
before the weekly workflow is activated.** GitHub only runs a workflow file that already
exists on the ref being pushed, so on the very first post the branch would have no
rasteriser, and the run would abort waiting for a PNG that never appears.

## Security notes

- The artwork is machine-authored and lands in a public repository, so the rasteriser
  **refuses to publish** any SVG containing `<script>`, `<foreignObject>`, an `on*` event
  handler, an `<!ENTITY>` declaration, a `javascript:` URL, or a remote `href`. The same
  check runs in n8n before the commit, so a bad SVG never reaches a branch.
- The n8n GitHub credential is a fine-grained token scoped to this repository only, with
  **Contents: read and write** and **Pull requests: read and write**. No other permissions.
- `topics.json` is public. Treat it as a public editorial calendar: never put anything in it
  you would not be happy to see tweeted.
