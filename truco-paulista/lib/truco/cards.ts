// Baralho e força das cartas — RN01 a RN08
import type { Card, Rank, Suit } from "./types";

/** Sequência cíclica de valores, da mais fraca para a mais forte (RN02, RN05). */
export const RANKS: Rank[] = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];

/** Naipes em ordem crescente de força entre manilhas (RN06): Ouros < Espadas < Copas < Paus. */
export const SUITS: Suit[] = ["ouros", "espadas", "copas", "paus"];

export const SUIT_SYMBOL: Record<Suit, string> = {
  ouros: "♦",
  espadas: "♠",
  copas: "♥",
  paus: "♣",
};

export const MANILHA_NAME: Record<Suit, string> = {
  paus: "Zap",
  copas: "Copas",
  espadas: "Espadilha",
  ouros: "Pica-fumo",
};

export const RANK_LABEL: Record<Rank, string> = {
  "4": "4", "5": "5", "6": "6", "7": "7",
  Q: "Q", J: "J", K: "K", A: "A", "2": "2", "3": "3",
};

/** RN01 — baralho de 40 cartas (sem 8, 9, 10 e coringas). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ id: `${rank}-${suit}`, rank, suit });
  }
  return deck;
}

/** Fisher–Yates com gerador injetável (permite testes determinísticos). */
export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** RN14 — corte: o monte é dividido e a metade de baixo vai para cima. */
export function cut<T>(deck: T[], at: number): T[] {
  const k = Math.max(1, Math.min(deck.length - 1, at));
  return deck.slice(k).concat(deck.slice(0, k));
}

/** RN05 — manilha = valor imediatamente acima da vira (cíclico). */
export function manilhaFor(vira: Rank): Rank {
  return RANKS[(RANKS.indexOf(vira) + 1) % RANKS.length];
}

export function isManilha(card: Card, manilha: Rank | null): boolean {
  return manilha !== null && card.rank === manilha;
}

/**
 * Força de uma carta na mão corrente.
 * - Carta coberta: -1 (RN26)
 * - Comum: 0..9 pela ordem da RN02; naipe não desempata (RN03)
 * - Manilha: 100 + força do naipe (RN06, RN07) — sempre acima das comuns
 */
export function cardStrength(card: Card, manilha: Rank | null, covered = false): number {
  if (covered) return -1;
  if (isManilha(card, manilha)) return 100 + SUITS.indexOf(card.suit);
  return RANKS.indexOf(card.rank);
}

/**
 * Poder relativo da carta em [0,1], usado pela IA.
 * Considera RN08: o valor que virou manilha sai da sequência comum.
 */
export function cardPower(card: Card, manilha: Rank | null): number {
  if (isManilha(card, manilha)) return 0.86 + SUITS.indexOf(card.suit) * 0.045; // Zap ≈ 0.995
  const commons = RANKS.filter((r) => r !== manilha);
  const i = commons.indexOf(card.rank);
  return (i / (commons.length - 1)) * 0.78; // 3 ≈ 0.78
}

export function cardLabel(card: Card, manilha?: Rank | null): string {
  const base = `${RANK_LABEL[card.rank]}${SUIT_SYMBOL[card.suit]}`;
  if (manilha && isManilha(card, manilha)) return `${base} (${MANILHA_NAME[card.suit]})`;
  return base;
}
