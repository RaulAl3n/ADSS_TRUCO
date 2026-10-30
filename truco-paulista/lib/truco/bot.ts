// IA dos adversários (e do parceiro, no 2×2).
//
// Princípio: o bot só enxerga o que um jogador real enxergaria (RN16) — a própria mão,
// as cartas abertas na mesa, a vira e os sinais que recebeu ou flagrou (RN42).
// Para decidir, ele "imagina" mãos possíveis para os outros jogadores (amostragem das
// cartas que ainda não viu) e simula o resto da mão várias vezes (Monte Carlo).

import { cardStrength, createDeck, isManilha, shuffle } from "./cards";
import {
  canAskBet,
  canCover,
  canRaisePending,
  nextBetValue,
  other,
  resolveHand,
  WIN_SCORE,
} from "./rules";
import type { Action } from "./engine";
import type { Card, GameState, Rank, RoundResult, SignalKind, Suit, Team } from "./types";

type Rand = () => number;

// ───────────────────────────── visão sanitizada (RN16) ─────────────────────────────

export interface BotView {
  me: number;
  n: number;
  teams: Team[];
  manilha: Rank;
  vira: Card;
  /** Mãos conhecidas: a própria e, na mão de onze, a do parceiro (RN35). */
  known: Map<number, Card[]>;
  handCounts: number[];
  table: { player: number; card: Card | null; covered: boolean }[];
  pastPlays: { player: number; card: Card | null; covered: boolean }[];
  results: RoundResult[];
  turn: number;
  roundStarter: number;
  roundIndex: number;
  hints: { player: number; kind: SignalKind }[];
}

export function makeView(s: GameState, me: number): BotView {
  const myTeam = s.players[me].team;
  const known = new Map<number, Card[]>();
  known.set(me, s.players[me].hand);
  if (s.handType === "onze" && s.onzeTeam === myTeam) {
    for (const p of s.players) if (p.team === myTeam) known.set(p.index, p.hand);
  }
  const mask = (pc: { player: number; card: Card; covered: boolean }) => ({
    player: pc.player,
    card: pc.covered && pc.player !== me ? null : pc.card,
    covered: pc.covered,
  });
  return {
    me,
    n: s.players.length,
    teams: s.players.map((p) => p.team),
    manilha: s.manilha!,
    vira: s.vira!,
    known,
    handCounts: s.players.map((p) => p.hand.length),
    table: s.table.map(mask),
    pastPlays: s.rounds.flatMap((r) => r.plays.map(mask)),
    results: s.rounds.map((r) => r.result),
    turn: s.turn,
    roundStarter: s.roundStarter,
    roundIndex: s.roundIndex,
    hints: s.signals
      .filter((g) => g.to === me || g.seenBy.includes(me))
      .map((g) => ({ player: g.from, kind: g.kind })),
  };
}

// ───────────────────────────── simulador rápido ─────────────────────────────

interface SimState {
  hands: number[][]; // forças
  teams: Team[];
  table: { p: number; s: number }[];
  results: RoundResult[];
  turn: number;
  starter: number;
}

function greedyPick(hand: number[], st: SimState, me: number): number {
  const sorted = hand.slice().sort((a, b) => a - b);
  if (st.table.length === 0) {
    // Abrindo a rodada: na 1ª, com 3 cartas, sai com a do meio; depois, com a maior.
    if (sorted.length === 3 && st.results.length === 0) return sorted[1];
    return sorted[sorted.length - 1];
  }
  let best = -Infinity;
  let owner: Team | null = null;
  for (const t of st.table) {
    if (t.s > best) { best = t.s; owner = st.teams[t.p]; }
    else if (t.s === best && st.teams[t.p] !== owner) owner = null;
  }
  if (owner === st.teams[me]) return sorted[0]; // parceiro está ganhando
  const beat = sorted.find((x) => x > best);
  if (beat !== undefined) return beat;
  const tie = sorted.find((x) => x === best);
  if (tie !== undefined && st.results.some((r) => r === st.teams[me])) return tie; // cangar segura a mão
  return sorted[0];
}

function removeOne(arr: number[], v: number) {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
}

