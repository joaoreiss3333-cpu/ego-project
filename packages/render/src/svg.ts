/**
 * Arte vetorial original do projeto. Tudo gerado por código, sem imagens da obra.
 * Usado pelo site (inline) e rasterizado para PNG pelo bot quando precisa.
 * Este arquivo não depende de canvas: pode ser importado no navegador.
 */
import { COLORS, GAME, RARITY_COLORS, findLineage, findSkill, getLineage, type Rarity } from '@ego/content';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function initials(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-Z]/.test(w));
  const letters = (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
  return letters;
}

export function rarityColor(r: Rarity): string {
  return RARITY_COLORS[r];
}

/** Retângulo com cantos cortados em diagonal (linguagem visual da instalação). */
export function cutRectPath(x: number, y: number, w: number, h: number, c: number): string {
  return `M${x + c},${y} H${x + w} V${y + h - c} L${x + w - c},${y + h} H${x} V${y + c} Z`;
}

/**
 * Logo: marca de "célula de avaliação" (grade 3x3 com uma célula acesa,
 * deslocada da diagonal) + wordmark. Original, sem referência a logos existentes.
 */
export function logoSvg(opts: { height?: number; mono?: boolean; withWordmark?: boolean } = {}): string {
  const h = opts.height ?? 64;
  const blue = opts.mono ? '#FFFFFF' : COLORS.electric;
  const white = '#FFFFFF';
  const words = GAME.name.split(' ');
  const main = words[0] ?? GAME.name;
  const rest = words.slice(1).join(' ');
  const mark = `
    <g>
      <path d="${cutRectPath(0, 0, 64, 64, 10)}" fill="none" stroke="${white}" stroke-width="3"/>
      ${[0, 1, 2]
        .map((i) =>
          [0, 1, 2]
            .map((j) => {
              const lit = i === 2 && j === 0;
              return `<rect x="${9 + i * 16}" y="${9 + j * 16}" width="12" height="12" fill="${lit ? blue : 'none'}" stroke="${lit ? blue : white}" stroke-opacity="${lit ? 1 : 0.35}" stroke-width="2"/>`;
            })
            .join(''),
        )
        .join('')}
      <path d="M6 58 L58 6" stroke="${blue}" stroke-width="3"/>
    </g>`;
  if (opts.withWordmark === false) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" height="${h}" width="${h}">${mark}</svg>`;
  const width = 64 + 16 + main.length * 30 + 20 + rest.length * 13;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 64" height="${h}" width="${(width * h) / 64}">
    ${mark}
    <text x="80" y="50" font-family="Anton, 'Barlow Condensed', Impact, sans-serif" font-size="54" fill="${white}" letter-spacing="1">${esc(main)}</text>
    <text x="${84 + main.length * 30}" y="50" font-family="'IBM Plex Mono', monospace" font-size="18" font-weight="600" fill="${blue}" letter-spacing="4">${esc(rest)}</text>
    <rect x="${84 + main.length * 30}" y="14" width="${rest.length * 13}" height="3" fill="${blue}"/>
  </svg>`;
}

/** Ícone provisório de habilidade: iniciais + cor da raridade. */
export function skillIconSvg(skillId: string, size = 128): string {
  const sk = findSkill(skillId);
  const lineage = sk ? findLineage(sk.lineageId) : undefined;
  const color = lineage ? RARITY_COLORS[lineage.rarity] : COLORS.muted;
  const label = sk ? initials(sk.name) : '??';
  const flow = sk?.kind === 'flow';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">
    <path d="${cutRectPath(4, 4, 120, 120, 22)}" fill="${COLORS.panel}" stroke="${color}" stroke-width="5"/>
    <path d="${cutRectPath(14, 14, 100, 100, 16)}" fill="none" stroke="${color}" stroke-opacity="0.25" stroke-width="2"/>
    ${flow ? `<path d="M14 100 L100 14" stroke="${color}" stroke-opacity="0.35" stroke-width="10"/>` : ''}
    <text x="64" y="80" text-anchor="middle" font-family="Anton, 'Barlow Condensed', Impact, sans-serif" font-size="48" fill="#FFFFFF">${esc(label)}</text>
    <rect x="26" y="98" width="${flow ? 76 : 40}" height="5" fill="${color}"/>
  </svg>`;
}

