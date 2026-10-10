import Link from 'next/link';
import { GAME, MATCH_REWARDS, RARITY_COLORS, SITE_PATHS, allTreeNodes, findSkill } from '@ego/content';
import { matchHistory, type ProfileView } from '@ego/db';
import { CountUp } from './CountUp';
import { ProfileCard } from './ProfileCard';
import { LineagePortrait, Meter, Panel, RarityTag, SkillIcon, Stat } from './ui';
import { PortraitForm } from './PortraitForm';
import { fmt, fmtDate, fmtDuration, money } from '@/lib/format';
import { matchOutcome, KIND_LABEL } from '@/lib/matches';

export async function ProfileBody({ view, own }: { view: ProfileView; own: boolean }) {
  const c = view.character;
  const { solo, time } = view.rank;
  const best = solo.position && (!time.position || solo.position <= time.position) ? { ...solo, group: 'Solo' as const } : time.position ? { ...time, group: 'Time' as const } : { ...solo, group: 'Solo' as const };
  const recent = await matchHistory(c.id, 4);
  const nodes = view.lineage ? allTreeNodes(view.lineage) : [];
  const owned = view.progress?.nodes ?? [];
  const winRate = c.matches ? Math.round((c.wins / c.matches) * 100) : 0;
  const loadout = view.progress ? [...view.progress.loadoutActive, ...(view.progress.loadoutFlow ? [view.progress.loadoutFlow] : [])] : [];

  return (
    <div className="side-l profile">
      <div className="stack">
        <ProfileCard c={c} lineage={view.lineage} base={view.base} effective={view.effective} caps={view.caps} rank={{ position: best.position, group: best.group, total: best.total }} />
        {own ? <PortraitForm hasCustom={!!c.portraitPath} /> : null}
      </div>

      <div className="stack">
        <div className="profile__top">
          <Panel title="Nível" code={view.maxLevel ? 'MÁXIMO' : `XP ${fmt(c.xp)} / ${fmt(view.xpNeeded)}`}>
            <div className="row" style={{ alignItems: 'flex-end', gap: 18 }}>
              <span className="big">{c.level}</span>
              <div className="stack stack--tight" style={{ flex: 1, minWidth: 160 }}>
                <Meter value={view.maxLevel ? 1 : c.xp} max={view.maxLevel ? 1 : view.xpNeeded} thick label="Experiência" />
                <span className="label">{view.maxLevel ? 'Nível máximo atingido' : `Faltam ${fmt(view.xpNeeded - c.xp)} XP para o nível ${c.level + 1}`}</span>
              </div>
            </div>
          </Panel>
          <Panel title="Valor de mercado" code="ATUALIZADO POR PARTIDA">
            <div className="big big--md">
              <CountUp value={view.marketValue} from={0} prefix={`${GAME.commonCurrency.short} `} duration={1200} />
            </div>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
              Sobe com gols, assistências e vitórias. Cai devagar se você some por dias.
            </p>
          </Panel>
        </div>

        <div className="split">
          {[
            { g: 'Solo', r: solo, href: SITE_PATHS.rankingSolo },
            { g: 'Time', r: time, href: SITE_PATHS.rankingTime },
          ].map(({ g, r, href }) => (
            <Panel key={g} title={`Ranking ${g}`} code={r.position ? `MMR ${fmt(r.mmr)}` : 'SEM PARTIDAS RANQUEADAS'}>
              <div className="rankbox">
                <span className="rankbox__pos">{r.position ? <CountUp value={r.position} from={r.total + 30} prefix="#" /> : '#—'}</span>
                <div className="rankbox__meta">
                  <span className="label">de {fmt(r.total)} no servidor</span>
                  <span className="t-mono">
                    {r.wins}V {r.draws}E {r.losses}D
                  </span>
                  <Link href={href} className="label accent">
                    Ver tabela
                  </Link>
                </div>
              </div>
            </Panel>
          ))}
        </div>

        <Panel title="Estatísticas" code={`${fmt(c.matches)} PARTIDAS / ${winRate}% VITÓRIAS`}>
          <div className="statgrid">
            <Stat label="Gols" value={fmt(c.goals)} />
            <Stat label="Assistências" value={fmt(c.assists)} />
            <Stat label="Partidas" value={fmt(c.matches)} />
            <Stat label="Vitórias" value={fmt(c.wins)} />
            <Stat label="Dribles" value={fmt(c.dribblesWon)} />
            <Stat label="Leituras" value={fmt(c.readsCorrect)} />
            <Stat label="Defesas" value={fmt(c.saves)} />
            <Stat label="Desarmes" value={fmt(c.tackles)} />
          </div>
        </Panel>

        {view.lineage ? (
          <Panel title="Linhagem equipada" code={`${owned.length}/${nodes.length - 1} NÓS`}>
            <div className="linsum">
              <LineagePortrait lineageId={view.lineage.id} size={92} alt={view.lineage.name} />
              <div className="stack stack--tight">
                <div className="row">
                  <span className="t-display" style={{ fontSize: 34, color: RARITY_COLORS[view.lineage.rarity] }}>
                    {view.lineage.name}
                  </span>
                  <RarityTag rarity={view.lineage.rarity} />
                </div>
                <p className="ink-2" style={{ margin: 0 }}>
                  {view.lineage.tagline}
                </p>
                <div className="row" aria-label="Loadout">
                  {loadout.map((id) => {
                    const sk = findSkill(id);
                    return sk ? (
                      <span key={id} title={sk.name} className="linsum__sk">
                        <SkillIcon lineageId={sk.lineageId} skillId={id} size={36} alt={sk.name} />
                      </span>
                    ) : null;
                  })}
                  {own ? (
                    <Link href={SITE_PATHS.linhagem} className="btn btn--ghost btn--sm">
                      Árvore
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </Panel>
        ) : own ? (
          <Panel title="Linhagem" tone="alert">
            <p className="ink-2">Sem linhagem. O primeiro giro é grátis.</p>
            <Link href={SITE_PATHS.giro} className="btn btn--primary">
              Ir para o giro
            </Link>
          </Panel>
        ) : null}

        {own ? (
          <div className="split">
            <Panel title="Carteira" code="MATERIAIS">
              <div className="row" style={{ gap: 28 }}>
                <Stat label={GAME.commonCurrency.plural} value={fmt(c.ienes)} />
                <Stat label={GAME.premiumCurrency.plural} value={fmt(c.coins)} />
                <Stat label="Energia" value={`${view.energy.energy}/${view.energy.max}`} sub={view.energy.energy < view.energy.max ? `+1 em ${fmtDuration(view.energy.nextInMs)}` : 'Cheia'} />
              </div>
            </Panel>
            <Panel title="Pontos livres" code="PARA DISTRIBUIR">
              <div className="row" style={{ gap: 28 }}>
                <Stat label="Atributo" value={c.attrPoints} sub={<Link href={SITE_PATHS.atributos}>Distribuir</Link>} />
                <Stat label="Linhagem" value={c.lineagePoints} sub={<Link href={SITE_PATHS.linhagem}>Árvore</Link>} />
              </div>
            </Panel>
          </div>
        ) : null}

        <Panel title="Últimas partidas" code={recent.length ? `ÚLTIMAS ${recent.length}` : 'NENHUMA AINDA'}>
          {recent.length ? (
            <div className="tablewrap">
              <table className="table">
                <tbody>
                  {recent.map((p) => {
                    const o = matchOutcome(p);
                    return (
                      <tr key={p.id}>
                        <td>
                          <span className={`res res--${o.code}`}>{o.label}</span>
                        </td>
                        <td className="t-mono">{o.score}</td>
                        <td>
                          {p.match.mode} · {KIND_LABEL[p.match.kind] ?? p.match.kind}
                        </td>
                        <td className="muted t-mono">{p.match.finishedAt ? fmtDate(p.match.finishedAt) : ''}</td>
                        <td className="n">
                          <Link href={SITE_PATHS.partida(p.matchId)}>Replay</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Nenhuma partida registrada. Cada lance com ação própria rende {MATCH_REWARDS.perActiveTurn.xp} XP.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
