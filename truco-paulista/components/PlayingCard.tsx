import { isManilha, MANILHA_NAME, SUIT_SYMBOL } from "@/lib/truco/cards";
import type { Card, Rank } from "@/lib/truco/types";

interface Props {
  card?: Card | null;
  manilha?: Rank | null;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
}

const RED = new Set(["ouros", "copas"]);

export function PlayingCard({ card, manilha, faceDown, size = "md", className = "", style }: Props) {
  if (faceDown || !card) {
    return (
      <div className={`pcard pcard-${size} pcard-back ${className}`} style={style} aria-label="Carta virada">
        <div className="pcard-back-inner">
          <span>T</span>
        </div>
      </div>
    );
  }
  const red = RED.has(card.suit);
  const mani = isManilha(card, manilha ?? null);
  const sym = SUIT_SYMBOL[card.suit];
  return (
    <div
      className={`pcard pcard-${size} ${red ? "is-red" : "is-black"} ${mani ? "is-manilha" : ""} ${className}`}
      style={style}
      aria-label={`${card.rank} de ${card.suit}${mani ? `, manilha ${MANILHA_NAME[card.suit]}` : ""}`}
    >
      <div className="pcard-corner">
        <b>{card.rank}</b>
        <i>{sym}</i>
      </div>
      <div className="pcard-pip">{sym}</div>
      <div className="pcard-corner pcard-corner-br">
        <b>{card.rank}</b>
        <i>{sym}</i>
      </div>
      {mani && <div className="pcard-tag">{MANILHA_NAME[card.suit]}</div>}
    </div>
  );
}
