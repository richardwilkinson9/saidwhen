/**
 * A line diff, in about sixty lines and no dependencies.
 *
 * Standard LCS via dynamic programming. The documents here are policy pages —
 * thousands of lines at most — so the quadratic table is nothing, and the
 * clarity is worth more than the speed a Myers implementation would buy.
 */

/** @returns {Array<{type:'same'|'add'|'del', line:string}>} */
export function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');

  // Trim the common head and tail first. Policy pages usually change in one
  // clause, so this collapses almost the entire table before it is built.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail++;

  const aMid = a.slice(head, a.length - tail);
  const bMid = b.slice(head, b.length - tail);

  const m = aMid.length;
  const n = bMid.length;
  const lcs = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] =
        aMid[i] === bMid[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out = [];
  for (let k = 0; k < head; k++) out.push({ type: 'same', line: a[k] });

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (aMid[i] === bMid[j]) {
      out.push({ type: 'same', line: aMid[i] });
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: 'del', line: aMid[i++] });
    } else {
      out.push({ type: 'add', line: bMid[j++] });
    }
  }
  while (i < m) out.push({ type: 'del', line: aMid[i++] });
  while (j < n) out.push({ type: 'add', line: bMid[j++] });

  for (let k = a.length - tail; k < a.length; k++) out.push({ type: 'same', line: a[k] });

  return out;
}

/**
 * Collapse unchanged runs to a few lines of context. A policy diff is one
 * altered clause inside twenty pages of identical text; showing all of it
 * hides the very thing the reader came for.
 */
export function hunks(rows, context = 3) {
  const keep = new Set();
  rows.forEach((r, idx) => {
    if (r.type === 'same') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k++) {
      keep.add(k);
    }
  });

  const out = [];
  let skipped = 0;
  rows.forEach((r, idx) => {
    if (keep.has(idx)) {
      if (skipped) {
        out.push({ type: 'gap', line: `${skipped} unchanged line${skipped === 1 ? '' : 's'}` });
        skipped = 0;
      }
      out.push(r);
    } else {
      skipped++;
    }
  });
  if (skipped) out.push({ type: 'gap', line: `${skipped} unchanged line${skipped === 1 ? '' : 's'}` });
  return out;
}

export function countChanges(rows) {
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    if (r.type === 'add') added++;
    else if (r.type === 'del') removed++;
  }
  return { added, removed };
}

/**
 * Word-level highlighting inside a changed line pair. Reading "we may" become
 * "we will" is the difference between seeing a change and understanding it.
 */
export function wordDiff(before, after) {
  const split = (s) => s.split(/(\s+)/);
  const a = split(before);
  const b = split(after);

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail++;

  return {
    prefix: a.slice(0, head).join(''),
    removed: a.slice(head, a.length - tail).join(''),
    added: b.slice(head, b.length - tail).join(''),
    suffix: a.slice(a.length - tail).join(''),
  };
}
