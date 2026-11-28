# automation/ — the Artisan publisher

Everything in this folder belongs to the automated post pipeline, and **all of it is
published to the site as static files** — Jekyll copies every path that does not start with
`_`, and `_config.yml` sets no `exclude:`. `README.md`, `topics.json` and `skills.md` are all
served from `https://scotch83.github.io/automation/…`. Treat every file in this folder as
public.

## What runs

| Workflow (n8n) | Trigger | What it does |
|---|---|---|
| `artisan-publisher · telegram-post` | a command in Telegram | **The front door.** Writes the post you asked for and opens the pull request |
| `artisan-publisher · generate` | called by the two above | The engine: topic in, post + front matter + cover out |
| `artisan-publisher · publish` | called by the two above | Everything that touches GitHub: branch, four commits, pull request, Telegram ping |
| `artisan-publisher · weekly-post` | Sunday 21:00 Europe/Rome | The scheduled variant: head of `topics.json` in, pull request out |
| `artisan-publisher · topic-planner` | every 2 months | Tops `queue` back up to ~16 topics and opens a small PR |
| `artisan-publisher · errors` | any of the above fails | Sends the failing node, the reason and an execution link to Telegram |

Nothing publishes itself. Every run ends in a pull request that you review and merge.

## Publishing on demand, from Telegram

Send a command to the Artisan bot and a pull request appears a few minutes later.

| Command | What it does |
|---|---|
| `/artisan <a subject>` | Writes that post. A rough subject is enough — the researcher finds the angle: `/artisan postgres performance` |
| `/artisan next` | Takes the head of `topics.json`, exactly like the Sunday run |
| `/artisan topic <id>` | A named queued topic; `/artisan list` prints the ids |
| `/artisan list` | The backlog |

What happens after the command:

1. `Guard & Parse` checks the chat id against the owner allowlist built into the node. Any
   other chat gets **no reply at all** — not a refusal, so the bot does not advertise itself.
2. **It researches.** A small model turns the request into two search queries, which are run
   against three free sources, each chosen for a different question:

   | Source | Answers |
   |---|---|
   | Hacker News (Algolia) | what the industry is arguing about, and when |
   | Stack Overflow | what people actually get stuck on — the real bug shapes |
   | dev.to | what the community is writing this month |

   Results are de-duplicated by headline (HN reposts the same story with tracking params) and
   labelled by age, so the digest is not three copies of a 2016 article. This is what lets
   `/artisan postgres performance` work: the request only has to name a subject.

3. A planner model turns the request **and the research** into one topic: a title of at most
   65 characters, a one-sentence arguable angle, 3–4 tags from the closed vocabulary, and up to
   three documentation URLs. It must name the official reference page for the primary
   technology; URLs it invents must be on the documentation allowlist, while URLs the research
   actually returned are trusted as-is.
4. The generator writes and fact-checks the post as usual, draws the cover, and `publish`
   opens the pull request. The chat gets one acknowledgement at the start and the PR link at
   the end.
5. If anything fails, `artisan-publisher · errors` sends the failing node, the reason and a
   link to the execution. A failure is never silent.

**It rides on the existing bot.** Telegram allows one `getUpdates` consumer per bot token,
and `fin-bot · telegram` is already that consumer, so the publisher does not poll Telegram at
all. `fin-bot · telegram` gained two nodes:

- `Is Artisan Command?` — a single check on `message.text` starting with `/artisan`.
- `Forward to Artisan` — POSTs the update verbatim to the publisher's n8n webhook and stops.

Everything that is not an `/artisan` command falls through to `Route Command` and behaves
exactly as it did before. The forward node is set to continue on error, so a publisher outage
cannot take the trading bot down with it. Nothing needs configuring: it is already active.

The publisher itself listens on a webhook inside `artisan-publisher · telegram-post`. The
path is unguessable and the workflow is active, so there is nothing to switch on. If you ever
rotate the path, update the URL in `Forward to Artisan` to match.

**Why not a second bot.** Two bots would be tidier, but Telegram's single-consumer rule means
the second one needs its own token from BotFather, and the replies would arrive from a
different identity than the one you are talking to. One bot, one conversation.

**The Sunday run is optional.** `weekly-post` is the same generation and the same publish, on
a clock. Deactivate it if you would rather only publish what you ask for.

## What a run does, step by step

1. Read `automation/topics.json` and `automation/skills.md` from `main`.
2. Take the first topic in `queue`.
3. Fetch the topic's `sources` — the official documentation pages listed on the topic in
   `topics.json` — and give the excerpts to the writer as **ground truth**. They are the only
   authority for API names, versions, deprecations and behaviour. A topic with no sources
   tells the writer to make no version-specific claim at all.
4. Write the post: ~500–1000 words in the house style, `<!--more-->` after the intro,
   `## Conclusion` + "Happy coding!" at the end, 3–4 tags from the closed vocabulary. Every
   code sample must compile as printed: it declares or imports everything it uses.
5. **Fact-check the draft before any artwork is drawn.** A second model audits it against the
   fetched excerpts and against what the APIs actually are, and returns findings with a
   severity. A blocker is anything a reader could catch: an invented API, a wrong import path,
   code that would not compile, a version claim the excerpts do not support, an invented
   metric, or a first-person incident with dates and numbers in it. The author's voice —
   opinions, preferences, generalised experience — is explicitly not a finding, or the
   ghostwriter would be lobotomised. Blockers trigger exactly one revision pass, never a loop.
