// Motor do jogo — redutor puro que implementa os casos de uso UC01–UC22.
// Toda aleatoriedade (embaralhar, cortar, sorteio) entra pelos payloads das ações,
// o que mantém o redutor determinístico e testável.

import { cardLabel, cut, manilhaFor, MANILHA_NAME, SUIT_SYMBOL } from "./cards";
import {
  BET_NAME,
  canAskBet,
  canCover,
  canFold,
  canRaisePending,
  canRespondBet,
  nextBetValue,
  nextPlayer,
  other,
  resolveHand,
  resolveRound,
  teamOf,
  WIN_SCORE,
} from "./rules";
import type {
  Card,
  Config,
  GameState,
  HandType,
  LogEntry,
  Player,
  SignalKind,
  Team,
} from "./types";

export type Action =
  | { type: "LOAD"; state: GameState }
  | { type: "DEAL"; deck: Card[]; cutAt: number } // UC04, UC05, UC06, UC18
  | { type: "ONZE_DECISION"; play: boolean } // UC15
  | { type: "PLAY_CARD"; player: number; cardId: string; covered: boolean } // UC07, UC08
  | { type: "ASK_BET"; player: number } // UC11, UC13
  | { type: "RESPOND_BET"; player: number; response: "accept" | "raise" | "run" } // UC12–UC14
  | { type: "FOLD"; player: number } // UC14 (A1)
  | { type: "SIGNAL"; from: number; kind: SignalKind; seenBy: number[] } // UC22
  | { type: "NEXT" } // avança pausas de exibição (UC09/UC17/UC19)
  | { type: "CLEAR_SHOUT" };

export const DEFAULT_CONFIG: Config = {
  mode: "2v2",
  playerName: "Você",
  allowCovered: true,
  bestOf: 1,
  onzePenalty: "loseHand",
  ironHandBlind: true,
};

const BOT_NAMES = [
  "Zé Gatilho", "Dona Cida", "Tonhão", "Marcinha", "Seu Jairo",
  "Bia Blefe", "Nenê", "Doutor Zap", "Tia Lurdes", "Juca",
];

export const SIGNAL_LABEL: Record<SignalKind, { label: string; gesture: string }> = {
  zap: { label: "Zap", gesture: "piscou o olho" },
  copas: { label: "Copas", gesture: "levantou o ombro" },
  espadilha: { label: "Espadilha", gesture: "ergueu a sobrancelha" },
  picafumo: { label: "Pica-fumo", gesture: "entortou a boca" },
  tres: { label: "Três", gesture: "fez olhar fixo" },
  nada: { label: "Nada", gesture: "fechou os olhos" },
};

// ───────────────────────────── UC01–UC03 ─────────────────────────────

/** UC01 + UC02 + UC03: configura, forma equipes, sorteia o primeiro embaralhador. */
export function createMatch(config: Config, rand: () => number = Math.random): GameState {
  const n = config.mode === "2v2" ? 4 : 2; // RN09
  const names = BOT_NAMES.slice().sort(() => rand() - 0.5);
  const players: Player[] = Array.from({ length: n }, (_, i) => ({
    index: i,
    name: i === 0 ? config.playerName || "Você" : names[i - 1],
    team: (i % 2) as Team, // RN10: parceiros frente a frente (0–2, 1–3)
    isBot: i !== 0,
    hand: [],
    avatarHue: i === 0 ? 140 : Math.floor(rand() * 360),
    aggression: 0.8 + rand() * 0.45,
    bluff: 0.04 + rand() * 0.1,
  }));
  const dealer = Math.floor(rand() * n); // RN12
  const s: GameState = {
    phase: "dealing",
    config,
    players,
    score: [0, 0],
    gamesWon: [0, 0],
    gameNumber: 1,
    handNumber: 0,
    dealer,
    cutter: (dealer - 1 + n) % n,
    vira: null,
    manilha: null,
    handType: "normal",
    onzeTeam: null,
    handValue: 1,
    pendingBet: null,
    lastBetTeam: null,
    turn: (dealer + 1) % n,
    roundStarter: (dealer + 1) % n,
    roundIndex: 0,
    table: [],
    rounds: [],
    handResult: null,
    history: [],
    log: [],
    signals: [],
    shout: null,
    lastGameWinner: null,
    matchWinner: null,
    seq: 1,
  };
  return log(s, `Partida ${config.mode === "2v2" ? "2×2" : "1×1"} criada. ${players[dealer].name} foi sorteado para embaralhar.`, "game");
}