/** Joga até o fim da mão. Retorna a equipe vencedora (ou null = três empates). */
function playout(st: SimState, n: number): Team | null {
  for (let guard = 0; guard < 20; guard++) {
    while (st.table.length < n) {
      const p = st.turn;
      const s = greedyPick(st.hands[p], st, p);
      removeOne(st.hands[p], s);
      st.table.push({ p, s });
      st.turn = (p + 1) % n;
    }
    let best = -Infinity;
    for (const t of st.table) best = Math.max(best, t.s);
    const top = st.table.filter((t) => t.s === best);
    const teams = new Set(top.map((t) => st.teams[t.p]));
    const result: RoundResult = teams.size > 1 ? "tie" : st.teams[top[0].p];
    st.results.push(result);
    const dec = resolveHand(st.results);
    if (dec.decided) return dec.winner;
    const starter = result === "tie" ? st.starter : top[0].p;
    st.table = [];
    st.turn = starter;
    st.starter = starter;
  }
  return null;
}

const SIGNAL_SUIT: Partial<Record<SignalKind, Suit>> = {
  zap: "paus",
  copas: "copas",
  espadilha: "espadas",
  picafumo: "ouros",
};

/** Sorteia uma configuração plausível das cartas desconhecidas. */
function determinize(v: BotView, rand: Rand): number[][] {
  const seen = new Set<string>([v.vira.id]);
  for (const [, h] of v.known) for (const c of h) seen.add(c.id);
  for (const pc of [...v.pastPlays, ...v.table]) if (pc.card) seen.add(pc.card.id);
  let pool = shuffle(createDeck().filter((c) => !seen.has(c.id)), rand);

  const hands: Card[][] = Array.from({ length: v.n }, () => []);
  // Sinais restringem a mão de quem sinalizou (RN42).
  for (const h of v.hints) {
    if (v.known.has(h.player) || v.handCounts[h.player] === 0) continue;
    let pick: Card | undefined;
    const suit = SIGNAL_SUIT[h.kind];
    if (suit) pick = pool.find((c) => c.rank === v.manilha && c.suit === suit);
    else if (h.kind === "tres") pick = pool.find((c) => c.rank === "3" && !isManilha(c, v.manilha));
    if (pick && hands[h.player].length < v.handCounts[h.player]) {
      hands[h.player].push(pick);
      pool = pool.filter((c) => c.id !== pick!.id);
    }
  }
  for (let p = 0; p < v.n; p++) {
    if (v.known.has(p)) { hands[p] = v.known.get(p)!.slice(); continue; }
    while (hands[p].length < v.handCounts[p]) hands[p].push(pool.pop()!);
  }
  return hands.map((h) => h.map((c) => cardStrength(c, v.manilha)));
}

function baseSim(v: BotView, hands: number[][]): SimState {
  return {
    hands,
    teams: v.teams,
    // carta coberta de outro jogador = força -1; minha carta coberta também vale -1.
    table: v.table.map((t) => ({ p: t.player, s: t.covered || !t.card ? -1 : cardStrength(t.card, v.manilha) })),
    results: v.results.slice(),
    turn: v.turn,
    starter: v.roundStarter,
  };
}

/** Probabilidade estimada de a equipe do bot vencer a mão. */
export function winProbability(v: BotView, samples = 160, rand: Rand = Math.random): number {
  const myTeam = v.teams[v.me];
  let acc = 0;
  for (let i = 0; i < samples; i++) {
    const w = playout(baseSim(v, determinize(v, rand)), v.n);
    acc += w === null ? 0.5 : w === myTeam ? 1 : 0;
  }
  return acc / samples;
}

