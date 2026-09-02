#!/usr/bin/env node
/**
 * The archive.
 *
 * Fetches each source, reduces it to readable text, and writes it to a stable
 * path. That is the whole mechanism — **git history is the archive**. Every
 * change to what a company says about its own AI systems becomes a commit, and
 * `git log -p archive/anthropic/usage-policy.txt` is the complete record of how
 * that document evolved, for free, forever.
 *
 * The single design rule everything else follows from: a diff must be readable
 * by a human. Raw HTML diffs are noise — a changed build hash or a reordered
 * class attribute would swamp a real change to a policy clause. So pages are
 * reduced to text and volatile scaffolding is stripped before comparison.
 *
 * Zero dependencies, zero credentials. Runs anywhere Node runs.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const root = new URL('../', import.meta.url);
const sources = JSON.parse(readFileSync(new URL('sources.json', root), 'utf8')).sources;

/**
 * What is currently held awaiting corroboration, as a hash per source.
 *
 * This lived in an untracked .pending/ directory for its first three weeks,
 * which worked perfectly on a laptop and never once worked in CI: every run
 * starts from a fresh checkout, so the held state was gone before the next
 * fetch could agree with it. Every difference was held, forgotten, and held
 * again the next day — the archive recorded nothing at all for nineteen days
 * while reporting success every morning.
 *
 * So the held state is committed like everything else. A hash is enough: we
 * only ever ask whether this capture matches the one held, and storing the
 * hash keeps the file small and its diffs readable.
 */
const PENDING_FILE = new URL('data/pending.json', root);
const pending = existsSync(PENDING_FILE) ? JSON.parse(readFileSync(PENDING_FILE, 'utf8')) : {};
const digest = (s) => createHash('sha256').update(s).digest('hex');

/** Roughly the size of the comment header, so shrink comparisons look at content. */
const HEADER_ALLOWANCE = 260;

const UA =
  'saidwhen-archiver/0.1 (+https://saidwhen.org; archives public AI policy pages; one request per source per run)';

/** Strip everything that changes without the meaning changing. */
function toText(html) {
  let s = html;

  // Non-content elements, including their contents.
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');
  s = s.replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  // Keep the document's structure as line breaks so a changed clause shows up
  // on its own line rather than buried in one enormous paragraph.
  s = s.replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<h([1-6])\b[^>]*>/gi, '\n\n');

  s = s.replace(/<[^>]+>/g, ' ');

  // Entities, in the order that avoids double-decoding.
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&amp;/gi, '&');

  // Collapse every run of whitespace containing a newline down to exactly one
  // newline. This looks like it costs readability, and it does — but the same
  // page served twice can differ purely in how many wrapper elements surround a
  // block, and preserving paragraph spacing turned that into a 108-line diff of
  // identical prose on the first day. Determinism beats prettiness: one block,
  // one line, whatever markup it arrived in.
  // Private-use-area codepoints are icon-font glyphs — an anchor icon beside a
  // heading, a chevron in a nav. They carry no text, are not whitespace, and
  // come and go between renderings. Anthropic's headings each ended in one,
  // which is the whole of a 39-line 'change' to its deprecation page.
  s = s.replace(/[\uE000-\uF8FF]/g, '');

  s = s.replace(/[^\S\n]+/g, ' ');
  s = s.replace(/\s*\n\s*/g, '\n');

  // Drop lines that are pure punctuation or a single stray character — residue
  // from stripped icons and separators, which also comes and goes between
  // renderings.
  s = s
    .split('\n')
    .filter((l) => /[a-z0-9]/i.test(l))
    .join('\n');

  return s.trim() + '\n';
}

/**
 * Honour robots.txt. Not because anyone would notice, but because an archive
 * whose own conduct is questionable is worth less than no archive.
 */
const robotsCache = new Map();
async function allowed(url) {
  const u = new URL(url);
  const origin = u.origin;
  if (!robotsCache.has(origin)) {
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': UA } });
      robotsCache.set(origin, res.ok ? await res.text() : '');
    } catch {
      robotsCache.set(origin, '');
    }
  }
  const txt = robotsCache.get(origin);
  if (!txt) return true;

  // Only the wildcard group applies to us; we are not named anywhere.
  const groups = txt.split(/\n(?=user-agent:)/i);
  const star = groups.find((g) => /^user-agent:\s*\*/i.test(g.trim()));
  if (!star) return true;

  for (const line of star.split('\n')) {
    const m = line.match(/^\s*disallow:\s*(\S*)\s*$/i);
    if (!m) continue;
    const path = m[1];
    if (path && u.pathname.startsWith(path)) return false;
  }
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let changed = 0;
let unchanged = 0;
const failed = [];
const held = [];

