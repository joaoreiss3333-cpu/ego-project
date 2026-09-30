import type { Metadata } from 'next';
import Link from 'next/link';
import { GAME, LINEAGES, PROGRESSION, RARITY_COLORS, SITE_PATHS, allTreeNodes, spentLineagePoints } from '@ego/content';
import { missionBoard, prisma, profileView } from '@ego/db';
import { resetTreeAction } from '@/actions/character';
import { ConfirmAction } from '@/components/forms';
import { TreeGraph } from '@/components/TreeGraph';
import { LineagePortrait, NoCharacter, NoLineage, PageHead, Panel, RarityTag, Sheet } from '@/components/ui';
import { fmt, fmtDate, fmtDuration } from '@/lib/format';
import { buildTree } from '@/lib/tree';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Linhagem' };

export default async function LinhagemPage() {
  const v = await requireViewer(SITE_PATHS.linhagem);
  if (!v.character) return <NoCharacter />;
  const view = await profileView(v.character.id);
  const c = view.character;
  if (!view.lineage) {
    return (
      <>
        <PageHead code="02.2" section="Personagem" title="Linhagem" />
        <NoLineage />
      </>
    );
  }
  const lineage = view.lineage;
  const [board, progresses] = await Promise.all([
    missionBoard(c.id),
    prisma.lineageProgress.findMany({ where: { characterId: c.id }, orderBy: { obtainedAt: 'asc' } }),
  ]);
  const owned = view.progress?.nodes ?? [];
  const tree = buildTree(lineage, owned, view.awakenings, board.awakening);
  const spent = spentLineagePoints(lineage.id, owned);
  const totalCost = allTreeNodes(lineage).reduce((a, n) => a + n.cost, 0);
  const cooldownMs = Math.max(0, (c.lastTreeResetAt?.getTime() ?? 0) + PROGRESSION.reset.cooldownHours * 3600_000 - Date.now());

  return (
    <>
      <PageHead
        code="02.2"
        section="Personagem"
        title={
          <>
            Linhagem <span style={{ color: RARITY_COLORS[lineage.rarity] }}>{lineage.name}</span>
          </>
        }
        lede={lineage.description}
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Pontos de Linhagem</span>
            <span className={`big${c.lineagePoints ? '' : ' muted'}`}>{c.lineagePoints}</span>
            <span className="label">
              1 ponto a cada {PROGRESSION.lineagePointEvery} níveis
            </span>
          </div>
        }
      />

      <Panel title="Árvore" code={`${spent}/${totalCost} PL INVESTIDOS · ÚNICO LUGAR DE COMPRA`} className="tree-panel">
        <TreeGraph
          tree={tree}
          points={c.lineagePoints}
          color={RARITY_COLORS[lineage.rarity]}
          legend={
            <div className="tree__legend">
              <span>
                <i className="lg lg--comprado" /> Liberado
              </span>
              <span>
                <i className="lg lg--disponivel" /> Disponível
              </span>
              <span>
                <i className="lg lg--bloqueado" /> Bloqueado
              </span>
              <span>
                <i className="lg lg--despertar" /> Despertar pendente
              </span>
              <Link href={SITE_PATHS.guia('arvore-e-despertares')}>Como a árvore funciona</Link>
            </div>
          }
        />
      </Panel>

      <div className="side-r" style={{ marginTop: 20 }}>
        <Panel title="Linhagens obtidas" code={`${progresses.length}/${LINEAGES.length} NO REGISTRO`}>
          <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
            O progresso da árvore fica salvo em cada linhagem. Trocar de linhagem pelo giro não apaga nada.
          </p>
          <div className="owned">
            {progresses.map((lp) => {
              const l = LINEAGES.find((x) => x.id === lp.lineageId);
              if (!l) return null;
              const equipped = l.id === lineage.id;
              const nodes = allTreeNodes(l).length - 1;
              return (
                <div key={lp.id} className={`owned__item${equipped ? ' is-on' : ''}`}>
                  <LineagePortrait lineageId={l.id} size={64} alt={l.name} />
                  <div className="stack stack--tight">
                    <div className="row">
                      <b className="owned__name" style={{ color: RARITY_COLORS[l.rarity] }}>
                        {l.name}
                      </b>
                      <RarityTag rarity={l.rarity} />
                      {equipped ? <span className="tag" style={{ ['--tc' as string]: 'var(--electric-2)' }}>Equipada</span> : null}
                    </div>
                    <span className="t-mono muted" style={{ fontSize: 12 }}>
                      {lp.nodes.length}/{nodes} nós · {spentLineagePoints(l.id, lp.nodes)} PL · desde {fmtDate(lp.obtainedAt, false)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <Link href={SITE_PATHS.giro} className="btn btn--ghost btn--sm" style={{ marginTop: 14 }}>
            Giro de linhagem
          </Link>
        </Panel>

        <Panel title="Reset da árvore" code={`RECARGA ${PROGRESSION.reset.cooldownHours}H`} tone="alert">
          <Sheet
            rows={[
              ['Custo', `${fmt(PROGRESSION.reset.treeCost)} ${GAME.commonCurrency.plural}`],
              ['Você tem', `${fmt(c.ienes)} ${GAME.commonCurrency.plural}`],
              ['PL devolvidos', fmt(spent)],
              ['Loadout', 'volta ao padrão'],
            ]}
          />
          <div style={{ marginTop: 14 }}>
            <ConfirmAction
              action={resetTreeAction}
              label="Resetar árvore"
              question={`Zerar a árvore de ${lineage.name}?`}
              detail={`Custa ${fmt(PROGRESSION.reset.treeCost)} ${GAME.commonCurrency.plural}. Os ${spent} PL voltam e o loadout volta ao padrão. Só a linhagem equipada é afetada.`}
              confirmLabel="Resetar árvore"
              disabled={cooldownMs > 0 || spent === 0}
              disabledReason={cooldownMs > 0 ? `Disponível em ${fmtDuration(cooldownMs)}` : spent === 0 ? 'Nenhum nó comprado' : undefined}
            />
          </div>
        </Panel>
      </div>
    </>
  );
}
