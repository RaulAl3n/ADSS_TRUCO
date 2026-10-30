import { decideBotAction } from "@/lib/truco/bot";
import { reducer } from "@/lib/truco/engine";
import { canCover } from "@/lib/truco/rules";
import type { Action } from "@/lib/truco/engine";
import type { GameState } from "@/lib/truco/types";
import { mulberry32, newMatch, randomDeal } from "./helpers";
import { it } from "vitest";

function randomAction(s: GameState, rand: () => number): Action {
  if (s.phase === "onzeDecision") return { type: "ONZE_DECISION", play: true };
  if (s.phase === "betResponse") {
    const p = s.players.find((x) => x.team !== s.pendingBet!.byTeam)!.index;
    return { type: "RESPOND_BET", player: p, response: "accept" };
  }
  const h = s.players[s.turn].hand;
  return { type: "PLAY_CARD", player: s.turn, cardId: h[Math.floor(rand() * h.length)].id, covered: false };
}

it("smart vs random", () => {
  for (const mode of ["1v1", "2v2"] as const) {
    const wins = [0, 0];
    for (let g = 0; g < 60; g++) {
      const rand = mulberry32(g + 77);
      let s = newMatch({ mode }, g + 77, true);
      while (s.phase !== "matchOver") {
        if (s.phase === "dealing") { s = randomDeal(s, rand); continue; }
        if (["roundEnd", "handEnd", "gameOver"].includes(s.phase)) { s = reducer(s, { type: "NEXT" }); continue; }
        const smartTurn =
          s.phase === "playing" ? s.players[s.turn].team === 0 :
          s.phase === "betResponse" ? s.pendingBet!.byTeam === 1 :
          s.onzeTeam === 0;
        s = reducer(s, smartTurn ? decideBotAction(s, rand)! : randomAction(s, rand));
      }
      wins[s.matchWinner!]++;
    }
    console.log(mode, "smart wins", wins[0], "random wins", wins[1]);
  }
}, 120000);
