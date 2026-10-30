"use client";

import { useEffect, useMemo, useState } from "react";
import { pendingBotActor } from "@/lib/truco/bot";
import { MANILHA_NAME, SUIT_SYMBOL } from "@/lib/truco/cards";
import { says, SIGNAL_LABEL, teamName } from "@/lib/truco/engine";
import { BET_NAME, canAskBet, canCover, canFold, canRaisePending, nextBetValue, other } from "@/lib/truco/rules";
import type { GameState, Player, SignalKind, Team } from "@/lib/truco/types";
import { PlayingCard } from "./PlayingCard";
import { GameOverModal, HandEndBanner, HistoryDrawer, OnzeModal, RulesSheet, ShoutStamp } from "./Overlays";
import type { TrucoGame } from "./useTrucoGame";

type Pos = "bottom" | "right" | "top" | "left";

export function seatPos(s: GameState, i: number): Pos {
  const n = s.players.length;
  const rel = (i - 0 + n) % n;
  if (n === 2) return rel === 0 ? "bottom" : "top";
  return (["bottom", "right", "top", "left"] as Pos[])[rel];
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function Avatar({ p, size = 64 }: { p: Player; size?: number }) {
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, "--h": p.avatarHue } as React.CSSProperties}
      aria-hidden
    >
      <span>{initials(p.name)}</span>
    </div>
  );
}

// ───────────────────────────── placar (UC21) ─────────────────────────────

function ScoreSign({ s }: { s: GameState }) {
  const row = (t: Team) => (
    <div className={`score-row team-${t}`}>
      <span className="score-name">{teamName(s, t)}</span>
      <span className="score-track" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} className={i < s.score[t] ? "on" : ""} />
        ))}
      </span>
      <span className="score-num">{s.score[t]}</span>
      {s.config.bestOf === 3 && (
        <span className="score-games" title="Jogos vencidos na queda">
          {[0, 1].map((g) => (
            <i key={g} className={g < s.gamesWon[t] ? "on" : ""} />
          ))}
        </span>
      )}
    </div>
  );
  return (
    <div className="score-sign" aria-label={`Placar: ${teamName(s, 0)} ${s.score[0]}, ${teamName(s, 1)} ${s.score[1]}`}>
      {row(0)}
      {row(1)}
    </div>
  );
}

// ───────────────────────────── assentos ─────────────────────────────

