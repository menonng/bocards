function tickText(tick) {
    switch (tick.kind) {
        case "damageOpponent":
            return `상대 체력 ${tick.amount} 감소`;
        case "drawCard":
            return `카드 ${tick.amount}장 드로우`;
    }
}
/** 카드 효과를 사람이 읽을 수 있는 한국어 한 줄로 변환한다. */
export function effectText(effect) {
    switch (effect.kind) {
        case "damage":
            return `상대 체력 ${effect.amount} 감소`;
        case "damageThenHealSelf":
            return `상대 체력 ${effect.amount} 감소, 자신 체력 ${effect.heal} 회복`;
        case "damageBonusIfStoryOnField":
            return `상대 체력 ${effect.amount} 감소 (필드에 효과 카드가 설치되어 있으면 +${effect.bonus})`;
        case "damageBonusIfPlayedSongThisTurn":
            return `상대 체력 ${effect.amount} 감소 (이번 턴에 이미 카드를 냈다면 +${effect.bonus})`;
        case "damageThenOpponentDraws":
            return `상대 체력 ${effect.amount} 감소, 상대도 카드 ${effect.opponentDraw}장 드로우`;
        case "damageThenPeekOpponentHand":
            return `상대 체력 ${effect.amount} 감소, 상대 손패 전체 공개`;
        case "drawAfterDamage":
            return `상대 체력 ${effect.amount} 감소 후 카드 ${effect.draw}장 드로우`;
        case "heal":
            return `자신 체력 ${effect.amount} 회복`;
        case "buffNextVocalWithSelfCost":
            return effect.selfPopularityCostOnTurnEnd > 0
                ? `다음 공격 카드 데미지 +${effect.amount} (이번 턴 종료 시 자신 체력 ${effect.selfPopularityCostOnTurnEnd} 감소)`
                : `다음 공격 카드 데미지 +${effect.amount}`;
        case "debuffOpponentNextVocal":
            return `상대의 다음 공격 카드 데미지 -${effect.amount}`;
        case "gainExtraMainPlay":
            return `이번 턴에 공격/효과(지속형) 카드를 ${effect.amount}장 더 낼 수 있음`;
        case "draw":
            return `카드 ${effect.amount}장 드로우`;
        case "drawThenDiscardRandom":
            return `카드 ${effect.draw}장 드로우 후 무작위로 ${effect.discard}장 버림`;
        case "negateOpponentNextSupportOrStory":
            return `상대의 다음 아이템/효과 카드 효과 무효화`;
        case "installStoryTick":
            return `설치: ${effect.duration}턴간 매 턴 시작 시 [${tickText(effect.tick)}]`;
        case "installReviveOnceOnDeath":
            return `설치: 자신의 카드가 무덤에 갈 때 1회, 즉시 손으로 되돌림`;
        case "markReviveOnceInGraveyard":
            return `이 카드는 무덤에 간 뒤, 자신의 다음 턴 시작 시 1회 손으로 돌아온다`;
        case "stealRandomCard":
            return `상대의 손패에서 무작위로 카드 1장을 가져온다`;
        case "drawWithSelfDuplicateChance":
            return (`카드 ${effect.amount}장 드로우 (각 장마다 ${Math.round(effect.duplicateChance * 100)}% 확률로 ` +
                `이 카드의 사본으로 대체) · 사용 후 무덤에 가지 않고 손으로 돌아옴(재사용 가능)`);
    }
}
export function cardTypeLabel(type) {
    switch (type) {
        case "vocal":
            return "공격";
        case "support":
            return "아이템";
        case "story":
        case "chorus":
            return "효과";
    }
}
/** 툴팁의 "기록" 줄 — 신화입성/1억뷰 여부를 사람이 읽는 문장으로 */
export function recordText(def) {
    const parts = [];
    if (def.isMyth) {
        parts.push(`VOCALOID 신화입성(니코니코 1,000만 재생)${def.mythDate ? ` · ${def.mythDate}` : ""}`);
    }
    if (def.youtube100M) {
        parts.push("유튜브 누적 1억 회 재생");
    }
    return parts.length > 0 ? parts.join(" · ") : null;
}
export function rarityLabel(rarity) {
    switch (rarity) {
        case "common":
            return "커먼";
        case "rare":
            return "레어";
        case "legendary":
            return "레전더리";
    }
}
//# sourceMappingURL=cardText.js.map