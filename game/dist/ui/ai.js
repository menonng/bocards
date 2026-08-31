// ─────────────────────────────────────────────────────────────
// 아주 단순한 규칙 기반 AI. "완벽한 전략"이 아니라 "그럴듯하게 두는 상대"를
// 목표로 한다. main.ts가 AI 차례마다 이 함수를 반복 호출해 한 번에 액션
// 하나씩 받아 dispatch한다.
// ─────────────────────────────────────────────────────────────
import { canPlayCard, getSongDef, BENCH_SIZE } from "../core/engine.js";
function otherOf(i) {
    return i === 0 ? 1 : 0;
}
/** 스킬(곡 효과)이 대략 얼마의 데미지를 주는지 — 격파 가능 여부를 어림잡는 용도. */
function roughSkillDamage(effect) {
    switch (effect.kind) {
        case "damage":
        case "damageThenHealSelf":
        case "damageBonusIfStoryOnField":
        case "damageBonusIfPlayedSongThisTurn":
        case "damageThenOpponentDraws":
        case "drawAfterDamage":
        case "damageThenPeekOpponentHand":
        case "damageAndGainExtraMainPlay":
        case "damageBonusIfOpponentLowHp":
            return effect.amount;
        case "gambleDamageOrDraw":
            return effect.damage;
        default:
            return 0;
    }
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
        // 회복형 반응 아이템은 체력이 낮을 때, 그 외에는 절반 이하 확률로 사용
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
    // 1) 체력이 낮고 회복 카드가 있으면 우선 회복
    if (player.popularity <= 10) {
        const heal = withDef.find((x) => x.def.effect.kind === "heal");
        if (heal)
            return { type: "PLAY_CARD", playerIndex: aiIndex, instanceId: heal.card.instanceId };
    }
    // 2) 배틀 자리에 카드가 있고, 스킬로 상대 배틀 카드를 확실히 격파할 수 있으면 최우선
    if (player.activeBattler) {
        const skillDef = getSongDef(player.activeBattler.defId);
        const roughDamage = roughSkillDamage(skillDef.effect);
        const oppBattler = opponent.activeBattler;
        if (oppBattler && roughDamage >= oppBattler.currentHp) {
            return { type: "USE_SKILL", playerIndex: aiIndex };
        }
    }
    // 3) 배틀 자리가 비어 있으면, 손패의 보컬 카드를 우선 소환해 공격 수단부터 확보한다.
    if (!player.activeBattler) {
        const vocalToSummon = withDef.find((x) => x.def.type === "vocal");
        if (vocalToSummon)
            return { type: "PLAY_CARD", playerIndex: aiIndex, instanceId: vocalToSummon.card.instanceId };
    }
    // 4) 아이템 카드 중 아직 안 쓴 것이 있으면 먼저 정리한다 (버프/드로우/디버프 등).
    const items = withDef.filter((x) => x.def.type === "item");
    if (items.length > 0) {
        // 디버프/버프류를 살짝 더 우선한다
        const buffOrDebuff = items.find((x) => [
            "buffNextVocalWithSelfCost",
            "debuffOpponentNextVocal",
            "negateOpponentNextSupportOrStory",
        ].includes(x.def.effect.kind));
        const pick = buffOrDebuff ?? items[0];
        return { type: "PLAY_CARD", playerIndex: aiIndex, instanceId: pick.card.instanceId };
    }
    // 5) 배틀 자리는 이미 채워져 있고 벤치에 자리가 남아 있다면, 스킬을 쓰기(=턴 종료)
    //    전에 여분의 보컬 카드를 벤치에 미리 채워 둔다.
    if (player.activeBattler && player.benchBattlers.length < BENCH_SIZE) {
        const vocalToBench = withDef.find((x) => x.def.type === "vocal");
        if (vocalToBench)
            return { type: "PLAY_CARD", playerIndex: aiIndex, instanceId: vocalToBench.card.instanceId };
    }
    // 6) 배틀 자리에 카드가 있으면 스킬을 쓴다 (자원 개념이 없으므로 아무 때나 써도
    //    손해가 없다 — 다만 스킬 사용은 그 즉시 턴을 끝내므로 한 번만).
    if (player.activeBattler) {
        return { type: "USE_SKILL", playerIndex: aiIndex };
    }
    // 7) 더 할 게 없으면 턴 종료 (v1의 AI는 스스로 교체(SWITCH_ACTIVE)하지 않는다).
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