// ───────────────────────────── helpers ─────────────────────────────

function log(s: GameState, text: string, kind: LogEntry["kind"] = "info"): GameState {
  const entry: LogEntry = { id: s.seq, text, kind };
  return { ...s, seq: s.seq + 1, log: [...s.log.slice(-199), entry] };
}

function shout(s: GameState, player: number, text: string): GameState {
  return { ...s, shout: { player, text, id: s.seq }, seq: s.seq + 1 };
}

const VERBS = {
  correu: ["correu", "corremos", "correram"],
  desistiu: ["desistiu", "desistimos", "desistiram"],
  decidiu: ["decidiu", "decidimos", "decidiram"],
  ganhou: ["ganhou", "ganhamos", "ganharam"],
  venceu: ["venceu", "vencemos", "venceram"],
  leva: ["leva", "levamos", "levam"],
  esta: ["está", "estamos", "estão"],
} as const;

/** Sujeito + verbo concordando: "Eles correram", "Nós corremos", "Juca correu". */
export function says(s: GameState, t: Team, v: keyof typeof VERBS): string {
  const forms = VERBS[v];
  const verb = s.config.mode === "1v1" ? forms[0] : t === 0 ? forms[1] : forms[2];
  return `${teamName(s, t)} ${verb}`;
}

export const teamName = (s: GameState, t: Team) =>
  t === 0 ? (s.config.mode === "2v2" ? "Nós" : s.players[0].name) : s.config.mode === "2v2" ? "Eles" : s.players[1].name;

// ───────────────────────────── UC04–UC06 / UC18 ─────────────────────────────

function deal(s0: GameState, deck: Card[], cutAt: number): GameState {
  if (s0.phase !== "dealing") return s0;
  if (deck.length !== 40) return log(s0, "Baralho incompleto — distribuição bloqueada (UC04 E1).", "penalty");

  const n = s0.players.length;
  // UC18 — passa o pé para a direita (RN13), exceto na primeira mão da partida.
  const dealer = s0.handNumber === 0 ? s0.dealer : (s0.dealer + 1) % n;
  const cutter = (dealer - 1 + n) % n; // RN14
  const cards = cut(deck, cutAt);

  // RN15 — 3 cartas a cada um, uma a uma, começando à direita do embaralhador.
  const hands: Card[][] = Array.from({ length: n }, () => []);
  let k = 0;
  for (let r = 0; r < 3; r++) {
    for (let j = 1; j <= n; j++) hands[(dealer + j) % n].push(cards[k++]);
  }
  const vira = cards[k]; // RN04
  const manilha = manilhaFor(vira.rank); // RN05

  const [a, b] = s0.score;
  let handType: HandType = "normal";
  let onzeTeam: Team | null = null;
  if (a === 11 && b === 11) handType = "ferro"; // RN38
  else if (a === 11 || b === 11) {
    handType = "onze"; // RN35
    onzeTeam = a === 11 ? 0 : 1;
  }

  const first = (dealer + 1) % n; // RN17
  let s: GameState = {
    ...s0,
    players: s0.players.map((p, i) => ({ ...p, hand: hands[i] })),
    dealer,
    cutter,
    vira,
    manilha,
    handType,
    onzeTeam,
    handValue: 1, // RN27
    pendingBet: null,
    lastBetTeam: null,
    turn: first,
    roundStarter: first,
    roundIndex: 0,
    table: [],
    rounds: [],
    handResult: null,
    signals: [],
    shout: null,
    handNumber: s0.handNumber + 1,
    phase: handType === "onze" ? "onzeDecision" : "playing",
  };

  s = log(s, `Mão ${s.handNumber}: ${s.players[dealer].name} embaralhou, ${s.players[cutter].name} cortou.`, "info");
  s = log(s, `Vira: ${cardLabel(vira)} → manilha é ${manilha} (Zap ${manilha}♣, Copas ${manilha}♥, Espadilha ${manilha}♠, Pica-fumo ${manilha}♦).`, "info");
  if (handType === "onze") s = log(s, `Mão de onze para ${teamName(s, onzeTeam!)}! Truco proibido nesta mão.`, "game");
  if (handType === "ferro")
    s = log(s, s.config.ironHandBlind ? "MÃO DE FERRO! 11 × 11 — cartas às cegas, quem vencer leva o jogo." : "Mão de ferro: 11 × 11 — quem vencer leva o jogo.", "game");
  return s;
}

