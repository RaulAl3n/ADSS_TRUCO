// Regras puras de resolução — RN20 a RN34
import { cardStrength } from "./cards";
import type { GameState, PlayedCard, Rank, RoundResult, Team } from "./types";

export const WIN_SCORE = 12; // RN39

/** RN28 — escada de apostas. */
export const BET_LADDER = [1, 3, 6, 9, 12] as const;
export const BET_NAME: Record<number, string> = { 3: "Truco", 6: "Seis", 9: "Nove", 12: "Doze" };

export function nextBetValue(current: number): number | null {
  const i = BET_LADDER.indexOf(current as (typeof BET_LADDER)[number]);
  if (i < 0 || i >= BET_LADDER.length - 1) return null;
  return BET_LADDER[i + 1];
}

/** RN33 — valor vigente antes de um pedido (o que recebe quem pediu, se o outro correr). */
export function valueBefore(requested: number): number {
  const i = BET_LADDER.indexOf(requested as (typeof BET_LADDER)[number]);
  return i > 0 ? BET_LADDER[i - 1] : 1;
}

export const other = (t: Team): Team => (t === 0 ? 1 : 0);

export interface RoundOutcome {
  result: RoundResult;
  /** Jogador que venceu a rodada (inicia a próxima — RN23). null se empate. */
  winnerPlayer: number | null;
}

/**
 * UC09 — resolve uma rodada.
 * RN20: vence a carta mais forte. RN21: empate entre parceiros = vitória da equipe.
 * RN22: empate entre equipes = "cangou". Cobertas valem -1 (RN26).
 */
export function resolveRound(
  plays: PlayedCard[],
  manilha: Rank | null,
  teamOf: (player: number) => Team,
): RoundOutcome {
  let best = -Infinity;
  for (const p of plays) best = Math.max(best, cardStrength(p.card, manilha, p.covered));
  const top = plays.filter((p) => cardStrength(p.card, manilha, p.covered) === best);
  const teams = new Set(top.map((p) => teamOf(p.player)));
  if (teams.size > 1) return { result: "tie", winnerPlayer: null };
  return { result: teamOf(top[0].player), winnerPlayer: top[0].player };
}

/**
 * UC10 / RN24 / RN25 — decide a mão a partir dos resultados das rodadas.
 * Retorna:
 *  - { decided: false } se ainda é preciso jogar outra rodada;
 *  - { decided: true, winner: Team | null } (null = três empates, ninguém pontua).
 */
export function resolveHand(
  results: RoundResult[],
): { decided: false } | { decided: true; winner: Team | null } {
  const wins: [number, number] = [0, 0];
  for (const r of results) if (r !== "tie") wins[r]++;
  if (wins[0] >= 2) return { decided: true, winner: 0 };
  if (wins[1] >= 2) return { decided: true, winner: 1 };

  const [r1, r2, r3] = results;
  if (results.length === 2) {
    if (r1 === "tie" && r2 !== "tie") return { decided: true, winner: r2 }; // RN25a
    if (r1 !== "tie" && r2 === "tie") return { decided: true, winner: r1 }; // RN25c
    return { decided: false };
  }
  if (results.length === 3) {
    if (r3 !== "tie") return { decided: true, winner: r3 }; // RN25b (e 1x1 decidido na 3ª)
    if (r1 !== "tie") return { decided: true, winner: r1 }; // RN25d
    return { decided: true, winner: null }; // RN25e
  }
  return { decided: false };
}

export const teamOf = (s: Pick<GameState, "players">, p: number): Team => s.players[p].team;
export const nextPlayer = (s: Pick<GameState, "players">, p: number) => (p + 1) % s.players.length; // RN11

/** Pode pedir aposta agora? (UC11 / UC13, RN29, RN32, RN37, RN38) */
export function canAskBet(s: GameState, player: number): boolean {
  if (s.phase !== "playing" || s.turn !== player) return false;
  if (s.handType !== "normal") return false;
  if (nextBetValue(s.handValue) === null) return false;
  if (s.lastBetTeam !== null && s.lastBetTeam === teamOf(s, player)) return false;
  return true;
}

/** Pode responder ao pedido pendente? */
export function canRespondBet(s: GameState, player: number): boolean {
  return s.phase === "betResponse" && !!s.pendingBet && teamOf(s, player) !== s.pendingBet.byTeam;
}

/** Pode aumentar o pedido pendente? (RN31, RN28) */
export function canRaisePending(s: GameState, player: number): boolean {
  return canRespondBet(s, player) && nextBetValue(s.pendingBet!.value) !== null;
}

/** Pode desistir da mão na sua vez? (RN34; bloqueado na mão de ferro — UC16) */
export function canFold(s: GameState, player: number): boolean {
  return s.phase === "playing" && s.turn === player && s.handType !== "ferro";
}

/** Pode jogar carta coberta? (RN26) */
export function canCover(s: GameState): boolean {
  return s.config.allowCovered && s.roundIndex >= 1 && s.handType !== "ferro";
}
