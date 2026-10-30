// Simula partidas inteiras só com bots para garantir que o motor nunca trava
// e que as invariantes das regras se mantêm.
import { describe, expect, it } from "vitest";
import { decideBotAction } from "@/lib/truco/bot";
import { reducer } from "@/lib/truco/engine";
import type { GameState } from "@/lib/truco/types";
import { mulberry32, newMatch, randomDeal } from "./helpers";

function runMatch(mode: "1v1" | "2v2", seed: number, bestOf: 1 | 3 = 1) {
  const rand = mulberry32(seed);
  let s: GameState = newMatch({ mode, bestOf }, seed, true);
  let steps = 0;
  const stats = { hands: 0, bets: 0, onze: 0, ferro: 0, covered: 0 };
  while (s.phase !== "matchOver") {
    if (++steps > 20000) throw new Error("partida travou");
    const before = s;
    if (s.phase === "dealing") {
      s = randomDeal(s, rand);
      stats.hands++;
      if (s.handType === "onze") stats.onze++;
      if (s.handType === "ferro") stats.ferro++;
      // invariantes de distribuição
      expect(s.players.every((p) => p.hand.length === 3)).toBe(true);
      const ids = new Set([s.vira!.id, ...s.players.flatMap((p) => p.hand.map((c) => c.id))]);
      expect(ids.size).toBe(s.players.length * 3 + 1);
      continue;
    }
    if (s.phase === "roundEnd" || s.phase === "handEnd" || s.phase === "gameOver") {
      s = reducer(s, { type: "NEXT" });
      continue;
    }
    const a = decideBotAction(s, rand);
    if (!a) throw new Error(`nenhuma ação na fase ${s.phase}`);
    if (a.type === "ASK_BET" || (a.type === "RESPOND_BET" && a.response === "raise")) stats.bets++;
    if (a.type === "PLAY_CARD" && a.covered) stats.covered++;
    s = reducer(s, a);
    if (s === before) throw new Error(`ação inválida do bot: ${JSON.stringify(a)} em ${s.phase}`);
    // invariantes
    expect(s.score[0]).toBeLessThanOrEqual(12);
    expect(s.score[1]).toBeLessThanOrEqual(12);
    expect([1, 3, 6, 9, 12]).toContain(s.handValue);
    if (s.handType !== "normal") expect(s.pendingBet).toBeNull();
  }
  return { s, stats };
}

describe("Simulação bot × bot", () => {
  it("200 partidas 1×1 terminam sem travar", () => {
    const wins = [0, 0];
    const tot = { hands: 0, bets: 0, onze: 0, ferro: 0, covered: 0 };
    for (let i = 0; i < 200; i++) {
      const { s, stats } = runMatch("1v1", 1000 + i);
      wins[s.matchWinner!]++;
      for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += stats[k];
    }
    console.log("1v1", { wins, ...tot });
    expect(wins[0] + wins[1]).toBe(200);
    expect(tot.bets).toBeGreaterThan(0);
    expect(tot.onze).toBeGreaterThan(0);
  }, 120_000);

  it("100 partidas 2×2 (queda melhor de 3) terminam sem travar", () => {
    const tot = { hands: 0, bets: 0, onze: 0, ferro: 0, covered: 0 };
    for (let i = 0; i < 100; i++) {
      const { s, stats } = runMatch("2v2", 5000 + i, 3);
      expect(Math.max(...s.gamesWon)).toBe(2);
      for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += stats[k];
    }
    console.log("2v2", tot);
    expect(tot.ferro).toBeGreaterThan(0);
  }, 240_000);
});