/** Busto genérico (silhueta original) usado em retratos provisórios. */
function bust(color: string, accent: string): string {
  return `
    <path d="M64 30 C80 30 88 44 86 58 C85 68 78 76 70 79 L70 86 C92 90 108 102 112 128 L16 128 C20 102 36 90 58 86 L58 79 C50 76 43 68 42 58 C40 44 48 30 64 30 Z" fill="${color}"/>
    <path d="M44 50 C46 36 56 28 66 28 C80 28 90 38 88 52 C82 44 70 42 60 46 C54 48 48 50 44 50 Z" fill="${accent}" fill-opacity="0.85"/>`;
}

/** Retrato provisório de linhagem: silhueta, anel de raridade e iniciais. */
export function lineagePortraitSvg(lineageId: string, size = 256): string {
  const l = findLineage(lineageId);
  const color = l ? RARITY_COLORS[l.rarity] : COLORS.muted;
  const name = l?.name ?? lineageId;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">
    <defs><clipPath id="c-${esc(lineageId)}"><path d="${cutRectPath(2, 2, 124, 124, 20)}"/></clipPath></defs>
    <g clip-path="url(#c-${esc(lineageId)})">
      <rect width="128" height="128" fill="${COLORS.background}"/>
      ${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 16} 0 V128 M0 ${i * 16} H128" stroke="${COLORS.line}" stroke-width="1"/>`).join('')}
      <path d="M-10 128 L128 -10 L128 20 L20 128 Z" fill="${color}" fill-opacity="0.18"/>
      ${bust('#10192A', color)}
      <text x="10" y="24" font-family="'IBM Plex Mono', monospace" font-size="10" font-weight="600" fill="${color}" letter-spacing="1">${esc(name.toUpperCase())}</text>
      <text x="116" y="118" text-anchor="end" font-family="Anton, Impact, sans-serif" font-size="30" fill="#FFFFFF" fill-opacity="0.9">${esc(initials(name))}</text>
    </g>
    <path d="${cutRectPath(2, 2, 124, 124, 20)}" fill="none" stroke="${color}" stroke-width="4"/>
  </svg>`;
}

/** Retrato padrão do jogador: silhueta original na cor do token, com o número. */
export function playerSilhouetteSvg(color: string, number?: number, size = 256): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">
    <rect width="128" height="128" fill="${COLORS.background}"/>
    ${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 16} 0 V128 M0 ${i * 16} H128" stroke="${COLORS.line}" stroke-width="1"/>`).join('')}
    <circle cx="64" cy="70" r="54" fill="${color}" fill-opacity="0.12"/>
    ${bust('#0B1220', color)}
    ${number !== undefined ? `<text x="64" y="120" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="26" fill="${color}">${number}</text>` : ''}
  </svg>`;
}

/** Moldura (para token e card). `frameId`: moldura_<raridade> ou moldura_grade. */
export function frameSvg(frameId: string, w = 400, h = 560): string {
  const rarity = frameId.replace('moldura_', '') as Rarity;
  const isGrade = frameId === 'moldura_grade';
  const color = isGrade ? COLORS.electric : (RARITY_COLORS[rarity] ?? COLORS.muted);
  const c = Math.round(Math.min(w, h) * 0.08);
  const grid = isGrade
    ? Array.from({ length: Math.ceil(w / 20) }, (_, i) => `<path d="M${i * 20} 0 V${h}" stroke="${color}" stroke-opacity="0.12"/>`).join('') +
      Array.from({ length: Math.ceil(h / 20) }, (_, i) => `<path d="M0 ${i * 20} H${w}" stroke="${color}" stroke-opacity="0.12"/>`).join('')
    : '';
  const ticks = Array.from({ length: 8 }, (_, i) => `<rect x="${c + 6 + i * 10}" y="4" width="6" height="3" fill="${color}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <defs><mask id="m"><rect width="${w}" height="${h}" fill="#fff"/><path d="${cutRectPath(12, 12, w - 24, h - 24, c)}" fill="#000"/></mask></defs>
    <g mask="url(#m)">${grid}<path d="${cutRectPath(0, 0, w, h, c + 6)}" fill="${color}" fill-opacity="${isGrade ? 0.25 : 0.12}"/></g>
    <path d="${cutRectPath(2, 2, w - 4, h - 4, c + 4)}" fill="none" stroke="${color}" stroke-width="4"/>
    <path d="${cutRectPath(12, 12, w - 24, h - 24, c)}" fill="none" stroke="${color}" stroke-opacity="0.6" stroke-width="2"/>
    ${ticks}
    <rect x="${w - 60}" y="${h - 7}" width="40" height="3" fill="${color}"/>
  </svg>`;
}

/** Placa do título (ex.: "Egoísta"). */
export function titlePlateSvg(text: string, w = 220, h = 44): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <path d="${cutRectPath(1, 1, w - 2, h - 2, 12)}" fill="${COLORS.alert}" fill-opacity="0.12" stroke="${COLORS.alert}" stroke-width="2"/>
    <rect x="10" y="${h / 2 - 3}" width="6" height="6" fill="${COLORS.alert}"/>
    <text x="26" y="${h / 2 + 8}" font-family="Anton, Impact, sans-serif" font-size="22" fill="#FFFFFF" letter-spacing="2">${esc(text.toUpperCase())}</text>
  </svg>`;
}

