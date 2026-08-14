#!/usr/bin/env node
/**
 * Makes changes readable, and flags the ones that matter.
 *
 * A raw diff is the record, but it is not an explanation. Someone who cares
 * about how AI systems are governed — a journalist, a policy researcher, a
 * lawyer — should not have to read a unified diff to find out that a company
 * quietly deleted a restriction.
 *
 * So each change gets two things written alongside it, never instead of it:
 *
 *   1. A **significance flag**, computed deterministically from the text. No
 *      model involved, so it cannot hallucinate and it works with no
 *      credentials. Deliberately blunt.
 *   2. A **plain-English summary**, written by a model, clearly labelled as
 *      generated and shown next to the diff it describes so anyone can check
 *      it in one glance.
 *
 * The rule this project holds to is not "never interpret" — that made the
 * archive unreadable to the people most likely to need it. It is: **never let
 * an interpretation replace, obscure, or outrank the record.** The diff stays
 * primary, the summary is labelled, and a summary is never written for a change
 * whose diff is not published beside it.
 *
 * Results are cached by commit sha in data/summaries.json, so each change is
 * summarised once, ever.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { diffLines, countChanges } from './lib/diff.mjs';

const root = new URL('../', import.meta.url);
const CACHE = new URL('data/summaries.json', root);
const git = (...a) =>
  execFileSync('git', a, { cwd: root.pathname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const sources = JSON.parse(readFileSync(new URL('sources.json', root), 'utf8')).sources;
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

const TOOLING = (() => {
  const f = new URL('data/tooling-commits.json', root);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).commits ?? {} : {};
})();

/* --------------------------------------------------------- significance */

/**
 * Words that carry obligation or prohibition. A change that touches one of
 * these is a change to what someone is allowed to do, which is the only kind
 * of change this archive exists to catch.
 */
const BINDING = [
  'prohibit', 'must not', 'may not', 'shall not', 'not permitted', 'restricted',
  'forbidden', 'disallow', 'banned', 'you agree not to', 'unacceptable',
  'required to', 'must ', 'shall ', 'obligation', 'liable', 'liability',
  'terminate', 'suspend', 'warrant', 'indemnif', 'effective date', 'effective ',
  'retire', 'deprecat', 'end of life', 'sunset', 'discontinu',
];

const hits = (line) => {
  const l = line.toLowerCase();
  return BINDING.filter((k) => l.includes(k));
};

/**
 * Removing a restriction is more consequential than adding one, and far easier
 * to miss — nobody announces a loosening. That asymmetry is the single most
 * useful thing this flag encodes.
 */
function significance(rows) {
  const removedBinding = [];
  const addedBinding = [];
  for (const r of rows) {
    if (r.type === 'del') { const h = hits(r.line); if (h.length) removedBinding.push(r.line); }
    if (r.type === 'add') { const h = hits(r.line); if (h.length) addedBinding.push(r.line); }
  }
  const { added, removed } = countChanges(rows);

  if (removedBinding.length) {
    return {
      level: 'notable',
      why: `A restriction or obligation was removed or reworded — ${removedBinding.length} line${
        removedBinding.length === 1 ? '' : 's'} containing binding language went away. Loosenings are rarely announced.`,
    };
  }
  if (addedBinding.length) {
    return {
      level: 'notable',
      why: `${addedBinding.length} line${addedBinding.length === 1 ? '' : 's'} of binding language were added — this changes what someone is permitted or required to do.`,
    };
  }
  if (added + removed >= 25) {
    return { level: 'substantial', why: `${added + removed} lines changed — a large revision, though no obligation wording moved.` };
  }
  return { level: 'routine', why: 'No binding language changed. Likely wording, structure or navigation.' };
}

/* ------------------------------------------------------------- summary */

/** Is a model available to write the plain-English part? */
function modelAvailable() {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) return false;
  try {
    execFileSync('claude', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function summarise(doc, rows) {
  const shown = rows
    .filter((r) => r.type !== 'same')
    .slice(0, 120)
    .map((r) => `${r.type === 'add' ? '+' : '-'} ${r.line}`)
    .join('\n')
    .slice(0, 12000);

  const prompt = `Below is a diff of ${doc.org}'s ${doc.kind}, taken from two archived captures of ${doc.url}.

Write ONE sentence, maximum 30 words, in plain English, saying what changed. Write for an intelligent non-technical reader — a journalist or policy researcher — not an engineer.

Rules:
- State only what the diff shows. Never speculate about motive or consequence.
- If the change is purely navigation, boilerplate, formatting or a date, say so plainly.
- No preamble. Output the sentence and nothing else.
- If you genuinely cannot tell what changed, output exactly: Unclear from the diff.

DIFF:
${shown}`;

  try {
    const out = execFileSync('claude', ['-p', prompt, '--output-format', 'text'], {
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    }).trim();

    const first = out.split('\n').filter(Boolean).pop()?.trim() ?? '';
    // A model that ignores the length rule is a model that ignored the other
    // rules too. Drop it rather than publish something unverified and long.
    if (!first || first.length > 300) return null;
    return first;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- run */

const canSummarise = modelAvailable();
if (!canSummarise) {
  console.log('no model available — computing significance flags only, summaries left blank');
}

let written = 0;
let reused = 0;

for (const src of sources) {
  const file = `archive/${src.id}.txt`;
  if (!existsSync(new URL(file, root))) continue;

  const log = git('log', '--follow', '--format=%H', '--', file).trim().split('\n').filter(Boolean).reverse();

  for (let i = 1; i < log.length; i++) {
    const sha = log[i];
    const before = git('show', `${log[i - 1]}:${file}`);
    const after = git('show', `${sha}:${file}`);
    const rows = diffLines(before, after);
    const { added, removed } = countChanges(rows);
    if (!added && !removed) continue;

    const existing = cache[sha];
    if (existing?.summary && existing?.significance) { reused++; continue; }

    // Our own reformatting is not a change to what the publisher said, and
    // must never be summarised as though it were.
    if (TOOLING[sha]) {
      cache[sha] = {
        doc: src.id,
        significance: 'tooling',
        why: TOOLING[sha],
        summary: null,
        summary_generated: false,
      };
      written++;
      console.log(`tooling     ${src.id}`);
      continue;
    }

    const sig = significance(rows);
    const summary = existing?.summary ?? (canSummarise ? summarise(src, rows) : null);

    cache[sha] = {
      doc: src.id,
      significance: sig.level,
      why: sig.why,
      summary: summary ?? null,
      summary_generated: summary ? true : false,
    };
    written++;
    console.log(`${sig.level.padEnd(11)} ${src.id}  ${summary ? '' : '(no summary)'}`);
  }
}

mkdirSync(new URL('data/', root).pathname, { recursive: true });
writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n');
console.log(`\n${written} summarised, ${reused} already cached`);