function Seat({ s, p, onzeReveal }: { s: GameState; p: Player; onzeReveal: boolean }) {
  const pos = seatPos(s, p.index);
  const active =
    (s.phase === "playing" && s.turn === p.index) || pendingBotActor(s) === p.index;
  const shout = s.shout?.player === p.index ? s.shout : null;
  const sig = [...s.signals]
    .reverse()
    .find((g) => g.from === p.index && (g.to === 0 || g.seenBy.includes(0) || g.from === 0));
  const isBlind = s.handType === "ferro" && s.config.ironHandBlind;
  return (
    <div className={`seat seat-${pos} team-${p.team} ${active ? "is-active" : ""}`}>
      <div className="seat-avatar">
        <Avatar p={p} size={pos === "bottom" ? 54 : 64} />
        {s.dealer === p.index && <span className="dealer-chip" title="Embaralhador (pé)">pé</span>}
        {shout && (
          <div key={shout.id} className="bubble">
            {shout.text}
          </div>
        )}
        {!shout && sig && p.index !== 0 && (
          <div key={sig.id} className="bubble bubble-signal" title={SIGNAL_LABEL[sig.kind].gesture}>
            {SIGNAL_LABEL[sig.kind].gesture} · <b>{SIGNAL_LABEL[sig.kind].label}</b>
          </div>
        )}
      </div>
      <div className="seat-plate">
        <span className="seat-name">{p.name}</span>
        <span className="seat-team">{p.team === 0 ? (s.config.mode === "2v2" ? "Nós" : "Você") : "Eles"}</span>
      </div>
      {pos !== "bottom" && (
        <div className="seat-hand" aria-label={`${p.hand.length} cartas`}>
          {p.hand.map((c, k) =>
            onzeReveal && !isBlind ? (
              <PlayingCard key={c.id} card={c} manilha={s.manilha} size="sm" />
            ) : (
              <PlayingCard key={c.id + k} faceDown size="sm" />
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── centro da mesa ─────────────────────────────

const CHIPS_FOR: Record<number, number> = { 1: 1, 3: 2, 6: 3, 9: 4, 12: 5 };

function Center({ s }: { s: GameState }) {
  const last = s.rounds[s.rounds.length - 1];
  const showingResult = (s.phase === "roundEnd" || s.phase === "handEnd") && last && s.table.length === s.players.length;
  const chips = CHIPS_FOR[s.handValue] ?? 1;
  const pending = s.pendingBet;
  return (
    <div className="center">
      <div className="center-info">
        {s.vira && (
          <div className="vira-block">
            <div className="deck">
              <PlayingCard faceDown size="sm" className="deck-card" />
              <PlayingCard card={s.vira} size="sm" className="vira-card" />
            </div>
            <div className="vira-label">
              Vira <b>{s.vira.rank}</b> · manilha <b>{s.manilha}</b>
            </div>
          </div>
        )}

        <div className={`pot ${pending ? "is-pending" : ""}`} aria-live="polite">
          <div className="chip-stack" aria-hidden>
            {Array.from({ length: chips }, (_, i) => (
              <i key={`${s.handNumber}-${i}`} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </div>
          <div className="pot-label">
            {pending ? (
              <>
                <b>{BET_NAME[pending.value]}?</b> vale {pending.value}
              </>
            ) : (
              <>
                Vale <b>{s.handValue}</b>
              </>
            )}
          </div>
          {s.handType === "onze" && <div className="pot-flag">Mão de onze</div>}
          {s.handType === "ferro" && <div className="pot-flag flag-iron">Mão de ferro</div>}
        </div>

        <div className="round-pips" aria-label="Rodadas">
          {[0, 1, 2].map((i) => {
            const r = s.rounds[i]?.result;
            const cls = r === undefined ? "" : r === "tie" ? "tie" : `team-${r}`;
            return (
              <i key={i} className={cls} title={r === undefined ? `${i + 1}ª rodada` : r === "tie" ? "Cangou" : teamName(s, r)}>
                {i + 1}
              </i>
            );
          })}
        </div>
      </div>

      <div className="trick">
        {s.table.map((pc) => {
          const win = showingResult && last.winnerPlayer === pc.player;
          return (
            <div key={pc.card.id} className={`trick-card from-${seatPos(s, pc.player)} ${win ? "is-winner" : ""}`}>
              <PlayingCard card={pc.covered ? null : pc.card} faceDown={pc.covered} manilha={s.manilha} />
            </div>
          );
        })}
        {showingResult && last.result === "tie" && <div className="tie-badge">Cangou!</div>}
      </div>
    </div>
  );
}

// ───────────────────────────── mão do jogador ─────────────────────────────

function MyHand({ s, g }: { s: GameState; g: TrucoGame }) {
  const me = s.players[0];
  const [sel, setSel] = useState<string | null>(null);
  const myTurn = s.phase === "playing" && s.turn === 0;
  const blind = s.handType === "ferro" && s.config.ironHandBlind;
  const coverOk = canCover(s);
  useEffect(() => setSel(null), [s.handNumber, s.roundIndex, s.phase]);

  return (
    <div className={`my-hand ${myTurn ? "is-turn" : ""}`} key={s.handNumber}>
      {me.hand.map((c, k) => {
        const selected = sel === c.id;
        return (
          <div
            key={c.id}
            className={`my-card ${selected ? "is-selected" : ""}`}
            style={{ "--k": k, "--off": k - (me.hand.length - 1) / 2, "--aoff": Math.abs(k - (me.hand.length - 1) / 2) } as React.CSSProperties}
          >
            <button
              className="my-card-btn"
              disabled={!myTurn}
              aria-label={blind ? `Carta ${k + 1} (às cegas)` : `${c.rank} de ${c.suit}`}
              onClick={() => (selected ? g.play(c.id) : setSel(c.id))}
              onDoubleClick={() => g.play(c.id)}
            >
              <PlayingCard card={c} faceDown={blind} manilha={s.manilha} size="lg" />
            </button>
            {selected && myTurn && (
              <div className="card-actions">
                <button className="btn btn-green btn-sm" onClick={() => g.play(c.id)}>
                  Jogar
                </button>
                {coverOk && (
                  <button className="btn btn-dark btn-sm" onClick={() => g.play(c.id, true)}>
                    Coberta
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── ações ─────────────────────────────

const SIGNALS: SignalKind[] = ["zap", "copas", "espadilha", "picafumo", "tres", "nada"];

function Actions({ s, g }: { s: GameState; g: TrucoGame }) {
  const myTeam = s.players[0].team;
  const myTurn = s.phase === "playing" && s.turn === 0;
  const bet = s.pendingBet;
  const [sigOpen, setSigOpen] = useState(false);

  // Responder a um pedido (UC12–UC14)
  if (s.phase === "betResponse" && bet && bet.byTeam !== myTeam) {
    const raise = canRaisePending(s, 0) ? nextBetValue(bet.value) : null;
    return (
      <div className="actions actions-respond">
        <p className="actions-title">
          {s.players[bet.byPlayer].name} pediu <b>{BET_NAME[bet.value]}</b>
          <small>
            Aceitar: a mão vale {bet.value}. Correr: {says(s, bet.byTeam, "leva")} {s.handValue}.
          </small>
        </p>
        <div className="actions-row">
          <button className="btn btn-green" onClick={() => g.respond("accept")}>
            Desce!
          </button>
          {raise && (
            <button className="btn btn-gold" onClick={() => g.respond("raise")}>
              {BET_NAME[raise]}!
            </button>
          )}
          <button className="btn btn-red" onClick={() => g.respond("run")}>
            Correr
          </button>
        </div>
      </div>
    );
  }

  const status = (() => {
    if (s.phase === "dealing") return "Embaralhando…";
    if (s.phase === "betResponse" && bet) return `Esperando ${teamName(s, other(bet.byTeam))} responder ao ${BET_NAME[bet.value]}…`;
    if (s.phase === "onzeDecision") return s.onzeTeam === myTeam ? "Decida a mão de onze" : `${says(s, s.onzeTeam!, "esta")} decidindo a mão de onze…`;
    if (s.phase === "roundEnd") return "Fim da rodada";
    if (s.phase === "playing" && !myTurn) return `Vez de ${s.players[s.turn].name}`;
    if (myTurn) return s.handType === "ferro" && s.config.ironHandBlind ? "Sua vez — escolha uma carta às cegas" : "Sua vez — toque numa carta";
    return "";
  })();

  const nextBet = nextBetValue(s.handValue);
  const askOk = canAskBet(s, 0);
  const showBetBtn = s.phase === "playing" && nextBet !== null && s.handType !== "ferro";
  const onzeLock = s.handType === "onze";

  return (
    <div className="actions">
      <p className="actions-status" aria-live="polite">{status}</p>
      <div className="actions-row">
        {showBetBtn && (
          <button
            className="btn btn-gold btn-bet"
            disabled={!askOk}
            onClick={g.ask}
            title={
              onzeLock
                ? "Proibido na mão de onze"
                : s.lastBetTeam === myTeam
                  ? "Só o adversário pode aumentar agora"
                  : !myTurn
                    ? "Peça na sua vez"
                    : `A mão passa a valer ${nextBet}`
            }
          >
            {BET_NAME[nextBet]}!
          </button>
        )}
        {s.phase === "playing" && s.handType !== "ferro" && (
          <button className="btn btn-red btn-sm-wide" disabled={!canFold(s, 0)} onClick={g.fold} title="Desistir da mão">
            Correr
          </button>
        )}
        {s.config.mode === "2v2" && ["playing", "betResponse"].includes(s.phase) && s.handType !== "ferro" && (
          <div className="signal-wrap">
            <button className="btn btn-dark btn-sm-wide" onClick={() => setSigOpen((o) => !o)} aria-expanded={sigOpen}>
              Sinal
            </button>
            {sigOpen && (
              <div className="signal-menu" role="menu">
                {SIGNALS.map((k) => (
                  <button
                    key={k}
                    role="menuitem"
                    onClick={() => {
                      g.signal(k);
                      setSigOpen(false);
                    }}
                  >
                    <b>{SIGNAL_LABEL[k].label}</b>
                    <small>{SIGNAL_LABEL[k].gesture}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {onzeLock && s.phase === "playing" && <p className="actions-note">Mão de onze: sem truco nesta mão.</p>}
    </div>
  );
}

// ───────────────────────────── mesa ─────────────────────────────

export function Table({ g }: { g: TrucoGame }) {
  const { s } = g;
  const [drawer, setDrawer] = useState<null | "history" | "rules">(null);
  const me = s.players[0];
  const partnerIdx = s.config.mode === "2v2" ? 2 : null;
  // RN35 — na mão de onze, a equipe com 11 vê as cartas do parceiro.
  const onzeReveal = s.handType === "onze" && s.onzeTeam === me.team && s.phase !== "handEnd";
  const manilhaLine = useMemo(
    () =>
      s.manilha
        ? (["paus", "copas", "espadas", "ouros"] as const).map((suit) => `${MANILHA_NAME[suit]} ${s.manilha}${SUIT_SYMBOL[suit]}`).join(" › ")
        : "",
    [s.manilha],
  );

  return (
    <div className={`stage mode-${s.config.mode}`}>
      <header className="hud">
        <ScoreSign s={s} />
        <div className="hud-mid">
          {s.config.bestOf === 3 && <span className="hud-game">Jogo {s.gameNumber} da queda</span>}
          <span className="hud-hand">Mão {s.handNumber || 1}</span>
          {manilhaLine && <span className="hud-manilhas">{manilhaLine}</span>}
        </div>
        <nav className="hud-btns">
          <button className="btn btn-dark btn-icon" onClick={() => setDrawer("history")}>
            Histórico
          </button>
          <button className="btn btn-dark btn-icon" onClick={() => setDrawer("rules")}>
            Regras
          </button>
          <button className="btn btn-dark btn-icon" onClick={() => { if (window.confirm("Sair da partida?")) g.menu(); }}>
            Sair
          </button>
        </nav>
      </header>

      <section className="table-area">
        <div className="table">
          <div className="table-rail">
            <div className="table-felt">
              <div className="felt-mark" aria-hidden>
                Truco
              </div>
              <Center s={s} />
            </div>
          </div>
          {s.players.map((p) => (
            <Seat key={p.index} s={s} p={p} onzeReveal={onzeReveal && p.index === partnerIdx} />
          ))}
        </div>
      </section>

      <footer className="bottom">
        <MyHand s={s} g={g} />
        <Actions s={s} g={g} />
      </footer>

      <ShoutStamp s={s} />
      {s.phase === "onzeDecision" && s.onzeTeam === me.team && <OnzeModal s={s} g={g} />}
      {s.phase === "handEnd" && <HandEndBanner s={s} onNext={g.next} />}
      {(s.phase === "gameOver" || s.phase === "matchOver") && <GameOverModal s={s} g={g} />}
      {drawer === "history" && <HistoryDrawer s={s} onClose={() => setDrawer(null)} />}
      {drawer === "rules" && <RulesSheet onClose={() => setDrawer(null)} />}
    </div>
  );
}
