"use client";

import { useEffect, useRef } from "react";
import { cardLabel } from "@/lib/truco/cards";
import { says, teamName } from "@/lib/truco/engine";
import { other } from "@/lib/truco/rules";
import type { GameState } from "@/lib/truco/types";
import { PlayingCard } from "./PlayingCard";
import type { TrucoGame } from "./useTrucoGame";

const STAMP_WORDS = ["TRUCO!", "SEIS!", "NOVE!", "DOZE!"];

/** O momento marcante: o grito de aposta estampado no centro da mesa. */
export function ShoutStamp({ s }: { s: GameState }) {
  if (!s.shout || !STAMP_WORDS.includes(s.shout.text)) return null;
  const team = s.players[s.shout.player].team;
  return (
    <div className="stamp-layer" aria-live="assertive">
      <div key={s.shout.id} className={`stamp team-${team}`}>
        <span>{s.shout.text}</span>
        <small>{s.players[s.shout.player].name}</small>
      </div>
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

/** UC15 — a equipe com 11 vê as cartas do parceiro e decide. */
export function OnzeModal({ s, g }: { s: GameState; g: TrucoGame }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const partner = s.config.mode === "2v2" ? s.players[2] : null;
  return (
    <div className="modal-scrim">
      <div className="modal" role="dialog" aria-modal aria-labelledby="onze-title">
        <h2 id="onze-title">Mão de onze</h2>
        <p className="modal-lead">
          Vocês estão com 11. Jogando, a mão vale 3 e ninguém pode trucar. Correndo, {says(s, other(s.onzeTeam!), "leva")} 1 ponto.
        </p>
        <div className="onze-hands">
          <div>
            <h3>Suas cartas</h3>
            <div className="onze-row">
              {s.players[0].hand.map((c) => (
                <PlayingCard key={c.id} card={c} manilha={s.manilha} />
              ))}
            </div>
          </div>
          {partner && (
            <div>
              <h3>Cartas de {partner.name}</h3>
              <div className="onze-row">
                {partner.hand.map((c) => (
                  <PlayingCard key={c.id} card={c} manilha={s.manilha} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button ref={first} className="btn btn-green btn-lg" onClick={() => g.onze(true)}>
            Jogar valendo 3
          </button>
          <button className="btn btn-red btn-lg" onClick={() => g.onze(false)}>
            Correr
          </button>
        </div>
      </div>
    </div>
  );
}

/** UC17 — resultado da mão. */
export function HandEndBanner({ s, onNext }: { s: GameState; onNext: () => void }) {
  const r = s.handResult;
  if (!r) return null;
  const mine = r.winner === s.players[0].team;
  return (
    <div className={`hand-banner ${r.winner === null ? "is-draw" : mine ? "is-win" : "is-loss"}`} role="status">
      <div className="hand-banner-pts">
        {r.winner === null ? "0" : `+${r.points}`}
        <small>{r.winner === null ? "ninguém pontua" : teamName(s, r.winner)}</small>
      </div>
      <p className="hand-banner-why">{r.reason}</p>
      <button className="btn btn-gold btn-sm" onClick={onNext}>
        Próxima mão
      </button>
      <span className="hand-banner-timer" aria-hidden />
    </div>
  );
}

/** UC19 — fim de jogo / partida. */
export function GameOverModal({ s, g }: { s: GameState; g: TrucoGame }) {
  const final = s.phase === "matchOver";
  const w = final ? s.matchWinner! : s.lastGameWinner!;
  const won = w === s.players[0].team;
  const plural = s.config.mode === "2v2";
  const title = won ? (plural ? "Vocês venceram!" : "Você venceu!") : `${says(s, w, "venceu")}`;
  return (
    <div className="modal-scrim">
      {won && (
        <div className="confetti" aria-hidden>
          {Array.from({ length: 36 }, (_, i) => (
            <i key={i} style={{ "--i": i } as React.CSSProperties} />
          ))}
        </div>
      )}
      <div className={`modal modal-end ${won ? "is-win" : "is-loss"}`} role="dialog" aria-modal aria-labelledby="end-title">
        <h2 id="end-title">{final ? title : `${title} o jogo ${s.gameNumber}`}</h2>
        <div className="end-score">
          <span className="team-0">{s.score[0]}</span>
          <i>×</i>
          <span className="team-1">{s.score[1]}</span>
        </div>
        {s.config.bestOf === 3 && (
          <p className="modal-lead">
            Queda: {teamName(s, 0)} {s.gamesWon[0]} × {s.gamesWon[1]} {teamName(s, 1)}
          </p>
        )}
        <div className="modal-actions">
          {final ? (
            <>
              <button className="btn btn-gold btn-lg" onClick={() => g.start(s.config)} autoFocus>
                Jogar de novo
              </button>
              <button className="btn btn-dark btn-lg" onClick={g.menu}>
                Voltar ao menu
              </button>
            </>
          ) : (
            <button className="btn btn-gold btn-lg" onClick={g.next} autoFocus>
              Começar o jogo {s.gameNumber + 1}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** UC21 — histórico de mãos e registro da mesa. */
export function HistoryDrawer({ s, onClose }: { s: GameState; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Histórico">
        <header>
          <h2>Histórico</h2>
          <button className="btn btn-dark btn-sm" onClick={onClose}>
            Fechar
          </button>
        </header>
        <section>
          <h3>Mãos</h3>
          {s.history.length === 0 && <p className="muted">Nenhuma mão terminou ainda.</p>}
          <ol className="hist-list">
            {[...s.history].reverse().map((h) => (
              <li key={h.number}>
                <span className="hist-n">{h.number}</span>
                <span className="hist-vira">
                  vira {cardLabel(h.vira)} · manilha {h.manilha}
                </span>
                <span className={`hist-res ${h.result.winner === null ? "" : `team-${h.result.winner}`}`}>
                  {h.result.winner === null ? "sem pontos" : `${teamName(s, h.result.winner)} +${h.result.points}`}
                </span>
                <span className="hist-why">{h.result.reason}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3>Mesa</h3>
          <ol className="log-list">
            {[...s.log].reverse().map((l) => (
              <li key={l.id} className={`log-${l.kind}`}>
                {l.text}
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

export function RulesSheet({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Regras">
        <header>
          <h2>Regras rápidas</h2>
          <button className="btn btn-dark btn-sm" onClick={onClose}>
            Fechar
          </button>
        </header>
        <section className="rules">
          <h3>Força das cartas</h3>
          <p>Da mais forte para a mais fraca: 3, 2, A, K, J, Q, 7, 6, 5, 4. O naipe não desempata.</p>
          <h3>Manilhas</h3>
          <p>
            A carta virada no centro é a vira. O valor logo acima dela vira manilha e vence qualquer outra carta. Entre
            manilhas: Zap (♣) › Copas (♥) › Espadilha (♠) › Pica-fumo (♦).
          </p>
          <h3>Rodadas</h3>
          <p>
            Cada mão tem até 3 rodadas; quem fizer 2 leva. Se a 1ª empatar, quem fizer a 2ª leva. Se uma empatar depois de
            alguém ter feito a 1ª, quem fez a 1ª leva. Três empates: ninguém pontua.
          </p>
          <h3>Apostas</h3>
          <p>
            A mão vale 1. Na sua vez, peça Truco (3). O adversário aceita, corre ou aumenta para Seis, Nove e Doze. Quem
            pediu por último não pode pedir de novo. Correr entrega o valor anterior ao pedido.
          </p>
          <h3>Carta coberta</h3>
          <p>A partir da 2ª rodada você pode jogar uma carta virada para baixo. Ela não vale nada.</p>
          <h3>Mão de onze e mão de ferro</h3>
          <p>
            Com 11 pontos, a dupla vê as cartas do parceiro e decide se joga (vale 3, sem truco) ou corre (o adversário
            leva 1). Em 11 × 11, todos jogam às cegas e quem vencer leva o jogo.
          </p>
          <h3>Fim do jogo</h3>
          <p>Vence quem chegar a 12 pontos.</p>
        </section>
      </aside>
    </div>
  );
}