// ───────────────────────────── UC15 ─────────────────────────────

function onzeDecision(s0: GameState, play: boolean): GameState {
  if (s0.phase !== "onzeDecision" || s0.onzeTeam === null) return s0;
  const t = s0.onzeTeam;
  const speaker = s0.players.find((p) => p.team === t)!.index;
  if (play) {
    let s: GameState = { ...s0, handValue: 3, phase: "playing" }; // RN36
    s = shout(s, speaker, "VAMOS JOGAR!");
    return log(s, `${says(s, t, "decidiu")} jogar a mão de onze — vale 3 pontos.`, "bet");
  }
  let s = shout(s0, speaker, "CORRO!");
  s = log(s, `${says(s, t, "correu")} da mão de onze.`, "bet");
  return finishHand(s, other(t), 1, `${says(s, t, "correu")} da mão de onze`); // RN36
}

// ───────────────────────────── UC07 / UC08 / UC09 / UC10 ─────────────────────────────

function playCard(s0: GameState, player: number, cardId: string, coveredReq: boolean): GameState {
  if (s0.phase !== "playing") return s0; // UC07 E2 (pedido pendente) / mão encerrada
  if (s0.turn !== player) return s0; // UC07 E1 / UC20 — no sistema digital a jogada é bloqueada
  const p = s0.players[player];
  const card = p.hand.find((c) => c.id === cardId);
  if (!card) return s0; // UC07 E3
  if (coveredReq && !canCover(s0)) return s0; // UC08 E1 / RN26
  const covered = coveredReq;

  const players = s0.players.map((pl) =>
    pl.index === player ? { ...pl, hand: pl.hand.filter((c) => c.id !== cardId) } : pl,
  );
  const table = [...s0.table, { player, card, covered }];
  let s: GameState = { ...s0, players, table };
  s = log(s, `${p.name} jogou ${covered ? "uma carta coberta" : cardLabel(card, s.manilha)}.`, "info");

  if (table.length < s.players.length) return { ...s, turn: nextPlayer(s, player) };

  // UC09 — todos jogaram: resolve a rodada.
  const out = resolveRound(table, s.manilha, (i) => teamOf(s, i));
  const rounds = [...s.rounds, { plays: table, result: out.result, winnerPlayer: out.winnerPlayer }];
  s = { ...s, rounds };
  const rn = s.roundIndex + 1;
  s = log(
    s,
    out.result === "tie"
      ? `${rn}ª rodada: cangou (empate)!`
      : `${rn}ª rodada: ${s.players[out.winnerPlayer!].name} fez (${teamName(s, out.result)}).`,
    "round",
  );

  // UC10 — a mão está decidida?
  const dec = resolveHand(rounds.map((r) => r.result));
  if (dec.decided) {
    if (dec.winner === null) return finishHand(s, null, 0, "três rodadas empatadas"); // RN25e
    return finishHand(s, dec.winner, s.handValue, "rodadas vencidas");
  }
  return { ...s, phase: "roundEnd" };
}

function nextRound(s: GameState): GameState {
  const last = s.rounds[s.rounds.length - 1];
  // RN23 — vencedor inicia; em empate, quem iniciou a rodada empatada.
  const starter = last.winnerPlayer ?? s.roundStarter;
  return { ...s, phase: "playing", table: [], roundIndex: s.roundIndex + 1, turn: starter, roundStarter: starter };
}

