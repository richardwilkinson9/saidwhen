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
import { dirname } from 'node:path';

const root = new URL('../', import.meta.url);
const sources = JSON.parse(readFileSync(new URL('sources.json', root), 'utf8')).sources;

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

  // Collapse whitespace without collapsing paragraphs.
  s = s.replace(/[ \t ]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');

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

    const text = toText(await res.text());

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
    if (prev === body) {
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

console.log(`\n${changed} changed, ${unchanged} unchanged, ${failed.length} failed`);
for (const f of failed) console.log(`  ! ${f}`);

// A failed fetch must never look like "nothing changed". It leaves the previous
// snapshot in place, which is correct, but it has to be visible.
if (failed.length) process.exitCode = 0;
