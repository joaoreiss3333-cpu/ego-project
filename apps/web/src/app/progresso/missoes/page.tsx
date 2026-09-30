import type { Metadata } from 'next';
import Link from 'next/link';
import { GAME, MISSION_COIN_BONUS, SITE_PATHS } from '@ego/content';
import { missionBoard, nextDayReset, weekKey, type MissionView } from '@ego/db';
import { Meter, NoCharacter, PageHead, Panel, Tag } from '@/components/ui';
import { fmtDate, fmtDuration } from '@/lib/format';
import { rewardText } from '@/lib/rewards';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Missões' };

/** Próxima virada de semana (segunda 00:00 de Brasília, mesma chave ISO das missões). */
function nextWeekReset(now = new Date()): Date {
  const cur = weekKey(now);
  let d = nextDayReset(now);
  for (let i = 0; i < 8 && weekKey(d) === cur; i++) d = nextDayReset(d);
  return d;
}

function MissionRow({ m, code }: { m: MissionView; code: string }) {
  return (
    <div className={`mission${m.completed ? ' is-done' : ''}`}>
      <span className="mission__code">{code}</span>
      <div className="mission__body">
        <div className="row row--between">
          <b className="mission__name">{m.name}</b>
          {m.completed ? <Tag color="var(--success)">Concluída</Tag> : <span className="t-mono">{m.progress}/{m.target}</span>}
        </div>
        <p className="mission__desc">{m.description}</p>
        <Meter value={m.progress} max={m.target} color={m.completed ? 'var(--success)' : undefined} label={m.name} />
        <span className="mission__reward">{rewardText(m.reward)}</span>
      </div>
    </div>
  );
}

function BonusBox({ done, total, coins, claimed, label }: { done: number; total: number; coins: number; claimed: boolean; label: string }) {
  return (
    <div className={`bonus${claimed ? ' is-claimed' : ''}`}>
      <div className="bonus__count">
        <span className="num">{done}</span>
        <span className="muted">/{total}</span>
      </div>
      <div className="stack stack--tight">
        <span className="label">{label}</span>
        <div className="bonus__pips" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <i key={i} className={i < done ? 'is-on' : ''} />
          ))}
        </div>
        <span className="t-mono" style={{ fontSize: 13 }}>
          {claimed ? `Bônus recebido: +${coins} ${GAME.premiumCurrency.short}` : `Feche as ${total} e ganhe +${coins} ${GAME.premiumCurrency.short}`}
        </span>
      </div>
    </div>
  );
}

export default async function MissoesPage() {
  const v = await requireViewer(SITE_PATHS.missoes);
  if (!v.character) return <NoCharacter />;
  const board = await missionBoard(v.character.id);
  const now = new Date();
  const dReset = nextDayReset(now);
  const wReset = nextWeekReset(now);
  const dDone = board.daily.filter((m) => m.completed).length;
  const wDone = board.weekly.filter((m) => m.completed).length;

  return (
    <>
      <PageHead
        code="04.1"
        section="Progresso"
        title="Missões"
        lede={`${MISSION_COIN_BONUS.dailyCount} diárias e ${MISSION_COIN_BONUS.weeklyCount} semanais, sorteadas para você. O progresso conta sozinho nas partidas e treinos. Horário de Brasília.`}
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Diárias viram em</span>
            <span className="big big--md">{fmtDuration(dReset.getTime() - now.getTime())}</span>
          </div>
        }
      />
      <div className="split">
        <Panel title="Diárias" code={`RENOVA ${fmtDate(dReset)}`}>
          <BonusBox done={dDone} total={MISSION_COIN_BONUS.dailyCount} coins={MISSION_COIN_BONUS.allDaily} claimed={board.dailyBonusClaimed} label="Bônus do dia" />
          <div className="missions">
            {board.daily.map((m, i) => (
              <MissionRow key={m.id} m={m} code={`D0${i + 1}`} />
            ))}
          </div>
        </Panel>
        <Panel title="Semanais" code={`RENOVA ${fmtDate(wReset)}`}>
          <BonusBox done={wDone} total={MISSION_COIN_BONUS.weeklyCount} coins={MISSION_COIN_BONUS.allWeekly} claimed={board.weeklyBonusClaimed} label="Bônus da semana" />
          <div className="missions">
            {board.weekly.map((m, i) => (
              <MissionRow key={m.id} m={m} code={`S0${i + 1}`} />
            ))}
          </div>
        </Panel>
      </div>
      <p className="muted" style={{ marginTop: 18, fontSize: 14 }}>
        Missões de Despertar ficam em <Link href={SITE_PATHS.despertares}>Despertares</Link>. Regras completas no <Link href={SITE_PATHS.guia('missoes')}>guia de missões</Link>.
      </p>
    </>
  );
}
