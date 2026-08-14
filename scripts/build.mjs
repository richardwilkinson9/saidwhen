#!/usr/bin/env node
/**
 * Renders the archive as a static site.
 *
 * The value of this project is its history, and until now that history was
 * only reachable by cloning the repo and running `git log -p` — which almost
 * nobody will do. This walks the git history of every archived file, computes
 * every diff between consecutive versions, and writes the lot out as plain
 * HTML: one page per document, one page per observed change.
 *
 * Static on purpose. The site has no backend, no database and no API to go
 * down, and every page can be saved, printed or mirrored. An archive that
 * depends on a running service to be read is not much of an archive.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { diffLines, hunks, countChanges, wordDiff } from './lib/diff.mjs';
import { page, esc } from './lib/layout.mjs';

const root = new URL('../', import.meta.url);
const OUT = new URL('_site/', root);
const git = (...args) =>
  execFileSync('git', args, { cwd: root.pathname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const sources = JSON.parse(readFileSync(new URL('sources.json', root), 'utf8')).sources;

/* ---------------------------------------------------------------- history */

const docs = [];

for (const src of sources) {
  const file = `archive/${src.id}.txt`;
  if (!existsSync(new URL(file, root))) {
    docs.push({ ...src, versions: [], changes: [], missing: true });
    continue;
  }

  const log = git('log', '--follow', '--format=%H%x1f%aI', '--', file)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sha, date] = l.split('\x1f');
      return { sha, date };
    })
    .reverse(); // oldest first

  const versions = log.map((v) => ({
    ...v,
    short: v.sha.slice(0, 7),
    content: git('show', `${v.sha}:${file}`),
  }));

  // A change is the transition between two consecutive versions. The first
  // version is the moment the document entered the archive, not a change.
  const changes = [];
  for (let i = 1; i < versions.length; i++) {
    const rows = diffLines(versions[i - 1].content, versions[i].content);
    const { added, removed } = countChanges(rows);
    if (!added && !removed) continue;
    changes.push({
      sha: versions[i].sha,
      short: versions[i].short,
      date: versions[i].date,
      prev: versions[i - 1].short,
      rows,
      added,
      removed,
    });
  }

  docs.push({ ...src, file, versions, changes, first: versions[0], latest: versions.at(-1) });
}

const allChanges = docs
  .flatMap((d) => d.changes.map((c) => ({ ...c, doc: d })))
  .sort((a, b) => b.date.localeCompare(a.date));

const lastRun = (() => {
  try {
    return git('log', '-1', '--format=%aI').trim();
  } catch {
    return new Date().toISOString();
  }
})();

/* ----------------------------------------------------------------- format */

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtDateLong = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const ago = (iso) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
};

const delta = (added, removed) =>
  `${added ? `<span class="plus">+${added}</span>` : ''}${added && removed ? ' ' : ''}${
    removed ? `<span class="minus">−${removed}</span>` : ''
  }`;

/** Render a diff, highlighting the changed words inside a swapped line pair. */
function renderDiff(rows) {
  const shown = hunks(rows);
  const out = [];
  for (let i = 0; i < shown.length; i++) {
    const r = shown[i];
    const next = shown[i + 1];

    // A deletion immediately followed by an addition is almost always one
    // rewritten sentence. Marking the words that actually moved is the
    // difference between seeing a change and understanding it.
    if (r.type === 'del' && next?.type === 'add' && r.line.trim() && next.line.trim()) {
      const w = wordDiff(r.line, next.line);
      if (w.removed || w.added) {
        out.push(
          `<span class="row del">${esc(w.prefix)}<mark class="w">${esc(w.removed)}</mark>${esc(w.suffix)}</span>`,
          `<span class="row add">${esc(w.prefix)}<mark class="w">${esc(w.added)}</mark>${esc(w.suffix)}</span>`
        );
        i++;
        continue;
      }
    }
    out.push(`<span class="row ${r.type}">${esc(r.line) || ' '}</span>`);
  }
  return `<pre>${out.join('\n')}</pre>`;
}

function write(path, html) {
  const dest = new URL(`_site/${path}`, root);
  mkdirSync(dirname(dest.pathname), { recursive: true });
  writeFileSync(dest, html);
}

