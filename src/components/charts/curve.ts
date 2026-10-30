/** Monotone cubic path (same curve family as d3 curveMonotoneX). Points must be x-ascending. */
export function monotonePath(pts: ReadonlyArray<readonly [number, number]>): string {
  const p = pts.filter((q, i) => i === 0 || q[0] > (pts[i - 1]?.[0] ?? -Infinity));
  const n = p.length;
  const first = p[0];
  if (!first) return "";
  if (n < 2) return `M${first[0]},${first[1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = p[i]!;
    const b = p[i + 1]!;
    dx.push(b[0] - a[0]);
    m.push((b[1] - a[1]) / (b[0] - a[0]));
  }
  const t: number[] = new Array(n).fill(0);
  t[0] = m[0]!;
  t[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  let d = `M${first[0]},${first[1]}`;
  for (let i = 0; i < n - 1; i++) {
    const a = p[i]!;
    const b = p[i + 1]!;
    const h = dx[i]! / 3;
    d += `C${a[0] + h},${a[1] + t[i]! * h},${b[0] - h},${b[1] - t[i + 1]! * h},${b[0]},${b[1]}`;
  }
  return d;
}
