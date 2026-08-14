/**
 * The look.
 *
 * This is an archive, not an app, so it is built to read like a document of
 * record: one serif column for prose, monospace for anything a machine
 * produced, and rules instead of boxes.
 *
 * The one deliberate idea: **the only colour on the site is what changed.**
 * Additions green, removals red, everything else ink on paper. On a site whose
 * entire purpose is showing what moved, colour is information, so spending it
 * anywhere else would be a lie about where to look.
 */

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{
  --paper:#FBFAF7; --raised:#FFFFFF; --ink:#16150F; --soft:#3D3A32; --muted:#6E6A5E;
  --rule:#DEDACE; --rule-soft:#EBE7DC;
  --add:#1B6B45; --add-bg:#E8F3EC; --del:#9E2B1E; --del-bg:#FAEBE8;
  --serif:'Spectral',Georgia,'Times New Roman',serif;
  --sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){
  :root{
    --paper:#12120F; --raised:#191814; --ink:#EDEBE3; --soft:#C3BFB3; --muted:#8B8678;
    --rule:#2C2A24; --rule-soft:#232119;
    --add:#5FCB92; --add-bg:#122B1F; --del:#F08573; --del-bg:#2E1815;
  }
}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--serif);
  font-size:17px;line-height:1.62;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
p{margin:0 0 1em}
h1,h2,h3{margin:0;font-weight:600;letter-spacing:-.012em;line-height:1.22}
.wrap{max-width:74rem;margin:0 auto;padding:0 1.75rem}
.col{max-width:42rem}
.mono{font-family:var(--mono);font-variant-ligatures:none}
.sans{font-family:var(--sans)}
.muted{color:var(--muted)}

header.site{border-bottom:1px solid var(--rule);position:sticky;top:0;z-index:10;
  background:color-mix(in srgb,var(--paper) 92%,transparent);backdrop-filter:blur(10px)}
.bar{display:flex;align-items:baseline;gap:1.6rem;height:3.6rem}
.mark{font-family:var(--sans);font-weight:600;font-size:1rem;letter-spacing:-.02em}
.mark span{color:var(--muted);font-weight:400}
nav{display:flex;gap:1.1rem;font-family:var(--sans);font-size:.83rem;flex:1}
nav a{color:var(--muted);padding:.15rem 0;border-bottom:1.5px solid transparent}
nav a:hover{color:var(--ink)}
nav a.on{color:var(--ink);border-bottom-color:var(--ink)}
.pulse{font-family:var(--mono);font-size:.68rem;color:var(--muted);letter-spacing:.04em;
  text-transform:uppercase;white-space:nowrap}

.lede{font-size:1.32rem;line-height:1.45;letter-spacing:-.011em;max-width:32ch}
.kicker{font-family:var(--mono);font-size:.68rem;letter-spacing:.13em;text-transform:uppercase;
  color:var(--muted)}
h1.big{font-size:2.6rem}
@media(max-width:640px){h1.big{font-size:1.9rem}.lede{font-size:1.12rem}}

.rule{border:0;border-top:1px solid var(--rule);margin:0}
.pad{padding:3.4rem 0}
.pad-s{padding:2rem 0}

.band{border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);
  background:var(--raised)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:3.4rem;padding:2.2rem 0}
.grid h2{font-size:1.02rem;margin-bottom:.45rem}
.grid p{margin:0;font-size:.95rem;color:var(--muted);max-width:44ch}
@media(max-width:720px){.grid{grid-template-columns:1fr;gap:1.6rem}}

.feed{border-top:1px solid var(--ink)}
.entry{display:grid;grid-template-columns:7.5rem 1fr auto;gap:1.4rem;align-items:baseline;
  padding:.95rem 0;border-bottom:1px solid var(--rule-soft)}
.entry:hover{background:var(--raised)}
.entry .when{font-family:var(--mono);font-size:.72rem;color:var(--muted);white-space:nowrap}
.entry .what{font-size:1rem;line-height:1.42}
.entry .who{font-family:var(--sans);font-size:.76rem;color:var(--muted);display:block;margin-top:.15rem}
.entry .delta{font-family:var(--mono);font-size:.74rem;white-space:nowrap}
@media(max-width:640px){
  .entry{grid-template-columns:1fr;gap:.3rem}
  .entry .delta{justify-self:start}
}
.plus{color:var(--add)}
.minus{color:var(--del)}

.docs{border-top:1px solid var(--ink)}
.doc{display:grid;grid-template-columns:1fr 6rem 7rem;gap:1.2rem;align-items:baseline;
  padding:1rem 0;border-bottom:1px solid var(--rule-soft)}
.doc:hover{background:var(--raised)}
.doc .t{font-size:1.06rem}
.doc .u{font-family:var(--mono);font-size:.7rem;color:var(--muted);display:block;
  margin-top:.2rem;word-break:break-all}
.doc .n{font-family:var(--mono);font-size:.78rem;color:var(--muted);text-align:right}
@media(max-width:640px){.doc{grid-template-columns:1fr}.doc .n{text-align:left}}

