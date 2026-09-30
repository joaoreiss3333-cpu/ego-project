import type { Metadata } from 'next';
import Link from 'next/link';
import { MASTERY, SITE_PATHS, getSkill, masteryLevel, resolveSkill } from '@ego/content';
import { profileView } from '@ego/db';
import { LoadoutEditor, type LoadoutSkill } from '@/components/LoadoutEditor';
import { NoCharacter, NoLineage, PageHead } from '@/components/ui';
import { MAX_ACTIVE } from '@/lib/loadout-rules';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Loadout' };

export default async function LoadoutPage() {
  const v = await requireViewer(SITE_PATHS.loadout);
  if (!v.character) return <NoCharacter />;
  const view = await profileView(v.character.id);
  if (!view.lineage || !view.progress) {
    return (
      <>
        <PageHead code="02.3" section="Personagem" title="Loadout" />
        <NoLineage />
      </>
    );
  }
  const owned = view.progress.nodes;
  const uses = new Map(view.mastery.map((m) => [m.skillId, m.uses]));
  const skills: LoadoutSkill[] = view.unlocked.map((id) => {
    const def = getSkill(id);
    const r = resolveSkill(id, owned);
    const lvl = masteryLevel(uses.get(id) ?? 0);
    const reduced = Math.max(0, r.stamina - lvl * MASTERY.staminaReductionPerLevel);
    return {
      id,
      lineageId: def.lineageId,
      name: def.name,
      kind: def.kind,
      reaction: !!def.reaction,
      stamina: reduced,
      baseStamina: r.stamina,
      cooldown: r.cooldown,
      masteryLabel: MASTERY.labels[lvl],
      text: def.describe(r.params, { stamina: reduced, cooldown: r.cooldown }),
    };
  });
  const actives = skills.filter((s) => s.kind === 'active').length;

  return (
    <>
      <PageHead
        code="02.3"
        section="Personagem"
        title="Loadout"
        lede={`Leve até ${MAX_ACTIVE} habilidades ativas e 1 de Flow para a partida. Só entra o que já foi liberado na árvore de ${view.lineage.name}.`}
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Liberadas</span>
            <span className="big big--md">
              {actives}
              <span className="muted" style={{ fontSize: '0.5em' }}>
                {' '}
                ativas
              </span>
            </span>
            <Link href={SITE_PATHS.linhagem} className="label accent">
              Liberar mais na árvore
            </Link>
          </div>
        }
      />
      <LoadoutEditor
        skills={skills}
        current={{ active: view.progress.loadoutActive, flow: view.progress.loadoutFlow ?? '' }}
        builds={view.builds}
        lineageName={view.lineage.name}
        maxActive={MAX_ACTIVE}
      />
    </>
  );
}
