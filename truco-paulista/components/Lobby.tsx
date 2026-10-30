"use client";

import { useState } from "react";
import { DEFAULT_CONFIG } from "@/lib/truco/engine";
import type { Config } from "@/lib/truco/types";
import { PlayingCard } from "./PlayingCard";

export function Lobby({ initial, onStart }: { initial: Config; onStart: (c: Config) => void }) {
  const [cfg, setCfg] = useState<Config>({ ...DEFAULT_CONFIG, ...initial, playerName: initial.playerName === "Você" ? "" : initial.playerName });
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <main className="lobby">
      <div className="lobby-fan" aria-hidden>
        <PlayingCard card={{ id: "a", rank: "4", suit: "paus" }} manilha="4" size="lg" style={{ "--r": "-14deg", "--x": "-70px" } as React.CSSProperties} />
        <PlayingCard card={{ id: "b", rank: "7", suit: "copas" }} size="lg" style={{ "--r": "0deg", "--x": "0px", "--y": "-14px" } as React.CSSProperties} />
        <PlayingCard card={{ id: "c", rank: "A", suit: "espadas" }} size="lg" style={{ "--r": "14deg", "--x": "70px" } as React.CSSProperties} />
      </div>

      <h1 className="logo">
        <span className="logo-top">Truco</span>
        <span className="logo-bottom">Paulista</span>
      </h1>

      <form
        className="lobby-panel"
        onSubmit={(e) => {
          e.preventDefault();
          onStart({ ...cfg, playerName: cfg.playerName.trim() || "Você" });
        }}
      >
        <label className="field">
          <span>Seu nome</span>
          <input
            value={cfg.playerName}
            maxLength={14}
            placeholder="Você"
            onChange={(e) => set("playerName", e.target.value)}
          />
        </label>

        <fieldset className="field">
          <legend>Mesa</legend>
          <div className="seg">
            <button type="button" className={cfg.mode === "2v2" ? "on" : ""} onClick={() => set("mode", "2v2")}>
              Duplas <small>2 × 2</small>
            </button>
            <button type="button" className={cfg.mode === "1v1" ? "on" : ""} onClick={() => set("mode", "1v1")}>
              Mano a mano <small>1 × 1</small>
            </button>
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Partida</legend>
          <div className="seg">
            <button type="button" className={cfg.bestOf === 1 ? "on" : ""} onClick={() => set("bestOf", 1)}>
              Jogo único
            </button>
            <button type="button" className={cfg.bestOf === 3 ? "on" : ""} onClick={() => set("bestOf", 3)}>
              Queda <small>melhor de 3</small>
            </button>
          </div>
        </fieldset>

        <details className="house-rules">
          <summary>Regras da casa</summary>
          <label className="toggle">
            <input type="checkbox" checked={cfg.allowCovered} onChange={(e) => set("allowCovered", e.target.checked)} />
            <span>Permitir carta coberta a partir da 2ª rodada</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={cfg.ironHandBlind} onChange={(e) => set("ironHandBlind", e.target.checked)} />
            <span>Mão de ferro às cegas (11 × 11)</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={cfg.onzePenalty === "loseGame"}
              onChange={(e) => set("onzePenalty", e.target.checked ? "loseGame" : "loseHand")}
            />
            <span>Pedir truco na mão de onze perde o jogo (em vez da mão)</span>
          </label>
        </details>

        <button className="btn btn-gold btn-xl" type="submit">
          Sentar à mesa
        </button>
      </form>
    </main>
  );
}
