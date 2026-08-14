# saidwhen

**An archive of what AI companies said about their own systems, and when they said it.**

Usage policies, model cards, terms, deprecation notices, safety documentation. Fetched daily,
reduced to readable text, committed. That's it.

The point is the history, not the snapshot:

```bash
git log -p archive/anthropic/usage-policy.txt
```

Every change to that document, in order, with the date it was observed. No account, no API,
no paywall, no interpretation — just the record.

## Why this exists

These documents are edited constantly and quietly. A clause is softened, a capability claim is
removed, a permitted use becomes a prohibited one, a model card loses a limitation. The previous
version simply stops existing. There's no changelog, no notification, and usually no
acknowledgement that anything moved.

How AI systems are governed — and how those rules shift — is going to be argued about for a long
time. The primary sources are evaporating in real time.

**This cannot be built retroactively.** Anyone can copy the twenty lines of code that run it, and
they still won't have today. That's the entire value: someone kept it, faithfully, starting now.

## What's in here

| | |
|---|---|
| [`sources.json`](sources.json) | Every URL watched, with what it is and who publishes it |
| [`archive/`](archive/) | Current text of each document. **The git history of this directory is the archive.** |
| [`scripts/archive.mjs`](scripts/archive.mjs) | The whole mechanism. Zero dependencies, zero credentials. |

## How it works, and what it won't do

Each source is fetched once per day, with an identifying user agent, honouring `robots.txt`.
HTML is reduced to text before storage — a diff has to be readable by a human, and raw HTML
diffs are drowned in changed build hashes and reordered attributes.

Three rules it holds to:

**A failed fetch never overwrites a good snapshot.** If a page returns an error, or comes back as
a near-empty JavaScript shell, the previous capture stays and the failure is reported. Silently
replacing a real policy with a block page is the one error this archive genuinely cannot afford.

**A block is a refusal, and gets treated as one.** OpenAI's policy pages return `403` to
non-browser clients. That gap is recorded in `sources.json` rather than worked around by
pretending to be a browser. An archive whose own conduct is questionable is worth less than no
archive.

**Nothing is interpreted.** No summarising, no "what this means", no editorialising about whether
a change is good or bad. The diff is the product. Draw your own conclusions.

## Coverage

Deliberately small and honest at the start. Adding a source is a pull request editing
`sources.json` — if there's a public document about an AI system that ought to be on the record,
open one.

Missing something is a gap; claiming coverage that isn't real would be worse.

## Licence

Archived documents remain the property and copyright of their publishers, reproduced here as a
factual record of what was published and when, with the source URL on every file.

The code is MIT. The record is meant to be used — cite it, diff it, clone it, mirror it. If this
project disappears, the git history is the whole thing and it's yours to keep.