// ───────────────────────────── UC17 ─────────────────────────────

function finishHand(s0: GameState, winner: Team | null, points: number, reason: string): GameState {
  let pts = points;
  // RN38 — mão de ferro: quem vence leva o jogo.
  if (s0.handType === "ferro" && winner !== null) pts = WIN_SCORE - s0.score[winner];
  const score: [number, number] = [...s0.score];
  if (winner !== null) score[winner] = Math.min(WIN_SCORE, score[winner] + pts); // RN39
  const result = { winner, points: winner === null ? 0 : pts, reason };
  let s: GameState = {
    ...s0,
    score,
    pendingBet: null,
    handResult: result,
    phase: "handEnd",
    history: [
      ...s0.history,
      {
        number: s0.handNumber,
        vira: s0.vira!,
        manilha: s0.manilha!,
        rounds: s0.rounds.map((r) => ({ plays: r.plays, result: r.result })),
        value: s0.handValue,
        result,
      },
    ],
  };
  s = log(
    s,
    winner === null
      ? "Mão sem pontos: três empates."
      : `${says(s, winner, "ganhou")} ${pts} ponto${pts > 1 ? "s" : ""} (${reason}). Placar ${score[0]} × ${score[1]}.`,
    "hand",
  );
  return s;
}

// ───────────────────────────── UC19 ─────────────────────────────

function next(s: GameState): GameState {
  if (s.phase === "roundEnd") return nextRound(s);
  if (s.phase === "handEnd") {
    const w: Team | null = s.score[0] >= WIN_SCORE ? 0 : s.score[1] >= WIN_SCORE ? 1 : null;
    if (w === null) return { ...s, phase: "dealing", shout: null };
    const gamesWon: [number, number] = [...s.gamesWon];
    gamesWon[w]++;
    const need = s.config.bestOf === 3 ? 2 : 1; // RN41
    let out: GameState = { ...s, gamesWon, lastGameWinner: w, shout: null };
    out = log(out, `${says(out, w, "venceu")} o jogo ${s.gameNumber}!`, "game");
    if (gamesWon[w] >= need) {
      out = log(out, `${says(out, w, "venceu")} a partida!`, "game");
      return { ...out, phase: "matchOver", matchWinner: w };
    }
    return { ...out, phase: "gameOver" };
  }
  if (s.phase === "gameOver") {
    const out = { ...s, score: [0, 0] as [number, number], gameNumber: s.gameNumber + 1, phase: "dealing" as const };
    return log(out, `Começa o jogo ${out.gameNumber} da queda.`, "game");
  }
  return s;
}

// ───────────────────────────── UC11–UC14 / UC20 ─────────────────────────────

function askBet(s0: GameState, player: number): GameState {
  // UC20 / RN37 — pedir truco na mão de onze é infração.
  if (s0.handType === "onze" && s0.phase === "playing" && s0.turn === player) {
    const t = teamOf(s0, player);
    let s = log(s0, `INFRAÇÃO: ${s0.players[player].name} pediu truco na mão de onze (RN37).`, "penalty");
    s = shout(s, player, "TRUCO?!");
    if (s.config.onzePenalty === "loseGame") {
      return finishHand(s, other(t), WIN_SCORE - s.score[other(t)], "infração: truco na mão de onze");
    }
    return finishHand(s, other(t), 3, "infração: truco na mão de onze");
  }
  if (!canAskBet(s0, player)) return s0;
  const value = nextBetValue(s0.handValue)!;
  const byTeam = teamOf(s0, player);
  let s: GameState = { ...s0, pendingBet: { value, byTeam, byPlayer: player }, phase: "betResponse" };
  s = shout(s, player, `${BET_NAME[value].toUpperCase()}!`);
  return log(s, `${s.players[player].name} pediu ${BET_NAME[value]}! (vale ${value})`, "bet");
}

