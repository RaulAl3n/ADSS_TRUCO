import { createDeck, shuffle } from "@/lib/truco/cards";
import { createMatch, DEFAULT_CONFIG, reducer } from "@/lib/truco/engine";
import type { Card, Config, GameState, Rank, Suit } from "@/lib/truco/types";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const c = (rank: Rank, suit: Suit): Card => ({ id: `${rank}-${suit}`, rank, suit });

/**
 * Monta um baralho em que, após corte em 0 (sem efeito: cut usa no mínimo 1, então
 * usamos cutAt=40-1 e compensamos), cada jogador recebe exatamente as cartas dadas.
 */
export function riggedDeck(hands: Card[][], vira: Card, dealer: number): { deck: Card[]; cutAt: number } {
  const n = hands.length;
  const order: Card[] = [];
  for (let r = 0; r < 3; r++) for (let j = 1; j <= n; j++) order.push(hands[(dealer + j) % n][r]);
  order.push(vira);
  const used = new Set(order.map((x) => x.id));
  const rest = createDeck().filter((x) => !used.has(x.id));
  const target = [...order, ...rest];
  // cut(deck, k) = deck.slice(k).concat(deck.slice(0,k)). Para obter `target`
  // com k = 1, o deck de entrada deve ser [último de target, ...target sem o último].
  const deck = [target[target.length - 1], ...target.slice(0, -1)];
  return { deck, cutAt: 1 };
}

export function newMatch(cfg: Partial<Config> = {}, seed = 1, allBots = false): GameState {
  const s = createMatch({ ...DEFAULT_CONFIG, ...cfg }, mulberry32(seed));
  if (!allBots) return s;
  return { ...s, players: s.players.map((p) => ({ ...p, isBot: true })) };
}

export function dealRigged(s: GameState, hands: Card[][], vira: Card): GameState {
  const dealer = s.handNumber === 0 ? s.dealer : (s.dealer + 1) % s.players.length;
  const { deck, cutAt } = riggedDeck(hands, vira, dealer);
  return reducer(s, { type: "DEAL", deck, cutAt });
}

export function randomDeal(s: GameState, rand: () => number): GameState {
  return reducer(s, { type: "DEAL", deck: shuffle(createDeck(), rand), cutAt: 1 + Math.floor(rand() * 38) });
}
