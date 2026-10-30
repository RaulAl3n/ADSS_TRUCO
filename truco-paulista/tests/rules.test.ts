import { describe, expect, it } from "vitest";
import { cardStrength, createDeck, manilhaFor } from "@/lib/truco/cards";
import { reducer } from "@/lib/truco/engine";
import { resolveHand, resolveRound, valueBefore } from "@/lib/truco/rules";
import type { GameState } from "@/lib/truco/types";
import { c, dealRigged, newMatch } from "./helpers";

describe("Baralho e cartas (RN01–RN08)", () => {
  it("RN01: 40 cartas sem 8, 9, 10", () => {
    const d = createDeck();
    expect(d).toHaveLength(40);
    expect(new Set(d.map((x) => x.id)).size).toBe(40);
  });
  it("RN05: tabela vira → manilha", () => {
    const pairs: [string, string][] = [["4","5"],["5","6"],["6","7"],["7","Q"],["Q","J"],["J","K"],["K","A"],["A","2"],["2","3"],["3","4"]];
    for (const [v, m] of pairs) expect(manilhaFor(v as any)).toBe(m);
  });
  it("RN02/RN03: ordem das comuns e naipe não desempata", () => {
    const m = "5"; // vira 4
    expect(cardStrength(c("3","ouros"), m)).toBeGreaterThan(cardStrength(c("2","paus"), m));
    expect(cardStrength(c("A","ouros"), m)).toBeGreaterThan(cardStrength(c("K","paus"), m));
    expect(cardStrength(c("K","ouros"), m)).toBeGreaterThan(cardStrength(c("J","paus"), m));
    expect(cardStrength(c("J","ouros"), m)).toBeGreaterThan(cardStrength(c("Q","paus"), m));
    expect(cardStrength(c("Q","ouros"), m)).toBeGreaterThan(cardStrength(c("7","paus"), m));
    expect(cardStrength(c("3","ouros"), m)).toBe(cardStrength(c("3","paus"), m));
  });
  it("RN06/RN07: Zap > Copas > Espadilha > Pica-fumo > qualquer comum", () => {
    const m = "4"; // vira 3
    const zap = cardStrength(c("4","paus"), m), cop = cardStrength(c("4","copas"), m);
    const esp = cardStrength(c("4","espadas"), m), pic = cardStrength(c("4","ouros"), m);
    expect(zap).toBeGreaterThan(cop);
    expect(cop).toBeGreaterThan(esp);
    expect(esp).toBeGreaterThan(pic);
    expect(pic).toBeGreaterThan(cardStrength(c("3","paus"), m));
  });
  it("RN26: carta coberta perde para qualquer carta", () => {
    expect(cardStrength(c("3","paus"), "5", true)).toBeLessThan(cardStrength(c("4","ouros"), "5"));
  });
});

describe("Rodada e mão (RN20–RN25)", () => {
  const team = (p: number) => (p % 2) as 0 | 1;
  it("RN21: empate entre parceiros = vitória da equipe", () => {
    const r = resolveRound([
      { player: 0, card: c("3","ouros"), covered: false },
      { player: 1, card: c("2","ouros"), covered: false },
      { player: 2, card: c("3","paus"), covered: false },
      { player: 3, card: c("A","ouros"), covered: false },
    ], "5", team);
    expect(r.result).toBe(0);
    expect(r.winnerPlayer).toBe(0);
  });
  it("RN22: empate entre equipes = cangou", () => {
    const r = resolveRound([
      { player: 0, card: c("3","ouros"), covered: false },
      { player: 1, card: c("3","paus"), covered: false },
    ], "5", team);
    expect(r.result).toBe("tie");
  });
  it("RN24/RN25: todos os casos de decisão da mão", () => {
    expect(resolveHand([0, 0])).toEqual({ decided: true, winner: 0 });
    expect(resolveHand([0, 1])).toEqual({ decided: false });
    expect(resolveHand(["tie", 1])).toEqual({ decided: true, winner: 1 }); // a
    expect(resolveHand(["tie", "tie"])).toEqual({ decided: false });
    expect(resolveHand(["tie", "tie", 0])).toEqual({ decided: true, winner: 0 }); // b
    expect(resolveHand([1, "tie"])).toEqual({ decided: true, winner: 1 }); // c
    expect(resolveHand([0, 1, "tie"])).toEqual({ decided: true, winner: 0 }); // d
    expect(resolveHand(["tie", "tie", "tie"])).toEqual({ decided: true, winner: null }); // e
    expect(resolveHand([0, 1, 1])).toEqual({ decided: true, winner: 1 });
  });
  it("RN33: valor recebido ao correr", () => {
    expect([3, 6, 9, 12].map(valueBefore)).toEqual([1, 3, 6, 9]);
  });
});