6. Draw the cover, in two calls. A second DeepSeek pass writes the brief and must name the
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
7. Validate everything — front matter keys, tag vocabulary, word count, no unsafe SVG
   content, no `{{` outside `{% raw %}`, and a **contrast gate** that rejects a full-bleed
   pale cover, because the post title is white. A rejected cover is retried once with a
   hardened brief; any other failure aborts the run and alerts. The traced artwork is also
   wrapped in the same **soft drop shadow** the existing covers carry (a
   `feGaussianBlur`/`feOffset` filter, about 500 bytes) — the image model draws flat, and
   vectorising a blurred shadow would produce dozens of banded paths.
8. Create branch `artisan/<YYYY-MM-DD>-<HHMMSS>` from `main` and commit — the time suffix
   makes every attempt its own branch, so retrying a run that failed halfway cannot
   collide with the branch and file blobs the failed attempt left behind:
   - `_posts/<YYYY-MM-DD>-<slug>.md`
   - `assets/images/<slug>.svg`
   - `assets/images/<slug>.png`
   - `automation/topics.json` (topic moved from `queue` to `published`)
9. Open the pull request with the draft inline. There is no polling step: the PNG is
   generated before the commit, so nothing waits on another system.
10. Send a Telegram message with the PR link.

## Is any of this true?

The publisher writes under a real person's name, so a wrong post is worse than a missed one.
Three layers stand between a draft and `main`, and they fail in different ways:

| Layer | What it catches | What it cannot catch |
|---|---|---|
| Research | Staleness and blind spots: what is being discussed now, what people actually get stuck on | It finds discussion, not truth. A popular post can be wrong |
| Ground truth | Versions, deprecations, behaviour, API names — the excerpts fetched from the official docs are the only authority the writer gets | A topic with no `sources` falls back to "make no version-specific claim", which is weaker |
| Fact-check pass | Invented APIs and imports, code that cannot compile, unsupported version claims, invented metrics, fabricated incidents | It is a model too. It can miss something, and it can be argued out of a finding |
| `verify-code.mjs` | Anything that does not parse or type-check, and any identifier the post never declares | Whether the sample is a *good* example, and template-level Angular errors |

They run in that order, cheapest first: the two research planner calls are ~$0.001 each, the
fact-check is a ~$0.002 DeepSeek call, and the type check costs CI minutes. None is a proof.
The honest summary is: the post is researched, checked against primary sources, and it
compiles — and a human still reads it in the pull request.

**Adding sources to a topic.** Put the documentation URLs on the topic object:

```json
{
  "id": "postgresql-multi-tenant-reporting",
  "sources": ["https://www.postgresql.org/docs/current/ddl-partitioning.html"],
  "tags": ["postgresql", "architecture", "database"]
}
```

Up to three pages are fetched, HTML is stripped, and about 12k characters reach the writer.
Prefer the reference page over a blog post: an authority that is wrong is worse than none.

**Running the code check by hand.**

```bash
cd automation && npm install
node verify-code.mjs ../_posts/2026-11-27-angular-signals-zoneless.md
```

It reports the markdown line of every problem, so a failure points at the sample rather than at
the post. `--changed --base origin/main` checks only the posts a branch touched, which is what
`.github/workflows/verify-post.yml` runs.

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

**Add the documentation a topic needs.** Give the topic a `sources` array of official doc
URLs. The pipeline fetches them and hands the excerpts to the writer as ground truth and to
the fact-checker as the yardstick; without them the writer is told to make no version-specific
claim. See *Is any of this true?* above.

**Change what it writes about.** Edit `automation/skills.md`. It is embedded into the writing
and planning prompts verbatim, and it is the only place the model learns your voice, your
stack and the topics that are off limits.

**Watch the nouns you put in `skills.md`.** The writer treats that file as the only source of
truth about you, so any concrete domain it names is fair game for a code sample: a brief that
mentions finance processing produced a post whose component, model and module path were all
named after that business process. Describe the background generically, and keep the
non-negotiable rule that examples use an ordinary domain — orders, invoices, customers, items,
events. A reader should never be able to infer an employer's industry from the code.

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

Every artist workflow points at `artisan-publisher · errors`, which messages the author's
chat with the failing node, the reason and a link to the execution. (They used to share
`fin-bot · errors`; a publishing failure should not arrive dressed as a trading alert.)
The posting rule is strict: **a failure never opens a pull request and never writes to
`main`, so nothing publishes.** It can, however, leave a branch behind: the run pushes
`artisan/<date>-<time>` and its commits before it opens the PR. That branch is inert, and
because every attempt gets its own timestamped name, re-running simply starts a new one.

The cover path has one recoverable failure: the contrast gate rejects a full-bleed pale
image because white type sits across the middle. That triggers a single retry with a
hardened brief; a second failure aborts with an alert rather than publishing an unreadable
cover.

To retry, just send the command again: every run is independent and gets its own branch.
If the failure was in the generator rather than the request, `artisan-publisher · generate`
can also be run from the n8n UI with a topic, which costs the generation but writes nothing.

## Security notes

- **The publisher accepts exactly one chat.** `Guard & Parse` in
  `artisan-publisher · telegram-post` compares both the chat id and the sender id against an
  allowlist built into the node. Anything else is dropped without a reply, so a stranger who
  finds the bot cannot spend money on generations and does not learn that a publisher is
  listening. This matters more now that the publisher shares a bot with the trading commands:
  the allowlist is what keeps them apart.
- **The webhook path is a bearer secret.** `artisan-cmd-<random>` is unguessable, the
  workflow validates the chat id anyway, and the path is deliberately not written down in this
  public repository.
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
