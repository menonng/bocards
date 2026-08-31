import { reduce } from "../core/engine.js";
import { chooseAiAction, isAiTurnNow } from "./ai.js";
import { renderBattlePlaceholder, renderBattleScreen, renderCardsScreen, renderDeckScreen, } from "./render.js";
const AI_INDEX = 1;
const AI_THINK_DELAY_MS = 550;
let game = null;
let screen = "deck";
let aiTimer = null;
const root = document.getElementById("app");
if (!root)
    throw new Error("#app 요소를 찾을 수 없습니다.");
function clearAiTimer() {
    if (aiTimer !== null) {
        window.clearTimeout(aiTimer);
        aiTimer = null;
    }
}
function scheduleAiIfNeeded() {
    if (aiTimer !== null || !game)
        return;
    if (!isAiTurnNow(game, AI_INDEX))
        return;
    aiTimer = window.setTimeout(() => {
        aiTimer = null;
        if (!game)
            return;
        const action = chooseAiAction(game, AI_INDEX);
        if (action)
            dispatch(action);
    }, AI_THINK_DELAY_MS);
}
function dispatch(action) {
    game = reduce(game, action);
    render();
    scheduleAiIfNeeded();
}
function render() {
    root.innerHTML = "";
    const handlers = {
        onNav: (s) => {
            screen = s;
            render();
        },
        onStartGame: (opts) => {
            clearAiTimer();
            game = reduce(null, {
                type: "START_GAME",
                mode: opts.mode,
                player0Name: opts.name || "Player 1",
                player1Name: "AI",
                player0DeckRatio: opts.ratio,
                // player1DeckRatio를 생략하면 카드 풀의 기본 분포를 사용한다.
            });
            screen = "battle";
            render();
            scheduleAiIfNeeded();
        },
        onPlayCard: (instanceId) => dispatch({ type: "PLAY_CARD", playerIndex: 0, instanceId }),
        onUseSkill: () => dispatch({ type: "USE_SKILL", playerIndex: 0 }),
        onSwitchActive: (benchInstanceId) => dispatch({ type: "SWITCH_ACTIVE", playerIndex: 0, benchInstanceId }),
        onEndTurn: () => dispatch({ type: "END_TURN", playerIndex: 0 }),
        onPassReaction: () => dispatch({ type: "PASS_REACTION", playerIndex: 0 }),
        onDismissReveal: () => dispatch({ type: "DISMISS_REVEAL" }),
        onRestart: () => {
            clearAiTimer();
            game = null;
            screen = "deck";
            render();
        },
    };
    if (screen === "deck") {
        root.appendChild(renderDeckScreen(handlers));
        return;
    }
    if (screen === "cards") {
        root.appendChild(renderCardsScreen(handlers.onNav));
        return;
    }
    // screen === "battle"
    if (!game) {
        root.appendChild(renderBattlePlaceholder(handlers));
        return;
    }
    root.appendChild(renderBattleScreen(game, handlers));
}
render();
//# sourceMappingURL=main.js.map