import { RANKS, type RankDefinition } from '../data/progression';

/** Ring and star colours per rank tier: bronze, silver, gold, then platinum. */
const TIERS = [
  { ring: '#d08a4f', ringHi: '#f2c194', star: '#f2c194' },
  { ring: '#b9c6d6', ringHi: '#eef4fb', star: '#eef4fb' },
  { ring: '#f5b83d', ringHi: '#ffe7a3', star: '#ffd34d' },
  { ring: '#7fd8e8', ringHi: '#e6fbff', star: '#bdf3ff' },
];
/** Ranks per tier: each tier starts with no stars and gains one per rank. */
const RANKS_PER_TIER = 3;

let uid = 0;

function star(cx: number, cy: number, r: number, fill: string): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>`;
}

function laurel(color: string): string {
  const leaves: string[] = [];
  // Leaves along the lower-left and lower-right of a circle around the planet (90° = straight down).
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const deg = 90 - side * (28 + i * 20);
      const a = (deg * Math.PI) / 180;
      const x = 24 + Math.cos(a) * 21;
      const y = 28 + Math.sin(a) * 19;
      const rot = deg;
      leaves.push(`<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="1.4" ry="3" transform="rotate(${rot.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})" fill="${color}"/>`);
    }
  }
  return `<g opacity=".95">${leaves.join('')}</g>`;
}

/**
 * The player's rank emblem: ringed Mars whose ring turns bronze → silver → gold →
 * platinum every three ranks, gaining a star per rank inside a tier (and a laurel
 * at the top rank).
 */
export function rankBadgeSvg(rank: RankDefinition): string {
  const top = rank.level >= RANKS.length;
  const step = rank.level - 1;
  const t = TIERS[Math.min(Math.floor(step / RANKS_PER_TIER), TIERS.length - 1)];
  const id = `rb${++uid}`;
  const stars = top ? 3 : step % RANKS_PER_TIER;
  const starXs = stars === 1 ? [24] : stars === 2 ? [19, 29] : stars === 3 ? [15, 24, 33] : [];
  const starSvg = starXs.map((x, i) => star(x, stars === 3 && i !== 1 ? 7 : 5.5, 3.6, t.star)).join('');
  const ring = `stroke="url(#${id}r)" stroke-width="2.4" fill="none" stroke-linecap="round"`;
  return `<svg viewBox="0 0 48 48" aria-hidden="true" class="rank-badge-svg">
<defs>
  <radialGradient id="${id}p" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffb37a"/><stop offset=".45" stop-color="#d4612f"/><stop offset="1" stop-color="#7b2a12"/></radialGradient>
  <linearGradient id="${id}r" x1="0" x2="1"><stop offset="0" stop-color="${t.ring}"/><stop offset=".5" stop-color="${t.ringHi}"/><stop offset="1" stop-color="${t.ring}"/></linearGradient>
</defs>
${top ? laurel(t.ring) : ''}
<g transform="rotate(-20 24 28)"><path d="M4 28 A20 6 0 0 1 44 28" ${ring} opacity=".8"/></g>
<circle cx="24" cy="28" r="12" fill="url(#${id}p)"/>
<circle cx="20" cy="25" r="2.2" fill="#9c3a18" opacity=".55"/><circle cx="28" cy="32" r="1.6" fill="#9c3a18" opacity=".5"/>
<g transform="rotate(-20 24 28)"><path d="M4 28 A20 6 0 0 0 44 28" ${ring}/></g>
${starSvg}
</svg>`;
}