/** Escolhe a carta (e se vai coberta) por Monte Carlo com amostras comuns. */
export function chooseCard(
  v: BotView,
  allowCover: boolean,
  samples = 120,
  rand: Rand = Math.random,
): { cardId: string; covered: boolean } {
  const hand = v.known.get(v.me)!;
  const strengthOf = (c: Card) => cardStrength(c, v.manilha);
  const sorted = hand.slice().sort((a, b) => strengthOf(a) - strengthOf(b));
  if (sorted.length === 1) {
    return { cardId: sorted[0].id, covered: false };
  }
  // Candidatos: uma carta por força distinta + a mais fraca coberta.
  const cands: { card: Card; covered: boolean }[] = [];
  const seenStr = new Set<number>();
  for (const c of sorted) {
    const s = strengthOf(c);
    if (!seenStr.has(s)) { seenStr.add(s); cands.push({ card: c, covered: false }); }
  }
  if (allowCover) cands.push({ card: sorted[0], covered: true });

  const myTeam = v.teams[v.me];
  const scores = cands.map(() => 0);
  for (let i = 0; i < samples; i++) {
    const hands = determinize(v, rand);
    cands.forEach((cand, k) => {
      const h = hands.map((x) => x.slice());
      const st = baseSim(v, h);
      removeOne(st.hands[v.me], strengthOf(cand.card));
      st.table.push({ p: v.me, s: cand.covered ? -1 : strengthOf(cand.card) });
      st.turn = (v.me + 1) % v.n;
      const w = playout(st, v.n);
      scores[k] += w === null ? 0.5 : w === myTeam ? 1 : 0;
    });
  }
  // Maior chance de vencer; em empate técnico, prefere guardar força (carta mais fraca / coberta).
  let bestK = 0;
  for (let k = 1; k < cands.length; k++) {
    const diff = scores[k] - scores[bestK];
    if (diff > samples * 0.02) bestK = k;
    else if (Math.abs(diff) <= samples * 0.02) {
      const a = cands[k], b = cands[bestK];
      const weaker = (a.covered ? -2 : strengthOf(a.card)) < (b.covered ? -2 : strengthOf(b.card));
      if (weaker) bestK = k;
    }
  }
  return { cardId: cands[bestK].card.id, covered: cands[bestK].covered };
}

// ───────────────────────────── decisões de aposta ─────────────────────────────

/** Deve pedir truco/aumentar na própria vez? (UC11/UC13) */
export function shouldAskBet(s: GameState, me: number, p: number, rand: Rand = Math.random): boolean {
  const bot = s.players[me];
  const myTeam = bot.team;
  const value = nextBetValue(s.handValue)!;
  const myScore = s.score[myTeam];
  const oppScore = s.score[other(myTeam)];
  // Já basta o valor atual para fechar o jogo? Não há motivo para arriscar mais.
  if (myScore + s.handValue >= WIN_SCORE && p > 0.5) return false;
  // Se o adversário fecha o jogo aceitando e vencendo, só pede com mão muito boa.
  const danger = oppScore + value >= WIN_SCORE ? 0.1 : 0;
  const base = (value === 3 ? 0.64 : value === 6 ? 0.7 : value === 9 ? 0.76 : 0.82) + danger;
  const threshold = base / bot.aggression;
  // "Cozinhar" a mão: com jogo muito forte na 1ª rodada, às vezes espera.
  if (p > 0.9 && s.roundIndex === 0 && rand() < 0.45) return false;
  if (p >= threshold) return true;
  // Blefe.
  return p > 0.22 && rand() < bot.bluff * (value === 3 ? 1 : 0.5);
}

/** Resposta a um pedido pendente (UC12/UC13/UC14). */
export function decideResponse(
  s: GameState,
  me: number,
  p0: number,
  rand: Rand = Math.random,
): "accept" | "raise" | "run" {
  const bot = s.players[me];
  const bet = s.pendingBet!;
  const myTeam = bot.team;
  const opp = other(myTeam);
  // Quem pede costuma ter jogo: desconta um pouco a estimativa.
  const p = Math.max(0, p0 - 0.07);
  const cur = s.handValue;
  const V = bet.value;
  // Correr entrega o jogo? Então aceita (ou aumenta).
  const runLoses = s.score[opp] + cur >= WIN_SCORE;
  const acceptLosesGame = s.score[opp] + V >= WIN_SCORE;
  if (canRaisePending(s, me)) {
    const raiseT = (0.78 + (acceptLosesGame ? 0.05 : 0)) / bot.aggression;
    if (p >= raiseT) return "raise";
    if (p > 0.3 && rand() < bot.bluff * 0.35) return "raise";
  }
  if (runLoses) return "accept";
  // Valor esperado: aceitar → (2p−1)·V ; correr → −cur.
  let threshold = ((V - cur) / (2 * V)) * (1.3 / bot.aggression);
  if (acceptLosesGame) threshold += 0.12;
  return p >= threshold ? "accept" : "run";
}

