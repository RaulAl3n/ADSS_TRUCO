// Tipos do domínio — Truco Paulista
// Referência: casos-de-uso-truco-paulista.md

export type Suit = "ouros" | "espadas" | "copas" | "paus";
export type Rank = "4" | "5" | "6" | "7" | "Q" | "J" | "K" | "A" | "2" | "3";

export interface Card {
  id: string; // ex.: "A-espadas"
  rank: Rank;
  suit: Suit;
}

export type Team = 0 | 1; // 0 = "Nós" (equipe do humano), 1 = "Eles"
export type Mode = "1v1" | "2v2";

export type RoundResult = Team | "tie";

/** Sinais entre parceiros (RN42 / UC22). */
export type SignalKind = "zap" | "copas" | "espadilha" | "picafumo" | "tres" | "nada";

export interface Player {
  index: number;
  name: string;
  team: Team;
  isBot: boolean;
  hand: Card[];
  avatarHue: number;
  /** Personalidade do bot: 0.7 (cauteloso) .. 1.3 (agressivo). */
  aggression: number;
  /** Probabilidade de blefar num pedido de truco. */
  bluff: number;
}

export interface PlayedCard {
  player: number;
  card: Card;
  covered: boolean;
}

export interface BetRequest {
  /** Valor proposto (3, 6, 9 ou 12). */
  value: number;
  byTeam: Team;
  byPlayer: number;
}

export type HandType = "normal" | "onze" | "ferro";

export type Phase =
  | "lobby"
  | "dealing" // UC04/UC05 — aguardando distribuição
  | "onzeDecision" // UC15
  | "playing" // UC07
  | "betResponse" // UC12/13/14
  | "roundEnd" // UC09 (pausa para exibir)
  | "handEnd" // UC10/UC17 (pausa para exibir)
  | "gameOver" // UC19 (fim de um jogo dentro da queda)
  | "matchOver"; // UC19 (fim da partida)

export interface Config {
  mode: Mode;
  playerName: string;
  /** RN26 — carta coberta a partir da 2ª rodada. */
  allowCovered: boolean;
  /** RN41 — queda melhor de 3. */
  bestOf: 1 | 3;
  /** RN37 — penalidade por truco na mão de onze. */
  onzePenalty: "loseHand" | "loseGame";
  /** RN38 — mão de ferro às cegas, valendo o jogo. */
  ironHandBlind: boolean;
}

export interface LogEntry {
  id: number;
  text: string;
  kind: "info" | "bet" | "round" | "hand" | "game" | "signal" | "penalty";
}

export interface HandResult {
  winner: Team | null;
  points: number;
  reason: string;
}

export interface HandHistory {
  number: number;
  vira: Card;
  manilha: Rank;
  rounds: { plays: PlayedCard[]; result: RoundResult }[];
  value: number;
  result: HandResult;
}

export interface SignalEvent {
  from: number;
  to: number;
  kind: SignalKind;
  /** Jogadores adversários que "viram" o sinal (UC22, item 2). */
  seenBy: number[];
  id: number;
}

export interface GameState {
  phase: Phase;
  config: Config;
  players: Player[];
  score: [number, number];
  gamesWon: [number, number];
  gameNumber: number;
  handNumber: number;

  dealer: number;
  cutter: number;
  vira: Card | null;
  manilha: Rank | null;
  handType: HandType;
  /** Equipe com 11 pontos na mão de onze. */
  onzeTeam: Team | null;

  /** Valor vigente da mão (RN27/RN28). */
  handValue: number;
  /** Pedido pendente (RN30). */
  pendingBet: BetRequest | null;
  /** Equipe que fez o último pedido aceito — não pode pedir o próximo (RN32). */
  lastBetTeam: Team | null;

  turn: number;
  roundStarter: number;
  roundIndex: number; // 0, 1, 2
  table: PlayedCard[];
  rounds: { plays: PlayedCard[]; result: RoundResult; winnerPlayer: number | null }[];

  handResult: HandResult | null;
  history: HandHistory[];
  log: LogEntry[];
  signals: SignalEvent[];
  /** Mensagem curta para exibir em destaque (TRUCO!, CORREU!, etc.). */
  shout: { player: number; text: string; id: number } | null;
  lastGameWinner: Team | null;
  matchWinner: Team | null;
  seq: number;
}