/** Utilitário: joga a carta de índice i do jogador da vez. */
const play = (s: GameState, i = 0, covered = false) =>
  reducer(s, { type: "PLAY_CARD", player: s.turn, cardId: s.players[s.turn].hand[i].id, covered });

describe("Fluxo da mão (UC05–UC10, UC18)", () => {
  it("RN15/RN17: 3 cartas por jogador, vira exposta, começa quem está à direita do pé", () => {
    let s = newMatch({ mode: "2v2" }, 7);
    const d = s.dealer;
    s = reducer(s, { type: "DEAL", deck: createDeck(), cutAt: 5 });
    expect(s.players.every((p) => p.hand.length === 3)).toBe(true);
    expect(s.vira).not.toBeNull();
    expect(s.turn).toBe((d + 1) % 4);
    expect(s.phase).toBe("playing");
    expect(s.handValue).toBe(1);
  });
  it("UC04 E1: baralho incompleto bloqueia a distribuição", () => {
    const s = newMatch({}, 1);
    const out = reducer(s, { type: "DEAL", deck: createDeck().slice(1), cutAt: 3 });
    expect(out.phase).toBe("dealing");
  });
  it("RN18: não é permitido jogar fora da vez", () => {
    let s = newMatch({ mode: "1v1" }, 3);
    s = reducer(s, { type: "DEAL", deck: createDeck(), cutAt: 5 });
    const notTurn = (s.turn + 1) % 2;
    const out = reducer(s, { type: "PLAY_CARD", player: notTurn, cardId: s.players[notTurn].hand[0].id, covered: false });
    expect(out).toBe(s);
  });
  it("RN26: carta coberta bloqueada na 1ª rodada", () => {
    let s = newMatch({ mode: "1v1" }, 3);
    s = reducer(s, { type: "DEAL", deck: createDeck(), cutAt: 5 });
    expect(play(s, 0, true)).toBe(s);
  });
  it("Mão decidida em 2 rodadas pontua 1 e não joga a 3ª (RN24/RN27)", () => {
    let s = newMatch({ mode: "1v1" }, 2);
    // vira 4 → manilha 5. Jogador "mão" recebe 3,3,2; o outro 4,4,6.
    const first = (s.dealer + 1) % 2;
    const hands = [] as any[];
    hands[first] = [c("3","ouros"), c("3","copas"), c("2","ouros")];
    hands[1 - first] = [c("4","copas"), c("4","espadas"), c("6","ouros")];
    s = dealRigged(s, hands, c("4","ouros"));
    expect(s.manilha).toBe("5");
    s = play(s); s = play(s);
    expect(s.phase).toBe("roundEnd");
    s = reducer(s, { type: "NEXT" });
    expect(s.turn).toBe(first);
    s = play(s); s = play(s);
    expect(s.phase).toBe("handEnd");
    expect(s.score[s.players[first].team]).toBe(1);
    expect(s.players[0].hand.length).toBe(1);
    s = reducer(s, { type: "NEXT" });
    expect(s.phase).toBe("dealing");
  });
  it("RN13: o pé passa para a direita a cada mão", () => {
    let s = newMatch({ mode: "2v2" }, 9);
    s = reducer(s, { type: "DEAL", deck: createDeck(), cutAt: 3 });
    const d1 = s.dealer;
    s = reducer(s, { type: "FOLD", player: s.turn });
    s = reducer(s, { type: "NEXT" });
    s = reducer(s, { type: "DEAL", deck: createDeck(), cutAt: 3 });
    expect(s.dealer).toBe((d1 + 1) % 4);
  });
});