function respondBet(s0: GameState, player: number, response: "accept" | "raise" | "run"): GameState {
  if (!canRespondBet(s0, player)) return s0;
  const bet = s0.pendingBet!;
  const name = s0.players[player].name;

  if (response === "accept") {
    let s: GameState = { ...s0, handValue: bet.value, lastBetTeam: bet.byTeam, pendingBet: null, phase: "playing" };
    s = shout(s, player, bet.value === 3 ? "DESCE!" : "ACEITO!");
    return log(s, `${name} aceitou. A mão vale ${bet.value}.`, "bet");
  }

  if (response === "raise") {
    if (!canRaisePending(s0, player)) return s0;
    const value = nextBetValue(bet.value)!;
    const byTeam = teamOf(s0, player);
    // RN31 — aumentar aceita implicitamente o pedido anterior.
    let s: GameState = {
      ...s0,
      handValue: bet.value,
      lastBetTeam: bet.byTeam,
      pendingBet: { value, byTeam, byPlayer: player },
    };
    s = shout(s, player, `${BET_NAME[value].toUpperCase()}!`);
    return log(s, `${name} aceitou e pediu ${BET_NAME[value]}! (vale ${value})`, "bet");
  }

  // RN33 — correr: quem pediu leva o valor vigente antes do pedido.
  let s = shout(s0, player, "CORRO!");
  s = log(s, `${name} correu do ${BET_NAME[bet.value]}.`, "bet");
  return finishHand(s, bet.byTeam, s0.handValue, `${says(s, other(bet.byTeam), "correu")} do ${BET_NAME[bet.value]}`);
}

function fold(s0: GameState, player: number): GameState {
  if (!canFold(s0, player)) return s0;
  const t = teamOf(s0, player);
  let s = shout(s0, player, "CORRO!");
  s = log(s, `${s0.players[player].name} desistiu da mão.`, "bet");
  return finishHand(s, other(t), s0.handValue, `${says(s, t, "desistiu")} da mão`); // RN34
}

// ───────────────────────────── UC22 ─────────────────────────────

function signal(s0: GameState, from: number, kind: SignalKind, seenBy: number[]): GameState {
  if (s0.config.mode !== "2v2") return s0;
  if (!["playing", "betResponse", "onzeDecision"].includes(s0.phase)) return s0;
  const to = (from + 2) % 4;
  const ev = { from, to, kind, seenBy, id: s0.seq };
  let s: GameState = { ...s0, signals: [...s0.signals, ev], seq: s0.seq + 1 };
  const g = SIGNAL_LABEL[kind];
  // O log mostra ao humano apenas o que ele teria como perceber.
  if (from === 0) s = log(s, `Você ${g.gesture} para ${s.players[to].name} (${g.label}).${seenBy.length ? " Opa, os adversários perceberam!" : ""}`, "signal");
  else if (to === 0) s = log(s, `${s.players[from].name} ${g.gesture} pra você → ${g.label}.`, "signal");
  else if (seenBy.includes(0)) s = log(s, `Você flagrou ${s.players[from].name}: ${g.gesture} → ${g.label}!`, "signal");
  return s;
}

// ───────────────────────────── redutor ─────────────────────────────

export function reducer(s: GameState, a: Action): GameState {
  switch (a.type) {
    case "LOAD":
      return a.state;
    case "DEAL":
      return deal(s, a.deck, a.cutAt);
    case "ONZE_DECISION":
      return onzeDecision(s, a.play);
    case "PLAY_CARD":
      return playCard(s, a.player, a.cardId, a.covered);
    case "ASK_BET":
      return askBet(s, a.player);
    case "RESPOND_BET":
      return respondBet(s, a.player, a.response);
    case "FOLD":
      return fold(s, a.player);
    case "SIGNAL":
      return signal(s, a.from, a.kind, a.seenBy);
    case "NEXT":
      return next(s);
    case "CLEAR_SHOUT":
      return s.shout ? { ...s, shout: null } : s;
    default:
      return s;
  }
}

export { SUIT_SYMBOL, MANILHA_NAME };
