"use client";

import { Lobby } from "./Lobby";
import { Table } from "./Table";
import { useTrucoGame } from "./useTrucoGame";

export function TrucoGame() {
  const g = useTrucoGame();
  if (g.s.phase === "lobby") return <Lobby initial={g.s.config} onStart={g.start} />;
  return <Table g={g} />;
}