for (const src of sources) {
  const dest = new URL(`archive/${src.id}.txt`, root);

  try {
    if (!(await allowed(src.url))) {
      failed.push(`${src.id}: disallowed by robots.txt — skipped, not fetched`);
      continue;
    }

    const res = await fetch(src.url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let text = toText(await res.text());

    // Archive the document, not the page. Sidebars, cookie banners and nav
    // menus change constantly and have nothing to do with what a company
    // says — and they poison everything downstream: a sidebar link containing
    // the word "cost" was flagged as a restriction being removed, and a cookie
    // banner appearing was recorded as a change to a deprecation policy.
    // Trimming to the document body removes that entire class of false alarm.
    if (src.start_after) {
      const i = text.indexOf(src.start_after);
      if (i === -1) {
        failed.push(`${src.id}: start marker ${JSON.stringify(src.start_after)} not found — keeping the previous snapshot rather than archiving the wrong region`);
        continue;
      }
      text = text.slice(i);
    }
    if (src.stop_before) {
      const i = text.indexOf(src.stop_before, 1);
      if (i > 0) text = text.slice(0, i);
    }
    text = text.trim() + '\n';

    // A page that reduces to almost nothing is a JS-rendered shell or a block
    // page, not a policy. Writing it would destroy a good snapshot with a bad
    // one — the one failure this archive genuinely cannot afford.
    if (text.length < 500) {
      failed.push(`${src.id}: only ${text.length} chars of text — looks JS-rendered or blocked, keeping previous snapshot`);
      continue;
    }

    const header =
      `# ${src.org} — ${src.kind}\n` +
      `# source: ${src.url}\n` +
      `# archived by saidwhen.org — git history is the record; see \`git log -p\` on this file\n` +
      `# ---\n\n`;
    const body = header + text;

    const prev = existsSync(dest) ? readFileSync(dest, 'utf8') : null;

    // The length floor above is not enough on its own, and Meta proved it on
    // day one: its page served nav and footer but dropped the entire policy
    // body client-side, and 5,800 characters of chrome sailed past a 500-char
    // check while the actual content silently vanished from the archive.
    //
    // So compare against what we already hold. A capture that has lost a third
    // of the previous one is a rendering failure until proven otherwise —
    // documents get edited, they do not evaporate.
    if (prev && text.length < (prev.length - HEADER_ALLOWANCE) * 0.66) {
      failed.push(
        `${src.id}: new capture is ${text.length} chars vs ${prev.length} held — ` +
        `lost a third or more, treating as a rendering failure and keeping the previous snapshot`
      );
      continue;
    }

    // Per-source proof that the substance is present. Cheap, exact, and the
    // only thing that catches a page which shrinks gradually rather than all
    // at once.
    if (src.must_contain && !text.includes(src.must_contain)) {
      failed.push(
        `${src.id}: capture is missing its required marker ${JSON.stringify(src.must_contain)} — ` +
        `keeping the previous snapshot`
      );
      continue;
    }

    // Corroboration. Meta produced two convincing-looking diffs from its first
    // two fetches, and both were largely the same text relocated by a differing
    // render — the page is not served identically to every client. An archive
    // that reports those as a company editing its policy is crying wolf, and
    // one false alarm costs more trust than a day of latency costs.
    //
    // So a difference is held as pending and only enters the record when a
    // later fetch sees the same thing again. A change that is real persists; a
    // rendering wobble does not.
    if (prev !== null && prev !== body) {
      const hash = digest(body);
      if (pending[src.id]?.hash !== hash) {
        pending[src.id] = { hash, first_seen: new Date().toISOString().slice(0, 10) };
        held.push(`${src.id}: differs from the record — held for corroboration, will be recorded if the next fetch agrees`);
        continue;
      }
      // Seen twice running. It is real.
      delete pending[src.id];
    }

    if (prev === body) {
      // Whatever was pending disagreed with reality twice over; drop it.
      delete pending[src.id];
      unchanged++;
    } else {
      mkdirSync(dirname(dest.pathname), { recursive: true });
      writeFileSync(dest, body);
      console.log(`${prev === null ? 'NEW    ' : 'CHANGED'}  ${src.id}`);
      changed++;
    }
  } catch (e) {
    failed.push(`${src.id}: ${e.message}`);
  }

  await sleep(1500); // One polite request at a time.
}

mkdirSync(new URL('data/', root).pathname, { recursive: true });
writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2) + '\n');

console.log(
  `\n${changed} changed, ${unchanged} unchanged, ${held.length} held for corroboration, ${failed.length} failed`
);
for (const h of held) console.log(`  ~ ${h}`);
for (const f of failed) console.log(`  ! ${f}`);

// A failed fetch must never look like "nothing changed". It leaves the previous
// snapshot in place, which is correct, but it has to be visible — and a guard
// that fired is a louder signal than a network error, because it means a page
// actively tried to replace good data with bad.
if (failed.length) {
  console.log(
    `\n${failed.length} source(s) kept their previous snapshot rather than accept a bad capture.`
  );
}
