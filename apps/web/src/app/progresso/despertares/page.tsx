import type { Metadata } from 'next';
import Link from 'next/link';
import { LINEAGES, RARITY_COLORS, SITE_PATHS, allTreeNodes, findLineage, getSkill } from '@ego/content';
import { missionBoard, prisma } from '@ego/db';
import { LineagePortrait, Meter, NoCharacter, PageHead, RarityTag, SkillIcon, Tag } from '@/components/ui';
import { fmt } from '@/lib/format';
import { rewardText } from '@/lib/rewards';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Despertares' };

export default async function DespertaresPage() {
  const v = await requireViewer(SITE_PATHS.despertares);
  if (!v.character) return <NoCharacter />;
  const c = v.character;
  const [board, owned] = await Promise.all([missionBoard(c.id), prisma.lineageProgress.findMany({ where: { characterId: c.id }, select: { lineageId: true, nodes: true } })]);

  return (
    <>
      <PageHead
        code="04.2"
        section="Progresso"
        title="Despertares"
        lede="Missões longas que liberam os nós mais fortes da árvore. Só contam com a linhagem certa equipada. Depois de concluída, a compra do nó fica disponível na aba Linhagem."
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Concluídos</span>
            <span className="big big--md">
              {board.awakening.filter((m) => m.completed).length}/{board.awakening.length}
            </span>
          </div>
        }
      />
      <div className="awakenings">
        {board.awakening.map((m) => {
          const l = findLineage(m.lineageId);
          if (!l) return null;
          const node = allTreeNodes(l).find((n) => n.awakeningMission === m.id);
          const lp = owned.find((o) => o.lineageId === l.id);
          const equipped = c.lineageId === l.id;
          const bought = !!(node && lp?.nodes.includes(node.id));
          const skillId = node?.grantsSkill ?? node?.evolves?.skillId;
          const status = bought ? 'Nó liberado' : m.completed ? 'Pronto para comprar' : !lp ? 'Linhagem não obtida' : equipped ? 'Contando' : 'Pausado: equipe a linhagem';
          const tone = bought || m.completed ? 'var(--success)' : !lp ? 'var(--muted)' : equipped ? 'var(--electric-2)' : 'var(--amber)';
          return (
            <article key={m.id} className="awk panel" style={{ ['--bd' as string]: m.completed ? 'var(--amber)' : undefined }}>
              <div className="awk__side">
                <LineagePortrait lineageId={l.id} size={120} alt={l.name} />
                <RarityTag rarity={l.rarity} />
              </div>
              <div className="stack">
                <div className="row row--between">
                  <span className="label" style={{ color: RARITY_COLORS[l.rarity] }}>
                    Linhagem {l.name}
                  </span>
                  <Tag color={tone}>{status}</Tag>
                </div>
                <h2 className="awk__name">{m.name}</h2>
                <p className="ink-2" style={{ margin: 0 }}>
                  {m.description}
                </p>
                <div className="awk__meter">
                  <span className="num awk__count">
                    {fmt(m.progress)}
                    <span className="muted">/{fmt(m.target)}</span>
                  </span>
                  <div style={{ flex: 1 }}>
                    <Meter value={m.progress} max={m.target} color="var(--amber)" thick label={m.name} />
                  </div>
                </div>
                {node ? (
                  <div className="awk__node">
                    {skillId ? <SkillIcon lineageId={l.id} skillId={skillId} size={48} /> : null}
                    <div>
                      <span className="label">Libera o nó</span>
                      <div>
                        <b>{node.name}</b>{' '}
                        <span className="muted t-mono">
                          · {node.cost} PL · {node.grantsSkill ? `habilidade ${getSkill(node.grantsSkill).name}` : node.evolves ? `evolui ${getSkill(node.evolves.skillId).name}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="row row--between">
                  <span className="t-mono muted" style={{ fontSize: 12 }}>
                    Recompensa da missão: {rewardText(m.reward)}
                  </span>
                  {lp ? (
                    <Link href={SITE_PATHS.linhagem} className="label accent">
                      Ver na árvore
                    </Link>
                  ) : (
                    <Link href={SITE_PATHS.giro} className="label accent">
                      Giro de linhagem
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {LINEAGES.filter((l) => !board.awakening.some((m) => m.lineageId === l.id)).length ? (
        <p className="muted" style={{ marginTop: 18, fontSize: 14 }}>
          Sem Despertar por enquanto: {LINEAGES.filter((l) => !board.awakening.some((m) => m.lineageId === l.id)).map((l) => l.name).join(', ')}.
        </p>
      ) : null}
    </>
  );
}