/* ------------------------------------------------------------------ pages */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const base = { checked: ago(lastRun) };
const totalVersions = docs.reduce((n, d) => n + d.versions.length, 0);
const blocked = docs.filter((d) => d.status === 'blocked');

// ---- home
{
  const recent = allChanges.slice(0, 12);
  const body = `
<div class="wrap">
  <section class="pad col">
    <div class="kicker" style="margin-bottom:1.1rem">An archive of record</div>
    <h1 class="big" style="margin-bottom:1.1rem">What AI companies said,<br>and when they said it.</h1>
    <p class="lede muted">Usage policies, model cards, terms and deprecation notices — fetched
    every day and kept forever, so that when the wording changes you can see exactly what
    changed.</p>
  </section>
</div>

<div class="band"><div class="wrap"><div class="grid">
  <div>
    <h2>These documents change quietly</h2>
    <p>A clause is softened. A capability claim disappears. A permitted use becomes a prohibited
    one. There is no changelog, no notification, and the previous version simply stops existing.</p>
  </div>
  <div>
    <h2>This cannot be built later</h2>
    <p>Anyone can copy the code that runs this in an afternoon, and they still will not have
    today. The whole value is that somebody kept it, faithfully, starting now.</p>
  </div>
</div></div></div>

<div class="wrap">
  <section class="pad">
    <div style="display:flex;gap:3rem;flex-wrap:wrap;margin-bottom:2.4rem">
      ${[
        [docs.filter((d) => !d.missing).length, 'documents watched'],
        [totalVersions, 'versions on file'],
        [allChanges.length, 'changes observed'],
      ].map(([n, l]) => `<div>
        <div class="mono" style="font-size:1.9rem;letter-spacing:-.03em">${n}</div>
        <div class="sans muted" style="font-size:.78rem;margin-top:.15rem">${l}</div>
      </div>`).join('')}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.9rem">
      <h2 style="font-size:1.3rem">Recently changed</h2>
      <a class="sans muted" style="font-size:.83rem" href="/changes/">Every change →</a>
    </div>
    ${recent.length ? `<div class="feed">${recent.map(entry).join('')}</div>` : `
    <div class="feed"><div class="entry"><span class="when muted">—</span>
      <span class="what muted">No document has changed since the archive began. That is itself
      worth recording; the first change will appear here.</span><span></span></div></div>`}
  </section>
</div>`;
  write('index.html', page({
    ...base,
    title: 'saidwhen — an archive of what AI companies said, and when',
    description: 'Usage policies, model cards, terms and deprecation notices from AI companies, fetched daily and kept in full. Every version, every diff, with the source and date on each one.',
    path: '/', nav: 'Overview',
  }, body));
}

function entry(c) {
  return `<a class="entry" href="/documents/${esc(c.doc.id)}/${esc(c.short)}/">
    <span class="when">${esc(fmtDate(c.date))}</span>
    <span class="what">${esc(c.doc.org)} — ${esc(c.doc.kind)} changed
      <span class="who">${esc(c.doc.id)}</span></span>
    <span class="delta">${delta(c.added, c.removed)}</span>
  </a>`;
}

