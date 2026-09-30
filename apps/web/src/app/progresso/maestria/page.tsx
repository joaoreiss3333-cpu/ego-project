import type { Metadata } from 'next';
import { LINEAGES, MASTERY, RARITY_COLORS, SITE_PATHS, masteryLevel } from '@ego/content';
import { prisma } from '@ego/db';
import { Meter, NoCharacter, NoLineage, PageHead, RarityTag, SkillIcon } from '@/components/ui';
import { fmt } from '@/lib/format';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Maestria' };

export default async function MaestriaPage() {
  const v = await requireViewer(SITE_PATHS.maestria);
  if (!v.character) return <NoCharacter />;
  const c = v.character;
  const [owned, rows] = await Promise.all([
    prisma.lineageProgress.findMany({ where: { characterId: c.id }, orderBy: { obtainedAt: 'asc' }, select: { lineageId: true } }),
    prisma.skillMastery.findMany({ where: { characterId: c.id } }),
  ]);
  const uses = new Map(rows.map((r) => [r.skillId, r.uses]));
  const lineages = owned.map((o) => LINEAGES.find((l) => l.id === o.lineageId)).filter((l): l is (typeof LINEAGES)[number] => !!l);
  const maxLevel = MASTERY.thresholds.length;
  const total = lineages.reduce((a, l) => a + l.skills.length, 0);
  const atMax = lineages.reduce((a, l) => a + l.skills.filter((s) => masteryLevel(uses.get(s.id) ?? 0) >= maxLevel).length, 0);

  return (
    <>
      <PageHead
        code="04.3"
        section="Progresso"
        title="Maestria"
        lede={`Cada uso bem-sucedido conta. Cada nível tira ${MASTERY.staminaReductionPerLevel} de fôlego da habilidade. No nível ${MASTERY.labels[MASTERY.visualLevel]} a seta muda em campo; no ${MASTERY.labels[MASTERY.suffixLevel]} o nome ganha "${MASTERY.suffix}" no log.`}
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Nível {MASTERY.labels[maxLevel]}</span>
            <span className="big big--md">
              {atMax}/{total}
            </span>
          </div>
        }
      />
      {!lineages.length ? <NoLineage /> : null}
      <div className="thresholds">
        {MASTERY.thresholds.map((t, i) => (
          <div key={t} className="thresholds__i">
            <span className="num">{MASTERY.labels[i + 1]}</span>
            <span className="t-mono muted">{fmt(t)} usos</span>
            <span className="t-mono">-{(i + 1) * MASTERY.staminaReductionPerLevel} fôlego</span>
          </div>
        ))}
      </div>
      {lineages.map((l) => (
        <section key={l.id}>
          <div className="rule">
            <b style={{ color: RARITY_COLORS[l.rarity] }}>{l.name}</b>
            <RarityTag rarity={l.rarity} />
          </div>
          <div className="cards">
            {l.skills.map((s) => {
              const u = uses.get(s.id) ?? 0;
              const lvl = masteryLevel(u);
              const prev = lvl ? MASTERY.thresholds[lvl - 1] : 0;
              const next = lvl < maxLevel ? MASTERY.thresholds[lvl] : null;
              return (
                <article key={s.id} className={`card mastery${lvl >= maxLevel ? ' is-master' : ''}`}>
                  <div className="mastery__head">
                    <SkillIcon lineageId={l.id} skillId={s.id} size={56} alt={s.name} />
                    <div className="stack stack--tight">
                      <span className="card__title">
                        {s.name}
                        {lvl >= MASTERY.suffixLevel ? <span className="mastery__suffix"> {MASTERY.suffix}</span> : null}
                      </span>
                      <span className="label">{s.kind === 'flow' ? 'Flow' : 'Ativa'}</span>
                    </div>
                    <span className="mastery__lvl num">{MASTERY.labels[lvl]}</span>
                  </div>
                  <Meter value={next ? u - prev : 1} max={next ? next - prev : 1} color={lvl >= maxLevel ? 'var(--amber)' : undefined} label={`Maestria de ${s.name}`} />
                  <div className="row row--between">
                    <span className="t-mono" style={{ fontSize: 12 }}>
                      {fmt(u)} usos{next ? ` · faltam ${fmt(next - u)} para ${MASTERY.labels[lvl + 1]}` : ' · máxima'}
                    </span>
                    {s.kind === 'active' && lvl ? <span className="t-mono accent" style={{ fontSize: 12 }}>-{lvl * MASTERY.staminaReductionPerLevel} fôlego</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
