import { SongCardDef, SongEffect, StoryTick } from "../core/types.js";

function tickText(tick: StoryTick): string {
  switch (tick.kind) {
    case "damageOpponent":
      return `상대 인기도 ${tick.amount} 감소`;
    case "drawCard":
      return `카드 ${tick.amount}장 드로우`;
    case "gainPPThisTurn":
      return `재생 포인트 +${tick.amount}`;
  }
}

/** 카드 효과를 사람이 읽을 수 있는 한국어 한 줄로 변환한다. */
export function effectText(effect: SongEffect): string {
  switch (effect.kind) {
    case "damage":
      return `상대 인기도 ${effect.amount} 감소`;
    case "damageThenHealSelf":
      return `상대 인기도 ${effect.amount} 감소, 자신 인기도 ${effect.heal} 회복`;
    case "damageBonusIfStoryOnField":
      return `상대 인기도 ${effect.amount} 감소 (필드에 스토리 카드가 있으면 +${effect.bonus})`;
    case "damageBonusIfPlayedSongThisTurn":
      return `상대 인기도 ${effect.amount} 감소 (이번 턴에 이미 곡을 냈다면 +${effect.bonus})`;
    case "damageThenOpponentDraws":
      return `상대 인기도 ${effect.amount} 감소, 상대도 카드 ${effect.opponentDraw}장 드로우`;
    case "damageThenPeekOpponentHand":
      return `상대 인기도 ${effect.amount} 감소, 상대 손패 전체 공개`;
    case "drawAfterDamage":
      return `상대 인기도 ${effect.amount} 감소 후 카드 ${effect.draw}장 드로우`;
    case "heal":
      return `자신 인기도 ${effect.amount} 회복`;
    case "buffNextVocalWithSelfCost":
      return effect.selfPopularityCostOnTurnEnd > 0
        ? `다음 보컬 카드 데미지 +${effect.amount} (이번 턴 종료 시 자신 인기도 ${effect.selfPopularityCostOnTurnEnd} 감소)`
        : `다음 보컬 카드 데미지 +${effect.amount}`;
    case "debuffOpponentNextVocal":
      return `상대의 다음 보컬 카드 데미지 -${effect.amount}`;
    case "gainPPNow":
      return `재생 포인트 즉시 +${effect.amount}`;
    case "draw":
      return `카드 ${effect.amount}장 드로우`;
    case "drawThenDiscardRandom":
      return `카드 ${effect.draw}장 드로우 후 무작위로 ${effect.discard}장 버림`;
    case "negateOpponentNextSupportOrStory":
      return `상대의 다음 서포트/스토리 카드 효과 무효화`;
    case "installStoryTick":
      return `설치: ${effect.duration}턴간 매 턴 시작 시 [${tickText(effect.tick)}]`;
    case "installReviveOnceOnDeath":
      return `설치: 자신의 비용 ${effect.maxCost} 이하 곡 카드가 무덤에 갈 때 1회, 즉시 손으로 되돌림`;
    case "markReviveOnceInGraveyard":
      return `이 카드는 무덤에 간 뒤, 자신의 다음 턴 시작 시 1회 손으로 돌아온다`;
    case "stealRandomCard":
      return `상대의 손패에서 무작위로 카드 1장을 가져온다`;
  }
}

export function cardTypeLabel(type: SongCardDef["type"]): string {
  switch (type) {
    case "vocal":
      return "보컬";
    case "support":
      return "서포트";
    case "story":
      return "스토리";
    case "chorus":
      return "코러스";
  }
}

export function rarityLabel(rarity: SongCardDef["rarity"]): string {
  switch (rarity) {
    case "common":
      return "커먼";
    case "rare":
      return "레어";
    case "legendary":
      return "레전더리";
  }
}