.diff{border:1px solid var(--rule);border-radius:2px;overflow:hidden;background:var(--raised)}
.diff .hd{display:flex;justify-content:space-between;gap:1rem;align-items:baseline;
  padding:.7rem 1rem;border-bottom:1px solid var(--rule);font-family:var(--mono);
  font-size:.72rem;color:var(--muted)}
.diff pre{margin:0;overflow-x:auto;font-family:var(--mono);font-size:.79rem;line-height:1.72}
.diff .row{display:block;padding:.05rem 1rem .05rem 2.1rem;position:relative;white-space:pre-wrap;
  word-break:break-word}
.diff .row::before{position:absolute;left:.85rem;color:var(--muted);opacity:.65}
.diff .add{background:var(--add-bg);color:var(--add)}
.diff .add::before{content:'+';color:var(--add)}
.diff .del{background:var(--del-bg);color:var(--del)}
.diff .del::before{content:'\\2212';color:var(--del)}
.diff .same{color:var(--soft)}
.diff .gap{color:var(--muted);font-style:italic;background:var(--paper);
  border-top:1px solid var(--rule-soft);border-bottom:1px solid var(--rule-soft);
  padding-top:.2rem;padding-bottom:.2rem;opacity:.8}
.diff .gap::before{content:'\\22EF'}
mark.w{background:transparent;font-weight:600;text-decoration:underline;
  text-decoration-thickness:2px;text-underline-offset:2px;color:inherit}

.snapshot{white-space:pre-wrap;word-break:break-word;font-family:var(--mono);font-size:.78rem;
  line-height:1.7;color:var(--soft);background:var(--raised);border:1px solid var(--rule);
  padding:1.2rem;border-radius:2px;max-height:34rem;overflow-y:auto}

.tag{font-family:var(--mono);font-size:.65rem;letter-spacing:.07em;text-transform:uppercase;
  border:1px solid var(--rule);color:var(--muted);padding:.12rem .38rem;border-radius:2px;
  white-space:nowrap}
.tag.warn{color:var(--del);border-color:color-mix(in srgb,var(--del) 40%,transparent)}

.btn{display:inline-block;font-family:var(--sans);font-size:.83rem;border:1px solid var(--ink);
  padding:.5rem .9rem;border-radius:2px}
.btn:hover{background:var(--ink);color:var(--paper)}

input[type=search]{width:100%;font-family:var(--sans);font-size:.95rem;padding:.7rem .9rem;
  border:1px solid var(--rule);border-radius:2px;background:var(--raised);color:var(--ink)}
input[type=search]:focus{outline:0;border-color:var(--ink)}

code{font-family:var(--mono);font-size:.86em;background:var(--raised);border:1px solid var(--rule);
  padding:.08em .3em;border-radius:2px}
pre.cmd{font-family:var(--mono);font-size:.78rem;background:var(--raised);
  border:1px solid var(--rule);border-radius:2px;padding:.9rem 1.1rem;overflow-x:auto}

footer.site{border-top:1px solid var(--rule);margin-top:4rem;padding:2.4rem 0 4rem;
  font-family:var(--sans);font-size:.8rem;color:var(--muted)}
footer.site a{border-bottom:1px solid var(--rule)}
footer.site a:hover{color:var(--ink)}
.fnote{max-width:56ch;line-height:1.6;margin-top:1rem}
`;

const NAV = [
  ['/', 'Overview'],
  ['/changes/', 'Changes'],
  ['/documents/', 'Documents'],
  ['/about/', 'About'],
];

export function page({ title, description, path, nav, checked, head = '' }, body) {
  const canonical = `https://saidwhen.org${path}`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="saidwhen">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<link rel="alternate" type="application/rss+xml" title="saidwhen changes" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23FBFAF7'/%3E%3Crect x='6' y='9' width='20' height='2' fill='%2316150F'/%3E%3Crect x='6' y='15' width='20' height='2' fill='%231B6B45'/%3E%3Crect x='6' y='21' width='13' height='2' fill='%239E2B1E'/%3E%3C/svg%3E">
<style>${CSS}</style>${head}
</head><body>
<header class="site"><div class="wrap"><div class="bar">
  <a class="mark" href="/">said<span>when</span></a>
  <nav>${NAV.map(([h, l]) =>
    `<a href="${h}"${nav === l ? ' class="on"' : ''}>${l}</a>`).join('')}</nav>
  ${checked ? `<span class="pulse">last checked ${esc(checked)}</span>` : ''}
</div></div></header>
<main>${body}</main>
<footer class="site"><div class="wrap">
  <a href="https://github.com/richardwilkinson9/saidwhen">Source and raw archive on GitHub</a>
  &nbsp;·&nbsp; <a href="/feed.xml">RSS</a>
  &nbsp;·&nbsp; <a href="/index.json">JSON</a>
  <p class="fnote">Archived documents remain the copyright of their publishers, reproduced here
  as a factual record of what was published and when, with the source URL on every file.
  Nothing on this site is interpreted or summarised — the diff is the record. Not affiliated
  with any company named here.</p>
</div></footer>
</body></html>`;
}
