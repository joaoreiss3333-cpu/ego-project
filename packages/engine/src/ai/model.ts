import type { GoalZone, ReadGuess } from '@ego/content';
import { guessOf } from '../mechanics';
import type { MatchState, Team } from '../types';
import type { DifficultyProfile } from './profile';

/**
 * Leitura do adversário: frequências das escolhas de cada jogador, montadas
 * só a partir do histórico público (planos revelados depois da resolução).
 * Nada aqui olha o planejamento em andamento.
 */
export interface Counts {
  [k: string]: number;
}

export interface OpponentModel {
  /** Portador em contato: drible, proteger, passe, chute. */
  contact: Record<string, Counts>;
  /** Portador sem contato. */
  carrier: Record<string, Counts>;
  /** Zonas de chute. */
  shotZones: Record<string, Counts>;
  /** Zonas cobertas pelo goleiro. */
  keeperZones: Record<string, Counts>;
  /** Postura defensiva: bote, conter, fechar_linha, leitura, marcar, mover. */
  defense: Record<string, Counts>;
  /** Movimento sem bola: avanço médio no eixo do ataque. */
  runs: Record<string, { forward: number; wide: number; n: number }>;
  /** Últimas escolhas do próprio time (para misturar). */
  own: Record<string, Counts>;
  prior: number;
  enabled: boolean;
}

const inc = (rec: Record<string, Counts>, id: string, k: string, w = 1) => {
  const c = (rec[id] ??= {});
  c[k] = (c[k] ?? 0) + w;
};

export function buildModel(state: MatchState, team: Team, profile: DifficultyProfile): OpponentModel {
  const m: OpponentModel = {
    contact: {},
    carrier: {},
    shotZones: {},
    keeperZones: {},
    defense: {},
    runs: {},
    own: {},
    prior: profile.prior,
    enabled: profile.reading !== 'off',
  };
  const hist = profile.reading === 'shallow' ? state.history.slice(-profile.readingWindow) : state.history;
  for (const h of hist) {
    // lances recentes pesam mais (adaptação)
    const age = state.turn - h.turn;
    const w = profile.reading === 'full' ? 1 + Math.max(0, 4 - age) * 0.25 : 1;
    for (const rp of h.plans) {
      const p = state.players[rp.playerId];
      if (!p) continue;
      const isEnemy = p.team !== team;
      const bucket = isEnemy ? null : m.own;
      if (rp.context === 'carrier_contact' || rp.context === 'carrier') {
        const g = guessOf(rp.action);
        if (g) {
          if (isEnemy) inc(rp.context === 'carrier_contact' ? m.contact : m.carrier, rp.playerId, g, w);
          else inc(bucket!, rp.playerId, g, w);
        }
        if (rp.action === 'chutar' && rp.shotZone !== null && rp.shotZone !== undefined) inc(m.shotZones, rp.playerId, String(rp.shotZone), w);
      }
      if (rp.action === 'finalizar_primeira' && rp.shotZone !== null && rp.shotZone !== undefined) {
        const shot = h.events.some((e) => e.t === 'shot' && e.shooter === rp.playerId);
        if (shot) inc(m.shotZones, rp.playerId, String(rp.shotZone), w);
      }
      if (rp.context === 'keeper' && rp.keeperZone !== null && rp.keeperZone !== undefined) inc(m.keeperZones, rp.playerId, String(rp.keeperZone), w);
      if (rp.context === 'defense' && isEnemy) inc(m.defense, rp.playerId, rp.action, w);
      if (rp.context === 'attack' && isEnemy) {
        const dir = p.team === 'A' ? 1 : -1;
        const r = (m.runs[rp.playerId] ??= { forward: 0, wide: 0, n: 0 });
        r.forward += (rp.dest.x - rp.from.x) * dir;
        r.wide += Math.abs(rp.dest.y - rp.from.y);
        r.n++;
      }
    }
  }
  return m;
}

/** Distribuição suavizada: (contagem + prior * base) / (total + prior). */
export function predict(model: OpponentModel, rec: Record<string, Counts>, id: string, keys: string[], base?: Record<string, number>): Record<string, number> {
  const c = model.enabled ? (rec[id] ?? {}) : {};
  const total = keys.reduce((a, k) => a + (c[k] ?? 0), 0);
  const out: Record<string, number> = {};
  for (const k of keys) {
    const b = base?.[k] ?? 1 / keys.length;
    out[k] = ((c[k] ?? 0) + model.prior * b) / (total + model.prior);
  }
  return out;
}

export const GUESS_KEYS: ReadGuess[] = ['drible', 'proteger', 'passe', 'chute'];
export const ZONE_KEYS = ['0', '1', '2', '3', '4', '5'];

/** Base "humana" quando não há histórico: em contato, drible e passe dominam. */
export const CONTACT_BASE: Record<string, number> = { drible: 0.4, proteger: 0.2, passe: 0.3, chute: 0.1 };
export const CARRIER_BASE: Record<string, number> = { drible: 0.35, proteger: 0.1, passe: 0.35, chute: 0.2 };
export const DEFENSE_BASE: Record<string, number> = { bote: 0.35, conter: 0.3, fechar_linha: 0.15, leitura: 0.1, marcar: 0.05, mover: 0.05 };

/**
 * Previsão da ação do portador. O balde da situação pesa inteiro e o outro
 * balde entra com metade do peso, para não descartar informação útil.
 */
export function predictCarrier(model: OpponentModel, id: string, inContact: boolean): Record<ReadGuess, number> {
  const main = inContact ? model.contact : model.carrier;
  const other = inContact ? model.carrier : model.contact;
  const merged: Record<string, Counts> = { [id]: {} };
  for (const k of GUESS_KEYS) merged[id][k] = (main[id]?.[k] ?? 0) + 0.5 * (other[id]?.[k] ?? 0);
  return predict(model, merged, id, GUESS_KEYS, inContact ? CONTACT_BASE : CARRIER_BASE) as Record<ReadGuess, number>;
}

export function predictDefense(model: OpponentModel, id: string): Record<string, number> {
  return predict(model, model.defense, id, Object.keys(DEFENSE_BASE), DEFENSE_BASE);
}

export function predictShotZone(model: OpponentModel, id: string): Record<string, number> {
  return predict(model, model.shotZones, id, ZONE_KEYS);
}

export function predictKeeperZone(model: OpponentModel, id: string): Record<string, number> {
  // goleiros sem histórico tendem ao centro
  return predict(model, model.keeperZones, id, ZONE_KEYS, { '0': 0.13, '1': 0.26, '2': 0.13, '3': 0.13, '4': 0.22, '5': 0.13 });
}

/** Frequência das próprias escolhas (para evitar padrão). */
export function ownFrequency(model: OpponentModel, id: string, key: string): number {
  const c = model.own[id];
  if (!c) return 0;
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  return total ? (c[key] ?? 0) / total : 0;
}

export function asZone(k: string): GoalZone {
  return Number(k) as GoalZone;
}