// ---- all changes
{
  const byMonth = new Map();
  for (const c of allChanges) {
    const k = c.date.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(c);
  }
  const body = `<div class="wrap"><section class="pad">
    <div class="kicker" style="margin-bottom:.9rem">Changes</div>
    <h1 class="big" style="margin-bottom:1rem">Every change observed</h1>
    <p class="lede muted" style="margin-bottom:2.4rem">Newest first. Each entry links to the exact
    diff, with the date it was seen and the commit that recorded it.</p>
    ${allChanges.length ? [...byMonth.entries()].map(([m, list]) => `
      <div style="margin-bottom:2.2rem">
        <div class="kicker" style="margin-bottom:.5rem">${esc(
          new Date(m + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        )} · ${list.length} change${list.length === 1 ? '' : 's'}</div>
        <div class="feed">${list.map(entry).join('')}</div>
      </div>`).join('')
    : `<p class="muted">Nothing has changed yet. The archive began recently; this page fills as
       documents move.</p>`}
  </section></div>`;
  write('changes/index.html', page({
    ...base, title: 'Every change — saidwhen',
    description: 'Every observed change to an archived AI policy or model document, newest first, each linking to the exact diff.',
    path: '/changes/', nav: 'Changes',
  }, body));
}

// ---- documents index
{
  const body = `<div class="wrap"><section class="pad">
    <div class="kicker" style="margin-bottom:.9rem">Documents</div>
    <h1 class="big" style="margin-bottom:1rem">What is being watched</h1>
    <p class="lede muted" style="margin-bottom:2.4rem">Deliberately small and honest. Missing
    something is a gap; claiming coverage that is not real would be worse.</p>
    <div class="docs">
      ${docs.map((d) => `<a class="doc" href="/documents/${esc(d.id)}/">
        <span class="t">${esc(d.org)} — ${esc(d.kind)}
          ${d.status === 'blocked' ? '<span class="tag warn">blocked</span>' : ''}
          <span class="u">${esc(d.url)}</span></span>
        <span class="n">${d.versions.length} version${d.versions.length === 1 ? '' : 's'}</span>
        <span class="n">${d.changes.length ? `${d.changes.length} change${d.changes.length === 1 ? '' : 's'}` : '—'}</span>
      </a>`).join('')}
    </div>
    ${blocked.length ? `<p class="muted" style="font-size:.9rem;margin-top:1.6rem;max-width:56ch">
      ${blocked.length} source${blocked.length === 1 ? ' is' : 's are'} marked blocked: the
      publisher returns an error to any non-browser client. Those gaps are listed rather than
      worked around by pretending to be a browser — an archive whose own conduct is questionable
      is worth less than no archive.</p>` : ''}
    <p style="margin-top:2rem"><a class="btn"
      href="https://github.com/richardwilkinson9/saidwhen/blob/master/sources.json">Suggest a document →</a></p>
  </section></div>`;
  write('documents/index.html', page({
    ...base, title: 'Documents — saidwhen',
    description: 'Every AI policy, model card and terms document currently archived, with version and change counts.',
    path: '/documents/', nav: 'Documents',
  }, body));
}

// ---- per document + per change
for (const d of docs) {
  const versions = [...(d.versions ?? [])].reverse();
  const body = `<div class="wrap"><section class="pad">
    <div class="kicker" style="margin-bottom:.9rem">${esc(d.org)}</div>
    <h1 class="big" style="margin-bottom:.8rem">${esc(d.kind.charAt(0).toUpperCase() + d.kind.slice(1))}</h1>
    <p class="mono muted" style="font-size:.78rem;margin-bottom:2rem;word-break:break-all">
      <a href="${esc(d.url)}" rel="nofollow noopener" target="_blank">${esc(d.url)}</a>
      ${d.status === 'blocked' ? ' <span class="tag warn">blocked</span>' : ''}</p>
    ${d.note ? `<p class="muted" style="font-size:.92rem;max-width:56ch">${esc(d.note)}</p>` : ''}

    ${d.changes.length ? `
      <h2 style="font-size:1.15rem;margin:2.2rem 0 .8rem">Changes</h2>
      <div class="feed">${[...d.changes].reverse().map((c) => `
        <a class="entry" href="/documents/${esc(d.id)}/${esc(c.short)}/">
          <span class="when">${esc(fmtDate(c.date))}</span>
          <span class="what">${c.added + c.removed} line${c.added + c.removed === 1 ? '' : 's'} changed
            <span class="who mono">${esc(c.prev)} → ${esc(c.short)}</span></span>
          <span class="delta">${delta(c.added, c.removed)}</span>
        </a>`).join('')}</div>`
      : `<p class="muted" style="margin-top:1.6rem">No change observed since this document entered
         the archive${d.first ? ` on ${esc(fmtDateLong(d.first.date))}` : ''}.</p>`}

    ${d.latest ? `
      <h2 style="font-size:1.15rem;margin:2.4rem 0 .8rem">Current text</h2>
      <p class="muted sans" style="font-size:.82rem;margin-bottom:.7rem">As archived
        ${esc(fmtDateLong(d.latest.date))} · <a href="/${esc(d.file)}">raw</a></p>
      <div class="snapshot">${esc(d.latest.content)}</div>` : ''}
  </section></div>`;

  write(`documents/${d.id}/index.html`, page({
    ...base, title: `${d.org} — ${d.kind} — saidwhen`,
    description: `Every archived version of ${d.org}'s ${d.kind}, with the diff between each one and the date it was observed.`,
    path: `/documents/${d.id}/`, nav: 'Documents',
  }, body));

  for (const c of d.changes) {
    const cbody = `<div class="wrap"><section class="pad">
      <p class="sans muted" style="font-size:.83rem;margin-bottom:1rem">
        <a href="/documents/${esc(d.id)}/">← ${esc(d.org)} — ${esc(d.kind)}</a></p>
      <div class="kicker" style="margin-bottom:.7rem">Observed ${esc(fmtDateLong(c.date))}</div>
      <h1 style="font-size:1.9rem;margin-bottom:.7rem">${c.added + c.removed} line${
        c.added + c.removed === 1 ? '' : 's'} changed</h1>
      <p class="mono muted" style="font-size:.76rem;margin-bottom:1.8rem">
        ${delta(c.added, c.removed)} &nbsp;·&nbsp; ${esc(c.prev)} → ${esc(c.short)}
        &nbsp;·&nbsp; <a href="https://github.com/richardwilkinson9/saidwhen/commit/${esc(c.sha)}"
          rel="noopener" target="_blank">commit</a>
        &nbsp;·&nbsp; <a href="${esc(d.url)}" rel="nofollow noopener" target="_blank">live page</a></p>
      <div class="diff">
        <div class="hd"><span>${esc(d.id)}.txt</span><span>${esc(fmtDate(c.date))}</span></div>
        ${renderDiff(c.rows)}
      </div>
      <p class="muted" style="font-size:.86rem;margin-top:1.2rem;max-width:56ch">Underlined words
      mark what moved within a rewritten line. Nothing here is interpreted — this is the
      difference between two captures, and the conclusion is yours.</p>
    </section></div>`;
    write(`documents/${d.id}/${c.short}/index.html`, page({
      ...base,
      title: `${d.org} ${d.kind} changed ${fmtDate(c.date)} — saidwhen`,
      description: `${c.added} lines added, ${c.removed} removed in ${d.org}'s ${d.kind} on ${fmtDate(c.date)}. The exact diff, with the source.`,
      path: `/documents/${d.id}/${c.short}/`, nav: 'Documents',
    }, cbody));
  }
}

// ---- about
{
  const body = `<div class="wrap"><section class="pad col">
    <div class="kicker" style="margin-bottom:.9rem">About</div>
    <h1 class="big" style="margin-bottom:1.2rem">How this works, and what it refuses to do</h1>

    <p>Every source listed in <a href="https://github.com/richardwilkinson9/saidwhen/blob/master/sources.json"><code>sources.json</code></a>
    is fetched once a day, with an identifying user agent, honouring <code>robots.txt</code>. The
    HTML is reduced to plain text before storage, because a diff has to be readable by a human and
    raw HTML diffs drown in changed build hashes and reordered attributes.</p>

    <p>Each capture is committed to git. That is the entire mechanism — no database, no API, no
    service to go down. The history of the repository <em>is</em> the archive:</p>

    <pre class="cmd">git clone https://github.com/richardwilkinson9/saidwhen
git log -p archive/anthropic/usage-policy.txt</pre>

    <h2 style="font-size:1.15rem;margin:2.4rem 0 .6rem">Three rules</h2>

    <p><strong>A failed fetch never overwrites a good snapshot.</strong> If a page errors, or comes
    back as a near-empty JavaScript shell, the previous capture stays and the failure is reported.
    Silently replacing a real policy with a block page is the one error this archive cannot
    afford.</p>

    <p><strong>A block is a refusal, and is treated as one.</strong> Some publishers return errors
    to non-browser clients. Those gaps are recorded rather than worked around by pretending to be
    a browser. An archive whose own conduct is questionable is worth less than no archive.</p>

    <p><strong>Nothing is interpreted.</strong> No summaries, no “what this means”, no view on
    whether a change is good or bad. The diff is the product; the conclusion is yours.</p>

    <h2 style="font-size:1.15rem;margin:2.4rem 0 .6rem">Why bother</h2>

    <p>How AI systems are governed, and how those rules quietly shift, will be argued about for a
    long time. The primary sources are being edited continuously and the previous versions are not
    kept anywhere. This is an attempt to keep them, starting now, because it cannot be done
    retroactively.</p>

    <h2 style="font-size:1.15rem;margin:2.4rem 0 .6rem">Corrections</h2>
    <p>If something here misrepresents a document, the publisher is right and this archive is
    wrong. <a href="https://github.com/richardwilkinson9/saidwhen/issues">Open an issue</a> and it
    will be corrected, with the correction itself visible in the history.</p>
  </section></div>`;
  write('about/index.html', page({
    ...base, title: 'About — saidwhen',
    description: 'How the archive is collected, and the three rules it holds to: never overwrite a good snapshot, treat a block as a refusal, and interpret nothing.',
    path: '/about/', nav: 'About',
  }, body));
}

// ---- machine-readable
{
  writeFileSync(new URL('_site/index.json', root), JSON.stringify({
    name: 'saidwhen',
    description: 'An archive of what AI companies said about their own systems, and when.',
    updated: lastRun,
    repository: 'https://github.com/richardwilkinson9/saidwhen',
    documents: docs.map((d) => ({
      id: d.id, org: d.org, kind: d.kind, url: d.url,
      status: d.status ?? 'ok',
      versions: d.versions.length,
      first_seen: d.first?.date ?? null,
      last_changed: d.changes.at(-1)?.date ?? null,
      changes: d.changes.map((c) => ({
        date: c.date, commit: c.sha, added: c.added, removed: c.removed,
        url: `https://saidwhen.org/documents/${d.id}/${c.short}/`,
      })),
    })),
  }, null, 2) + '\n');

  const items = allChanges.slice(0, 50).map((c) => `<item>
  <title>${esc(`${c.doc.org} — ${c.doc.kind} changed (+${c.added} −${c.removed})`)}</title>
  <link>https://saidwhen.org/documents/${esc(c.doc.id)}/${esc(c.short)}/</link>
  <guid isPermaLink="false">saidwhen-${esc(c.sha)}</guid>
  <pubDate>${new Date(c.date).toUTCString()}</pubDate>
  <description>${esc(`${c.added} lines added, ${c.removed} removed. Source: ${c.doc.url}`)}</description>
</item>`).join('\n');

  writeFileSync(new URL('_site/feed.xml', root), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>saidwhen — changes to AI policy documents</title>
<link>https://saidwhen.org/changes/</link>
<description>Every observed change to an archived AI policy, model card or terms document.</description>
<language>en</language>
${items}
</channel></rss>\n`);

  writeFileSync(new URL('_site/robots.txt', root),
    'User-agent: *\nAllow: /\n\nSitemap: https://saidwhen.org/sitemap.xml\n');

  const urls = [
    '/', '/changes/', '/documents/', '/about/',
    ...docs.map((d) => `/documents/${d.id}/`),
    ...allChanges.map((c) => `/documents/${c.doc.id}/${c.short}/`),
  ];
  writeFileSync(new URL('_site/sitemap.xml', root), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>https://saidwhen.org${u}</loc></url>`).join('\n')}
</urlset>\n`);
}

// The raw archive is served alongside the site, so every rendered page can link
// to the exact bytes it was generated from.
cpSync(new URL('archive/', root), new URL('_site/archive/', root), { recursive: true });
cpSync(new URL('sources.json', root), new URL('_site/sources.json', root));
if (existsSync(new URL('CNAME', root))) cpSync(new URL('CNAME', root), new URL('_site/CNAME', root));

console.log(
  `built ${docs.length} documents · ${totalVersions} versions · ${allChanges.length} changes\n` +
  `  ${urls_count()} pages into _site/`
);
function urls_count() {
  return 4 + docs.length + allChanges.length;
}
