"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { chooseSignal, decideBotAction, pendingBotActor } from "@/lib/truco/bot";
import { createDeck, shuffle } from "@/lib/truco/cards";
import { createMatch, DEFAULT_CONFIG, reducer } from "@/lib/truco/engine";
import type { Config, GameState, SignalKind } from "@/lib/truco/types";

const LOBBY: GameState = { ...createMatch(DEFAULT_CONFIG, () => 0.5), phase: "lobby" };

/** Ritmo da mesa (ms). */
const PACE = { deal: 650, bot: 950, botJitter: 450, round: 1400, handEnd: 4200, shout: 1500, signal: 1300 };

export function useTrucoGame() {
  const [s, dispatch] = useReducer(reducer, LOBBY);
  const signalledHand = useRef(0);

  // UC04/UC05 — embaralhar, cortar e distribuir.
  useEffect(() => {
    if (s.phase !== "dealing") return;
    const t = setTimeout(() => {
      dispatch({ type: "DEAL", deck: shuffle(createDeck()), cutAt: 4 + Math.floor(Math.random() * 32) });
    }, PACE.deal);
    return () => clearTimeout(t);
  }, [s.phase, s.handNumber, s.gameNumber]);

  // UC22 — bots sinalizam ao parceiro no início da mão.
  useEffect(() => {
    if (s.config.mode !== "2v2" || s.handNumber === 0 || signalledHand.current === s.handNumber) return;
    if (s.phase !== "playing" && s.phase !== "onzeDecision") return;
    signalledHand.current = s.handNumber;
    const snapshot = s;
    const t = setTimeout(() => {
      for (const p of snapshot.players) {
        if (!p.isBot) continue;
        const kind = chooseSignal(snapshot, p.index);
        if (!kind) continue;
        const seenBy = snapshot.players.filter((o) => o.team !== p.team && Math.random() < 0.2).map((o) => o.index);
        dispatch({ type: "SIGNAL", from: p.index, kind, seenBy });
      }
    }, PACE.signal);
    return () => clearTimeout(t);
  }, [s]);

  // Vez dos bots (UC07, UC11–UC15).
  useEffect(() => {
    if (pendingBotActor(s) === null) return;
    const t = setTimeout(() => {
      const a = decideBotAction(s);
      if (a) dispatch(a);
    }, PACE.bot + Math.random() * PACE.botJitter);
    return () => clearTimeout(t);
  }, [s]);

  // Pausas de exibição: fim de rodada e fim de mão.
  useEffect(() => {
    if (s.phase === "roundEnd") {
      const t = setTimeout(() => dispatch({ type: "NEXT" }), PACE.round);
      return () => clearTimeout(t);
    }
    if (s.phase === "handEnd") {
      const t = setTimeout(() => dispatch({ type: "NEXT" }), PACE.handEnd);
      return () => clearTimeout(t);
    }
  }, [s.phase, s.handNumber]);

  useEffect(() => {
    if (!s.shout) return;
    const t = setTimeout(() => dispatch({ type: "CLEAR_SHOUT" }), PACE.shout);
    return () => clearTimeout(t);
  }, [s.shout?.id]);

  const me = 0;
  return {
    s,
    start: useCallback((config: Config) => {
      signalledHand.current = 0;
      dispatch({ type: "LOAD", state: createMatch(config) });
    }, []),
    menu: useCallback(() => dispatch({ type: "LOAD", state: { ...LOBBY, config: s.config } }), [s.config]),
    play: useCallback((cardId: string, covered = false) => dispatch({ type: "PLAY_CARD", player: me, cardId, covered }), []),
    ask: useCallback(() => dispatch({ type: "ASK_BET", player: me }), []),
    respond: useCallback((response: "accept" | "raise" | "run") => dispatch({ type: "RESPOND_BET", player: me, response }), []),
    fold: useCallback(() => dispatch({ type: "FOLD", player: me }), []),
    onze: useCallback((play: boolean) => dispatch({ type: "ONZE_DECISION", play }), []),
    next: useCallback(() => dispatch({ type: "NEXT" }), []),
    signal: useCallback(
      (kind: SignalKind) => {
        const seenBy = s.players.filter((p) => p.team !== s.players[me].team && Math.random() < 0.2).map((p) => p.index);
        dispatch({ type: "SIGNAL", from: me, kind, seenBy });
      },
      [s.players],
    ),
  };
}

export type TrucoGame = ReturnType<typeof useTrucoGame>;
