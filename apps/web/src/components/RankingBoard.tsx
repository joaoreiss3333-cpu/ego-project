import Link from 'next/link';
import { MATCH_MODES, MMR, RARITY_COLORS, SITE_PATHS, findCosmetic, findLineage, rankGroupForMode, type RankGroup } from '@ego/content';
import { leaderboard, rankPosition } from '@ego/db';
import { CountUp } from './CountUp';
import { NoCharacter, PageHead } from './ui';
import { artUrl } from '@/lib/art';
import { fmt, fmtDate, fmtDuration } from '@/lib/format';
import { requireViewer } from '@/lib/viewer';

const PAGE = 50;

const modesOf = (g: RankGroup) => {
  const ms = MATCH_MODES.filter((m) => rankGroupForMode(m) === g);
  return ms.length > 1 ? `${ms.slice(0, -1).join(', ')} e ${ms[ms.length - 1]}` : ms.join('');
};
const COPY: Record<RankGroup, { title: string; code: string; modes: string }> = {
  solo: { title: 'Ranking Solo', code: '06.1', modes: `Ranqueadas ${modesOf('solo')}` },
  time: { title: 'Ranking Time', code: '06.2', modes: `Ranqueadas ${modesOf('time')}` },
};

function nudge(position: number): string {
  if (position === 1) return 'Topo da instalação. Segure.';
  if (position <= 3) return 'Pódio. O número 1 está logo ali.';
  if (position <= 10) return 'Entre os dez. Ainda não é o bastante.';
  return 'Suba.';
}

export async function RankingBoard({ group, page }: { group: RankGroup; page: number }) {
  const path = group === 'solo' ? SITE_PATHS.rankingSolo : SITE_PATHS.rankingTime;
  const v = await requireViewer(path);
  if (!v.character) return <NoCharacter />;
  const c = v.character;
  const skip = (page - 1) * PAGE;
  const [board, me] = await Promise.all([leaderboard(c.guildId, group, PAGE, skip), rankPosition(c.id, c.guildId, group)]);
  const pages = Math.max(1, Math.ceil(board.total / PAGE));
  const left = board.season.endsAt.getTime() - Date.now();
  const copy = COPY[group];

  return (
    <>
      <PageHead
        code={copy.code}
        section="Ranking"
        title={copy.title}
        lede={`${copy.modes}. Elo por média do time, K ${MMR.kFactor}, todo mundo começa com ${fmt(MMR.start)}. Só o seu servidor aparece aqui.`}
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">{board.season.name}</span>
            <span className="big big--sm">{left > 0 ? `Termina em ${fmtDuration(left)}` : 'Encerrando'}</span>
            <span className="label">Fim: {fmtDate(board.season.endsAt)}</span>
          </div>
        }
      />

      <section className={`you${me.position ? '' : ' is-none'}`}>
        <div className="you__pos">
          {me.position ? <CountUp value={me.position} from={Math.max(me.total, me.position) + 60} prefix="#" duration={1300} /> : '#—'}
        </div>
        <div className="you__text">
          {me.position ? (
            <>
              <span className="you__line">
                Você está em #{fmt(me.position)}. {nudge(me.position)}
              </span>
              <span className="t-mono muted">
                MMR {fmt(me.mmr)} · {me.wins}V {me.draws}E {me.losses}D · {fmt(me.total)} jogadores no servidor
              </span>
            </>
          ) : (
            <>
              <span className="you__line">Sem posição nesta temporada.</span>
              <span className="t-mono muted">Jogue uma ranqueada ({modesOf(group)}) para entrar na tabela.</span>
            </>
          )}
        </div>
      </section>

      {board.rows.length ? (
        <ol className="board" start={skip + 1}>
          {board.rows.map((r) => {
            const l = findLineage(r.character.lineageId);
            const isMe = r.characterId === c.id;
            const title = findCosmetic(r.character.titleId);
            return (
              <li key={r.id} className={`board__row${isMe ? ' is-me' : ''}${r.position <= 3 ? ' is-top' : ''}`}>
                <span className="board__pos">{r.position}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="board__img" src={artUrl.portrait(r.character.id)} alt="" width={44} height={44} loading="lazy" />
                <span className="board__who">
                  <Link href={isMe ? SITE_PATHS.perfil : `${SITE_PATHS.perfil}/${r.character.discordId}`} className="board__name">
                    {r.character.name}
                  </Link>
                  <span className="t-mono muted" style={{ fontSize: 12 }}>
                    #{r.character.number} · NV {r.character.level}
                    {l ? (
                      <>
                        {' · '}
                        <span style={{ color: RARITY_COLORS[l.rarity] }}>{l.name}</span>
                      </>
                    ) : null}
                    {title ? ` · ${title.name}` : ''}
                  </span>
                </span>
                <span className="board__rec t-mono">
                  {r.wins}V {r.draws}E {r.losses}D
                </span>
                <span className="board__mmr">
                  <span className="num">{fmt(r.mmr)}</span>
                  <span className="label">MMR</span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">Ninguém jogou ranqueada nesta temporada ainda. Seja o primeiro nome da tabela.</p>
      )}

      {pages > 1 ? (
        <nav className="pager" aria-label="Páginas do ranking">
          {page > 1 ? (
            <Link className="btn btn--ghost btn--sm" href={`${path}?pagina=${page - 1}`}>
              Anterior
            </Link>
          ) : null}
          <span className="t-mono muted">
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <Link className="btn btn--ghost btn--sm" href={`${path}?pagina=${page + 1}`}>
              Próxima
            </Link>
          ) : null}
          {me.position && Math.ceil(me.position / PAGE) !== page ? (
            <Link className="btn btn--primary btn--sm" href={`${path}?pagina=${Math.ceil(me.position / PAGE)}`}>
              Ir para a minha posição
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

export function pageParam(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : 1;
}
