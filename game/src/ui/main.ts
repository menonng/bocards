import { GameAction, GameMode, GameState } from "../core/types.js";
import { reduce } from "../core/engine.js";
import { renderGame, renderHandoff, renderSetup, SetupOptions } from "./render.js";

let game: GameState | null = null;
let ackedKey: string | null = null;

const root = document.getElementById("app");
if (!root) throw new Error("#app 요소를 찾을 수 없습니다.");

function otherOf(i: 0 | 1): 0 | 1 {
  return i === 0 ? 1 : 0;
}

/** 지금 화면을 봐야 하는(패를 볼 권한이 있는) 플레이어 */
function viewerIndex(state: GameState): 0 | 1 {
  return state.phase === "reaction" ? otherOf(state.activePlayerIndex) : state.activePlayerIndex;
}

function currentKey(state: GameState): string {
  return `${viewerIndex(state)}:${state.turnNumber}:${state.phase}`;
}

function dispatch(action: GameAction): void {
  game = reduce(game, action);
  render();
}

function render(): void {
  root!.innerHTML = "";

  if (!game) {
    root!.appendChild(renderSetup(handleStart));
    return;
  }

  const key = currentKey(game);
  if (game.phase !== "gameover" && key !== ackedKey) {
    root!.appendChild(
      renderHandoff(game, viewerIndex(game), () => {
        ackedKey = key;
        render();
      }),
    );
    return;
  }

  root!.appendChild(
    renderGame(game, {
      onPlayCard: (playerIndex, instanceId) =>
        dispatch({ type: "PLAY_CARD", playerIndex, instanceId }),
      onEndTurn: (playerIndex) => dispatch({ type: "END_TURN", playerIndex }),
      onPassReaction: (playerIndex) => dispatch({ type: "PASS_REACTION", playerIndex }),
      onDismissReveal: () => dispatch({ type: "DISMISS_REVEAL" }),
      onRestart: () => {
        game = null;
        ackedKey = null;
        render();
      },
    }),
  );
}

function handleStart(opts: SetupOptions): void {
  ackedKey = null;
  const mode: GameMode = opts.mode;
  dispatch({
    type: "START_GAME",
    stageCardIds: [opts.stageCardId],
    mode,
    player0Name: opts.p0 || "Player 1",
    player1Name: opts.p1 || "Player 2",
  });
}

render();