/** Decisão da mão de onze (UC15). A equipe com 11 vê as cartas do parceiro. */
export function decideOnze(s: GameState, me: number, rand: Rand = Math.random): boolean {
  const p = winProbability(makeView(s, me), 220, rand);
  const opp = other(s.players[me].team);
  // Se correr deixa o adversário com 11 também (mão de ferro), vale arriscar um pouco mais.
  const t = s.score[opp] >= 10 ? 0.35 : 0.42;
  return p >= t / s.players[me].aggression;
}

/** Sinal que o bot manda ao parceiro no começo da mão (RN42/UC22). */
export function chooseSignal(s: GameState, me: number, rand: Rand = Math.random): SignalKind | null {
  if (s.config.mode !== "2v2" || s.handType === "ferro") return null;
  const hand = s.players[me].hand;
  const m = s.manilha!;
  const manilhas = hand.filter((c) => c.rank === m);
  const order: [Suit, SignalKind][] = [["paus", "zap"], ["copas", "copas"], ["espadas", "espadilha"], ["ouros", "picafumo"]];
  for (const [suit, kind] of order) if (manilhas.some((c) => c.suit === suit)) return rand() < 0.85 ? kind : null;
  if (hand.some((c) => c.rank === "3")) return rand() < 0.6 ? "tres" : null;
  return rand() < 0.35 ? "nada" : null;
}

// ───────────────────────────── orquestração ─────────────────────────────

/** Qual jogador (bot) deve agir agora, se houver. Humano = índice 0. */
export function pendingBotActor(s: GameState): number | null {
  const humanIn = (t: Team) => s.players.some((p) => p.team === t && !p.isBot);
  if (s.phase === "onzeDecision") {
    if (humanIn(s.onzeTeam!)) return null; // humano decide (vê a mão do parceiro)
    return s.players.find((p) => p.team === s.onzeTeam && p.isBot)!.index;
  }
  if (s.phase === "betResponse" && s.pendingBet) {
    const team = other(s.pendingBet.byTeam);
    if (humanIn(team)) return null; // humano responde pela equipe
    return s.players.find((p) => p.team === team && p.isBot)!.index; // ver decideBotAction
  }
  if (s.phase === "playing" && s.players[s.turn].isBot) return s.turn;
  return null;
}

/**
 * Decide a próxima ação do(s) bot(s). Depois de um pedido aceito, a RN32 impede
 * a mesma equipe de pedir de novo, então não há laço de pedidos.
 */
export function decideBotAction(s: GameState, rand: Rand = Math.random): Action | null {
  const actor = pendingBotActor(s);
  if (actor === null) return null;

  if (s.phase === "onzeDecision") {
    return { type: "ONZE_DECISION", play: decideOnze(s, actor, rand) };
  }

  if (s.phase === "betResponse") {
    // RN30 — "vale a primeira resposta": responde o bot mais confiante da equipe.
    const team = other(s.pendingBet!.byTeam);
    let best = actor;
    let bestP = -1;
    for (const p of s.players) {
      if (p.team !== team || !p.isBot) continue;
      const pr = winProbability(makeView(s, p.index), 160, rand);
      if (pr > bestP) { bestP = pr; best = p.index; }
    }
    return { type: "RESPOND_BET", player: best, response: decideResponse(s, best, bestP, rand) };
  }

  // Vez do bot.
  const me = actor;
  if (s.handType === "ferro" && s.config.ironHandBlind) {
    // RN38 — às cegas: o bot também não conhece as próprias cartas.
    const hand = s.players[me].hand;
    return { type: "PLAY_CARD", player: me, cardId: hand[Math.floor(rand() * hand.length)].id, covered: false };
  }
  const view = makeView(s, me);
  if (canAskBet(s, me)) {
    const p = winProbability(view, 160, rand);
    if (shouldAskBet(s, me, p, rand)) return { type: "ASK_BET", player: me };
  }
  const pick = chooseCard(view, canCover(s), 110, rand);
  return { type: "PLAY_CARD", player: me, cardId: pick.cardId, covered: pick.covered };
}
