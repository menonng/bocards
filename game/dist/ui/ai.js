// ─────────────────────────────────────────────────────────────
// 아주 단순한 규칙 기반 AI. "완벽한 전략"이 아니라 "그럴듯하게 두는 상대"를
// 목표로 한다. main.ts가 AI 차례마다 이 함수를 반복 호출해 한 번에 액션
// 하나씩 받아 dispatch한다.
// ─────────────────────────────────────────────────────────────
import { canPlayCard, getSongDef } from "../core/engine.js";
function otherOf(i) {
    return i === 0 ? 1 : 0;
}
/** 다음에 실행할 액션 하나를 고른다. 더 할 게 없으면 null. */
export function chooseAiAction(state, aiIndex) {
    if (state.phase === "gameover")
        return null;
    if (state.phase === "reaction") {
        if (state.activePlayerIndex === aiIndex)
            return null; // AI 턴이면 반응 대상이 아님
        const player = state.players[aiIndex];
        const playable = player.hand.filter((c) => canPlayCard(state, aiIndex, c.instanceId).ok);
        // 회복형 코러스는 인기도가 낮을 때, 드로우형은 절반 확률로 사용
        const heal = playable.find((c) => getSongDef(c.defId).effect.kind === "heal");
        if (heal && player.popularity <= 12) {
            return { type: "PLAY_CARD", playerIndex: aiIndex, instanceId: heal.instanceId };
        }
        const other = playable.find(() => Math.random() < 0.4);
        if (other)
            return { type: "PLAY_CARD", playerIndex: aiIndex, instanceId: other.instanceId };
        return { type: "PASS_REACTION", playerIndex: aiIndex };
    }
    if (state.phase !== "main" || state.activePlayerIndex !== aiIndex)
        return null;
    const player = state.players[aiIndex];
    const opponent = state.players[otherOf(aiIndex)];
    const playableCards = player.hand.filter((c) => canPlayCard(state, aiIndex, c.instanceId).ok);
    const withDef = playableCards.map((c) => ({ card: c, def: getSongDef(c.defId) }));
    // 1) 인기도가 낮고 회복 카드가 있으면 우선 회복
    if (player.popularity <= 10) {
        const heal = withDef.find((x) => x.def.effect.kind === "heal");
        if (heal)
            return { type: "PLAY_CARD", playerIndex: aiIndex, instanceId: heal.card.instanceId };
    }
    // 2) 공격 카드를 낼 수 있고, 상대 인기도를 확실히 끝낼 수 있으면 최우선
    const vocalOptions = withDef.filter((x) => x.def.type === "vocal");
    const lethal = vocalOptions.find((x) => x.def.effect.kind === "damage" && x.def.effect.amount >= opponent.popularity);
    if (lethal)
        return { type: "PLAY_CARD", playerIndex: aiIndex, instanceId: lethal.card.instanceId };
    // 3) 아이템/효과 카드 중 아직 안 쓴 것이 있으면 먼저 정리한다 (버프/드로우/디버프 등).
    //    단, 무한 루프를 막기 위해 "아직 시도하지 않은 카드"만 후보로 삼는다.
    const nonVocal = withDef.filter((x) => x.def.type !== "vocal");
    if (nonVocal.length > 0) {
        // 디버프/버프류를 살짝 더 우선한다
        const buffOrDebuff = nonVocal.find((x) => ["buffNextVocalWithSelfCost", "debuffOpponentNextVocal", "negateOpponentNextSupportOrStory"].includes(x.def.effect.kind));
        const pick = buffOrDebuff ?? nonVocal[0];
        return { type: "PLAY_CARD", playerIndex: aiIndex, instanceId: pick.card.instanceId };
    }
    // 4) 낼 수 있는 공격 카드가 있으면 낸다 (자원 개념이 없으므로 아무거나 내도
    //    손해가 없다 — 다만 공격은 그 즉시 턴을 끝내므로 딱 1장만 낸다)
    if (vocalOptions.length > 0) {
        const pick = vocalOptions[Math.floor(Math.random() * vocalOptions.length)];
        return { type: "PLAY_CARD", playerIndex: aiIndex, instanceId: pick.card.instanceId };
    }
    // 5) 더 낼 카드가 없으면 턴 종료
    return { type: "END_TURN", playerIndex: aiIndex };
}
export function isAiTurnNow(state, aiIndex) {
    if (state.phase === "gameover")
        return false;
    if (state.phase === "reaction")
        return state.activePlayerIndex !== aiIndex;
    return state.phase === "main" && state.activePlayerIndex === aiIndex;
}
//# sourceMappingURL=ai.js.map