import type { CSSProperties } from 'react';
import {
  ATTRS,
  ATTR_SHORT,
  FOOT_LABEL,
  POSITION_LABEL,
  RARITY_COLORS,
  RARITY_LABEL,
  COLORS,
  findCosmetic,
  type Attrs,
  type Foot,
  type LineageDef,
  type Position,
} from '@ego/content';
import { frameSvg, titlePlateSvg } from '@ego/render/svg';
import type { Character } from '@ego/db';
import { artUrl, svgUri } from '@/lib/art';
import { CountUp } from './CountUp';

export interface CardRank {
  position: number | null;
  group: 'Solo' | 'Time';
  total: number;
}

/** Card do jogador: HTML + SVG, com moldura equipada, retrato, ranking enorme e atributos. */
export function ProfileCard({
  c,
  lineage,
  base,
  effective,
  caps,
  rank,
}: {
  c: Character;
  lineage: LineageDef | null;
  base: Attrs;
  effective: Attrs;
  caps: Attrs;
  rank: CardRank;
}) {
  const color = lineage ? RARITY_COLORS[lineage.rarity] : COLORS.muted;
  const frame = findCosmetic(c.frameId);
  const title = findCosmetic(c.titleId);
  return (
    <article className="pcard" style={{ '--rc': color } as CSSProperties} aria-label={`Card de ${c.name}`}>
      <div className="pcard__bg" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="pcard__portrait" src={artUrl.portrait(c.id, c.updatedAt)} alt={`Retrato de ${c.name}`} />
      <div className="pcard__shade" aria-hidden />
      <div className="pcard__rank">
        <span className="pcard__rank-l">Rank {rank.group}</span>
        <span className="pcard__rank-v">{rank.position ? <CountUp value={rank.position} from={Math.max(rank.total, rank.position + 40)} prefix="#" duration={1100} /> : '#—'}</span>
      </div>
      <div className="pcard__num" aria-label={`Camisa ${c.number}`}>
        {c.number}
      </div>
      <div className="pcard__lower">
      <div className="pcard__id">
        {title ? <div className="pcard__title" dangerouslySetInnerHTML={{ __html: titlePlateSvg(title.name, 220, 40) }} /> : null}
        <h2 className="pcard__name">{c.name}</h2>
        <div className="pcard__meta">
          <span>{POSITION_LABEL[c.position as Position] ?? c.position}</span>
          <span>Pé {(FOOT_LABEL[c.foot as Foot] ?? c.foot).toLowerCase()}</span>
          <span>NV {c.level}</span>
        </div>
        <div className="pcard__lin">
          {lineage ? (
            <>
              <b>{lineage.name}</b>
              <span className="tag tag--solid" style={{ '--tc': color } as CSSProperties}>
                {RARITY_LABEL[lineage.rarity]}
              </span>
            </>
          ) : (
            <span className="muted">Sem linhagem</span>
          )}
        </div>
      </div>
      <div className="pcard__attrs">
        {ATTRS.map((k) => {
          const bonus = effective[k] - base[k];
          return (
            <div key={k} className="pcard__attr">
              <span className="pcard__ak">{ATTR_SHORT[k]}</span>
              <span className="pcard__abar" aria-hidden>
                <i style={{ width: `${(base[k] / 11) * 100}%` }} />
                {bonus > 0 ? <i className="is-bonus" style={{ left: `${(base[k] / 11) * 100}%`, width: `${(bonus / 11) * 100}%` }} /> : null}
                <em style={{ left: `${(caps[k] / 11) * 100}%` }} />
              </span>
              <span className="pcard__av">{effective[k]}</span>
            </div>
          );
        })}
      </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {frame ? <img className="pcard__frame" src={svgUri(frameSvg(frame.id, 400, 600))} alt="" aria-hidden /> : <div className="pcard__frame pcard__frame--plain" aria-hidden />}
    </article>
  );
}
