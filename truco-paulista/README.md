# Truco Paulista — Next.js + React

Truco Paulista contra adversários controlados pelo computador, implementado a partir do
documento `casos-de-uso-truco-paulista.md` (as regras de negócio RN01–RN42 e os casos de uso UC01–UC22).

## Como rodar

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # testes das regras + simulação de partidas bot × bot
npm run build && npm start   # produção
```

Requer Node 18.18+ (testado com Node 22).

## Estrutura

```
app/                 layout, página e estilos (globals.css)
components/
  useTrucoGame.ts    hook: redutor + ritmo da mesa + vez dos bots
  Lobby.tsx          UC01/UC02 — configurar partida e mesa
  Table.tsx          mesa, assentos, centro, mão do jogador e ações
  Overlays.tsx       grito de aposta, mão de onze, fim de mão/jogo, histórico, regras
  PlayingCard.tsx    carta desenhada em CSS
lib/truco/
  types.ts           tipos do domínio
  cards.ts           RN01–RN08: baralho, vira, manilha, força
  rules.ts           RN20–RN34: rodada, mão, escada de apostas, permissões
  engine.ts          redutor puro com todos os casos de uso (UC01–UC22)
  bot.ts             IA dos adversários e do parceiro
tests/
  rules.test.ts        testes por regra de negócio
  simulation.test.ts   300 partidas bot × bot verificando invariantes
  ai-strength.test.ts  IA × jogador aleatório
```

## Onde cada caso de uso está

| UC | Implementação |
|---|---|
| UC01–UC03 | `createMatch` (engine.ts) + `Lobby.tsx` |
| UC04–UC06 | ação `DEAL` (embaralha, corta, distribui 3 a 3 no sentido anti-horário, vira, manilha) |
| UC07–UC08 | ação `PLAY_CARD` (carta coberta só a partir da 2ª rodada) |
| UC09–UC10 | `resolveRound` / `resolveHand` (rules.ts) — inclui todos os casos de empate da RN25 |
| UC11–UC14 | ações `ASK_BET`, `RESPOND_BET` (aceitar / aumentar / correr), `FOLD` |
| UC15 | fase `onzeDecision` + `OnzeModal` (a dupla vê as cartas do parceiro) |
| UC16 | mão de ferro às cegas: ninguém vê as próprias cartas, sem apostas, vale o jogo |
| UC17–UC19 | `finishHand` / `NEXT`: placar até 12, rodízio do pé, jogo único ou queda melhor de 3 |
| UC20 | truco na mão de onze é infração (a interface bloqueia; o motor aplica a penalidade se receber) |
| UC21 | botão Histórico: mãos anteriores e registro da mesa |
| UC22 | botão Sinal (2×2): gestos ao parceiro; adversários podem flagrar (20%) |

As variações da seção 9 estão em "Regras da casa" no lobby (carta coberta, mão de ferro às cegas,
penalidade da mão de onze, jogo único ou queda).

## IA dos adversários

Os bots só usam informação que um jogador real teria (RN16): a própria mão, as cartas abertas, a vira
e os sinais que receberam ou flagraram. Para decidir, cada bot sorteia mãos plausíveis para os outros
jogadores e simula o resto da mão centenas de vezes (Monte Carlo). Com isso ele:

- escolhe a carta que maximiza a chance de levar a mão (guarda manilha, canga quando convém, cobre carta);
- pede truco / aumenta quando a chance estimada passa de um limiar que varia com a personalidade;
- responde a apostas comparando o valor esperado de aceitar com o de correr, considerando o placar;
- às vezes blefa e às vezes "cozinha" uma mão forte;
- decide a mão de onze vendo as cartas do parceiro;
- sinaliza ao parceiro no 2×2 e leva em conta os sinais recebidos.

Cada bot tem uma personalidade (agressividade e taxa de blefe) sorteada no início da partida.
Contra um jogador que joga cartas aleatórias, a IA vence cerca de 95% das partidas.

## Visual

Inspirado na linguagem dos jogos de cassino para celular (mesa oval de feltro, borda de madeira com friso
dourado, avatares com moldura, fichas e botões grossos). Não usa marca, personagens nem arte de
nenhum jogo existente.
