import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { RARITY_COLORS, RARITY_LABEL, SITE_PATHS, type Rarity } from '@ego/content';
import { artUrl } from '@/lib/art';

export function PageHead({
  code,
  section,
  title,
  lede,
  aside,
}: {
  code: string;
  section: string;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="phead">
      <div>
        <div className="phead__code">
          <b>{code}</b> / {section}
        </div>
        <h1 className="phead__title">{title}</h1>
        {lede ? <p className="phead__lede">{lede}</p> : null}
      </div>
      {aside ? <div className="phead__aside">{aside}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  code,
  children,
  className,
  tone,
  style,
  id,
}: {
  title?: ReactNode;
  code?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'hot' | 'alert' | 'flat';
  style?: CSSProperties;
  id?: string;
}) {
  return (
    <section className={`panel${tone ? ` panel--${tone}` : ''}${className ? ` ${className}` : ''}`} style={style} id={id}>
      {title || code ? (
        <div className="panel__head">
          <h2 className="panel__title">{title}</h2>
          {code ? <span className="panel__code">{code}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Meter({ value, max, color, thick, label }: { value: number; max: number; color?: string; thick?: boolean; label?: string }) {
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      className={`meter${thick ? ' meter--thick' : ''}`}
      style={{ '--p': `${(p * 100).toFixed(2)}%`, ...(color ? { '--mc': color } : {}) } as CSSProperties}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <i />
    </div>
  );
}

/** Barra segmentada 1..n: base (branco), bônus (azul), acima do teto (hachurado). */
export function SegBar({ base, bonus = 0, cap, n = 10 }: { base: number; bonus?: number; cap: number; n?: number }) {
  return (
    <div className="segbar" style={{ '--n': n } as CSSProperties} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const v = i + 1;
        const cls = v <= base ? 'is-on' : v <= base + bonus ? 'is-bonus' : v > cap ? 'is-over' : '';
        return <span key={i} className={`seg ${cls}`} />;
      })}
    </div>
  );
}

export function Tag({ children, color, solid, dot }: { children: ReactNode; color?: string; solid?: boolean; dot?: boolean }) {
  return (
    <span className={`tag${solid ? ' tag--solid' : ''}${dot ? ' tag--dot' : ''}`} style={color ? ({ '--tc': color } as CSSProperties) : undefined}>
      {children}
    </span>
  );
}

export function RarityTag({ rarity, solid }: { rarity: Rarity; solid?: boolean }) {
  return (
    <Tag color={RARITY_COLORS[rarity]} solid={solid} dot={!solid}>
      {RARITY_LABEL[rarity]}
    </Tag>
  );
}

export function SkillIcon({ lineageId, skillId, size = 48, alt = '' }: { lineageId: string; skillId: string; size?: number; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="skicon" src={artUrl.skill(lineageId, skillId)} alt={alt} width={size} height={size} loading="lazy" style={{ '--s': `${size}px` } as CSSProperties} />;
}

export function LineagePortrait({ lineageId, size = 96, alt = '' }: { lineageId: string; size?: number; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={artUrl.lineage(lineageId)} alt={alt} width={size} height={size} loading="lazy" style={{ width: size, height: size }} />;
}

export function Rule({ children, code }: { children: ReactNode; code?: string }) {
  return (
    <div className="rule">
      {code ? <b>{code}</b> : null}
      {children}
    </div>
  );
}

export function Empty({ code, title, children, action }: { code: string; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__code">{code}</span>
      <h2>{title}</h2>
      {children ? <div className="ink-2">{children}</div> : null}
      {action}
    </div>
  );
}

export function NoCharacter() {
  return (
    <Empty code="Registro não encontrado" title="Você ainda não entrou na instalação">
      <p>
        Nenhum personagem ligado a esta conta do Discord. Use <span className="kbd">/criar-personagem</span> no servidor e volte aqui.
      </p>
      <p style={{ marginTop: 8 }}>
        Enquanto isso, a <Link href={SITE_PATHS.guias}>central de guias</Link> explica tudo.
      </p>
    </Empty>
  );
}

export function NoLineage() {
  return (
    <Empty
      code="Sem linhagem"
      title="Avaliação pendente"
      action={
        <Link href={SITE_PATHS.giro} className="btn btn--primary">
          Fazer o giro gratuito
        </Link>
      }
    >
      <p>Sem linhagem não há árvore nem habilidades, e o teto de todos os atributos fica baixo. O primeiro giro é grátis e já é aceito direto.</p>
    </Empty>
  );
}

export function Sheet({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="sheet">
      {rows.map(([k, v], i) => (
        <Row key={i} k={k} v={v} />
      ))}
    </dl>
  );
}
function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

export function Stat({ label, value, unit, sub }: { label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span>
        <span className="stat__v">{value}</span>
        {unit ? <span className="stat__u">{unit}</span> : null}
      </span>
      {sub ? <span className="muted" style={{ fontSize: 13 }}>{sub}</span> : null}
    </div>
  );
}