/** Token de jogador para diagramas (guias, replay). */
export function tokenSvg(opts: { color: string; number?: number | string; rarity?: Rarity | null; ball?: boolean; size?: number; keeper?: boolean }): string {
  const s = opts.size ?? 48;
  const ring = opts.rarity ? RARITY_COLORS[opts.rarity] : '#FFFFFF';
  const dark = isLight(opts.color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${s}" height="${s}">
    <circle cx="24" cy="24" r="21" fill="none" stroke="${ring}" stroke-width="3"/>
    <circle cx="24" cy="24" r="16" fill="${opts.color}"/>
    ${opts.keeper ? `<rect x="14" y="14" width="20" height="20" fill="none" stroke="${dark ? '#000' : '#fff'}" stroke-opacity="0.4"/>` : ''}
    ${opts.number !== undefined ? `<text x="24" y="30" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="16" fill="${dark ? '#070B12' : '#FFFFFF'}">${esc(String(opts.number))}</text>` : ''}
    ${opts.ball ? `<circle cx="38" cy="38" r="6" fill="#FFFFFF" stroke="#070B12" stroke-width="2"/>` : ''}
  </svg>`;
}

export function isLight(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

/** Efeito "Faísca Azul" (rastro do chute) para prévia. */
export function sparkTrailSvg(w = 240, h = 60): string {
  const pts = Array.from({ length: 9 }, (_, i) => `${20 + i * 25},${h / 2 + (i % 2 ? -8 : 8)}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <polyline points="${pts}" fill="none" stroke="${COLORS.electricBright}" stroke-width="3" stroke-linejoin="bevel"/>
    <polyline points="${pts}" fill="none" stroke="#FFFFFF" stroke-width="1"/>
    ${Array.from({ length: 6 }, (_, i) => `<rect x="${30 + i * 36}" y="${h / 2 - 14 + (i % 3) * 10}" width="4" height="4" fill="#FFFFFF" transform="rotate(45 ${32 + i * 36} ${h / 2 - 12 + (i % 3) * 10})"/>`).join('')}
  </svg>`;
}

export function lineageColor(lineageId: string): string {
  return RARITY_COLORS[getLineage(lineageId).rarity];
}