describe("Apostas (UC11–UC14, RN28–RN34)", () => {
  const start = () => reducer(newMatch({ mode: "1v1" }, 4), { type: "DEAL", deck: createDeck(), cutAt: 7 });

  it("Truco aceito → vale 3; mesma equipe não pode pedir o seis (RN32)", () => {
    let s = start();
    const a = s.turn, b = (a + 1) % 2;
    s = reducer(s, { type: "ASK_BET", player: a });
    expect(s.phase).toBe("betResponse");
    expect(reducer(s, { type: "PLAY_CARD", player: a, cardId: s.players[a].hand[0].id, covered: false })).toBe(s); // RN30
    s = reducer(s, { type: "RESPOND_BET", player: b, response: "accept" });
    expect(s.handValue).toBe(3);
    expect(s.turn).toBe(a);
    expect(reducer(s, { type: "ASK_BET", player: a })).toBe(s);
    s = play(s); // a joga; vez de b
    s = reducer(s, { type: "ASK_BET", player: b });
    expect(s.pendingBet?.value).toBe(6);
  });
  it("Correr do truco dá 1; correr do seis dá 3 (RN33)", () => {
    let s = start();
    const a = s.turn, b = (a + 1) % 2;
    const ta = s.players[a].team, tb = s.players[b].team;
    let t = reducer(s, { type: "ASK_BET", player: a });
    t = reducer(t, { type: "RESPOND_BET", player: b, response: "run" });
    expect(t.score[ta]).toBe(1);

    s = reducer(s, { type: "ASK_BET", player: a });
    s = reducer(s, { type: "RESPOND_BET", player: b, response: "raise" }); // seis
    expect(s.pendingBet?.value).toBe(6);
    expect(s.handValue).toBe(3);
    s = reducer(s, { type: "RESPOND_BET", player: a, response: "run" });
    expect(s.score[tb]).toBe(3);
  });
  it("Escada até doze e não passa de 12 (RN28)", () => {
    let s = start();
    const a = s.turn, b = (a + 1) % 2;
    s = reducer(s, { type: "ASK_BET", player: a });
    s = reducer(s, { type: "RESPOND_BET", player: b, response: "raise" });
    s = reducer(s, { type: "RESPOND_BET", player: a, response: "raise" });
    s = reducer(s, { type: "RESPOND_BET", player: b, response: "raise" });
    expect(s.pendingBet?.value).toBe(12);
    expect(reducer(s, { type: "RESPOND_BET", player: a, response: "raise" })).toBe(s);
    s = reducer(s, { type: "RESPOND_BET", player: a, response: "accept" });
    expect(s.handValue).toBe(12);
  });
  it("Desistir sem pedido dá o valor vigente (RN34)", () => {
    let s = start();
    const a = s.turn;
    s = reducer(s, { type: "FOLD", player: a });
    expect(s.score[1 - s.players[a].team]).toBe(1);
  });
});

describe("Situações especiais (UC15, UC16, UC19, UC20)", () => {
  it("Mão de onze: jogar vale 3; correr dá 1 ao adversário (RN35/RN36)", () => {
    let s = newMatch({ mode: "2v2" }, 5);
    s = { ...s, score: [11, 4] };
    s = reducer(s, { type: "DEAL", deck: createDeck(), cutAt: 2 });
    expect(s.phase).toBe("onzeDecision");
    expect(s.handType).toBe("onze");
    const run = reducer(s, { type: "ONZE_DECISION", play: false });
    expect(run.score).toEqual([11, 5]);
    const p = reducer(s, { type: "ONZE_DECISION", play: true });
    expect(p.handValue).toBe(3);
    expect(p.phase).toBe("playing");
  });
  it("RN37/UC20: truco na mão de onze é infração", () => {
    let s = newMatch({ mode: "1v1" }, 5);
    s = { ...s, score: [3, 11] };
    s = reducer(s, { type: "DEAL", deck: createDeck(), cutAt: 2 });
    s = reducer(s, { type: "ONZE_DECISION", play: true });
    const offender = s.turn;
    const t = s.players[offender].team;
    const out = reducer(s, { type: "ASK_BET", player: offender });
    expect(out.phase).toBe("handEnd");
    expect(out.handResult?.winner).toBe(1 - t);
    expect(out.handResult?.points).toBe(3);
  });
  it("Mão de ferro: vencedor leva o jogo; truco e correr bloqueados (RN38)", () => {
    let s = newMatch({ mode: "1v1" }, 6);
    s = { ...s, score: [11, 11] };
    s = reducer(s, { type: "DEAL", deck: createDeck(), cutAt: 2 });
    expect(s.handType).toBe("ferro");
    expect(reducer(s, { type: "ASK_BET", player: s.turn })).toBe(s);
    expect(reducer(s, { type: "FOLD", player: s.turn })).toBe(s);
    while (s.phase === "playing" || s.phase === "roundEnd") s = s.phase === "roundEnd" ? reducer(s, { type: "NEXT" }) : play(s);
    if (s.handResult?.winner !== null) {
      expect(Math.max(...s.score)).toBe(12);
      s = reducer(s, { type: "NEXT" });
      expect(s.phase).toBe("matchOver");
    }
  });
  it("Queda melhor de 3 (RN41)", () => {
    let s = newMatch({ mode: "1v1", bestOf: 3 }, 8);
    s = { ...s, score: [12, 0], phase: "handEnd" };
    s = reducer(s, { type: "NEXT" });
    expect(s.phase).toBe("gameOver");
    expect(s.gamesWon).toEqual([1, 0]);
    s = reducer(s, { type: "NEXT" });
    expect(s.score).toEqual([0, 0]);
    expect(s.phase).toBe("dealing");
  });
});
