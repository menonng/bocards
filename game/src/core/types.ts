// ─────────────────────────────────────────────────────────────
// 보카로 카드게임 — 핵심 타입 정의
// 이 파일은 순수 데이터 타입만 담는다 (함수 없음).
// 향후 서버가 그대로 재사용해 멀티플레이 상태를 표현할 수 있도록
// 직렬화 가능한(JSON-safe) 구조로만 설계한다.
// ─────────────────────────────────────────────────────────────

// 내부 타입 값은 그대로 두고(엔진 로직 재사용), 사용자에게 보여지는 이름만
// 포켓몬 카드게임(+유희왕 일부) 방식으로 통일한다:
//   vocal   → "공격" (Attack)  — 발동하면 그 즉시 자신의 턴이 끝난다
//   support → "아이템" (Item) — 보통 1회용, 턴당 여러 장 낼 수 있다
//   story / chorus → "효과" (Effect) — 지속효과(story)와 반응형(chorus)을
//     묶어 "효과 카드"로 부른다. story는 유희왕 필드/지속 마법에 가깝고,
//     chorus는 유희왕 함정 카드(상대 턴에도 발동 가능)에 가깝다.
export type CardType = "vocal" | "support" | "story" | "chorus";
export type Rarity = "common" | "rare" | "legendary";

export interface ProducerInfo {
  id: string;
  nameKo: string;
  nameOriginal: string;
  /** 카드 테마 색상(hex). 어두운 배경 위에 은은하게 얹는 포인트 컬러로 사용한다. */
  accent: string;
}

/** 스토리 카드가 매 턴 시작 시 반복 발동하는 효과 */
export type StoryTick =
  | { kind: "damageOpponent"; amount: number }
  | { kind: "drawCard"; amount: number }
  | { kind: "gainPPThisTurn"; amount: number };

/** 곡 카드(스킬 카드)의 발동 효과. 데이터만으로 표현해 직렬화 가능하게 유지한다. */
export type SongEffect =
  | { kind: "damage"; amount: number }
  | { kind: "damageThenHealSelf"; amount: number; heal: number }
  | { kind: "damageBonusIfStoryOnField"; amount: number; bonus: number }
  | { kind: "damageBonusIfPlayedSongThisTurn"; amount: number; bonus: number }
  | { kind: "damageThenOpponentDraws"; amount: number; opponentDraw: number }
  | { kind: "drawAfterDamage"; amount: number; draw: number }
  | { kind: "heal"; amount: number }
  | {
      kind: "buffNextVocalWithSelfCost";
      amount: number;
      selfPopularityCostOnTurnEnd: number;
    }
  | { kind: "debuffOpponentNextVocal"; amount: number }
  | { kind: "gainPPNow"; amount: number }
  | { kind: "draw"; amount: number }
  | { kind: "drawThenDiscardRandom"; draw: number; discard: number }
  | { kind: "damageThenPeekOpponentHand"; amount: number }
  | { kind: "negateOpponentNextSupportOrStory" }
  | { kind: "installStoryTick"; duration: number; tick: StoryTick }
  | { kind: "installReviveOnceOnDeath"; maxCost: number }
  | { kind: "markReviveOnceInGraveyard" }
  | { kind: "stealRandomCard" }
  | { kind: "drawWithSelfDuplicateChance"; amount: number; duplicateChance: number };

/** 비용을 상황에 따라 낮춰주는 규칙 (함수 대신 데이터로 표현) */
export type CostRule = {
  kind: "reduceIfHandLow";
  threshold: number;
  reduction: number;
};

export interface SongCardDef {
  id: string;
  nameKo: string;
  nameOriginal: string;
  producerId: string;
  cost: number;
  type: CardType;
  rarity: Rarity;
  /** 신화입성곡(니코니코동화 1,000만 재생 달성) 여부 */
  isMyth: boolean;
  /** 유튜브 1억 회 재생 달성 여부 (신화입성과 별개 기준) */
  youtube100M?: boolean;
  effect: SongEffect;
  costRule?: CostRule;
  /** true면 발동 후 무덤으로 가지 않고 바로 손으로 돌아온다 (예: 롤링 걸) */
  reusable?: boolean;
  /** 원곡 투고일 (YYYY-MM-DD). 확인되지 않은 곡은 생략. */
  releaseDate?: string;
  /** 신화입성(니코니코 1,000만 재생) 달성일 (YYYY-MM-DD). isMyth인 곡만. */
  mythDate?: string;
  /** 카드 뒷면/툴팁에 짧게 곁들이는 코멘트 — 가사 한 구절의 번역, 혹은 그 곡을
   *  대표하는 문장. 실제 가사 인용은 아주 짧게(한 줄)만 다뤄 인용 범위를 최소화한다. */
  flavor: string;
}

/** 무대 카드(P카드)가 게임 전체에 적용하는 공용 규칙 수정치 */
export interface StageModifiers {
  allSupportEffectBonus?: number;
  allVocalDamageBonus?: number;
  startPopularityDelta?: number;
  ppMaxDelta?: number;
  storyDurationDelta?: number;
  turnLimitDelta?: number;
  extraCardPlayPerTurn?: number;
  handLimitDelta?: number;
  extraDrawPerTurn?: number;
  endOfTurnRandomDiscard?: number;
  graveyardReviveOnTurnStartMaxCost?: number;
}

export interface StageCardDef {
  id: string;
  producerId: string;
  nameKo: string;
  description: string;
  modifiers: StageModifiers;
}

// ── 런타임 상태 ──────────────────────────────────────────────

export interface CardInstance {
  instanceId: string;
  defId: string;
  /** 카드별 특수 플래그 (예: 장산범의 1회용 부활 사용 여부) */
  flags?: Record<string, boolean>;
}

export interface FieldStory {
  instanceId: string;
  defId: string;
  ownerIndex: 0 | 1;
  remainingTurns: number;
  tick?: StoryTick;
  /** 윤회형(1회성 트리거) 스토리는 tick 대신 아래 두 값을 사용 */
  reviveOnDeathAvailable?: boolean;
  reviveMaxCost?: number;
}

export interface PlayerState {
  name: string;
  popularity: number;
  pp: number;
  ppMax: number;
  handLimit: number;
  hand: CardInstance[];
  deck: CardInstance[];
  graveyard: CardInstance[];
  fieldStories: FieldStory[];
  /** 이번 자신 턴에 이미 곡 카드를 발동했는지 (표리 러버즈 판정용) */
  playedSongThisTurn: boolean;
  /** 이번 턴에 사용 가능한 메인 카드 발동 횟수 */
  mainPlaysRemaining: number;
  /** 다음 보컬 카드에 적용될 데미지 보너스 (서포트 카드가 부여) */
  nextVocalDamageBonus: number;
  /** 턴 종료 시 자신에게 들어올 인기도 감소 (고스트 룰 대가) */
  pendingSelfDamageOnTurnEnd: number;
  /** 다음에 낼 서포트/스토리 카드 효과가 무효화되는지 (살리에리) */
  negateNextSupportOrStory: boolean;
}

export type GamePhase =
  | "setup"
  | "intro"
  | "draw"
  | "charge"
  | "main"
  | "reaction"
  | "end"
  | "gameover";

export type GameMode = "battle" | "chart";

export interface GameState {
  players: [PlayerState, PlayerState];
  activePlayerIndex: 0 | 1;
  turnNumber: number;
  phase: GamePhase;
  activeStageCardIds: string[];
  mode: GameMode;
  chartModeTurnLimit: number;
  winnerIndex: 0 | 1 | "draw" | null;
  log: string[];
  /** 상대 손패를 잠깐 공개할 때 UI에 표시할 정보 (모자이크롤) */
  revealedHand: { ownerIndex: 0 | 1; cards: CardInstance[] } | null;
}

/** 덱을 구성할 때 공격/아이템/효과 카드를 각각 얼마의 비율로 뽑을지 (합이 0보다 크면 됨, 내부에서 정규화) */
export interface DeckTypeRatio {
  attack: number;
  item: number;
  effect: number;
}

export type GameAction =
  | {
      type: "START_GAME";
      // 무대 카드(P카드)는 원칙적으로 게임 시작 시 무작위로 정해진다.
      // 생략하면 엔진이 STAGE_CARDS 중 1장을 무작위로 뽑는다. (테스트 등의
      // 목적으로만 직접 지정 — 실제 UI는 항상 생략한다)
      stageCardIds?: string[];
      mode: GameMode;
      player0Name: string;
      player1Name: string;
      // 각 플레이어의 70장 덱을 무작위로 구성할 때 쓸 타입별 분배 비율.
      // 생략하면 카드 풀의 기본 분포를 사용한다.
      player0DeckRatio?: DeckTypeRatio;
      player1DeckRatio?: DeckTypeRatio;
      seed?: number;
    }
  | { type: "PLAY_CARD"; playerIndex: 0 | 1; instanceId: string }
  | { type: "END_TURN"; playerIndex: 0 | 1 }
  | { type: "PASS_REACTION"; playerIndex: 0 | 1 }
  | { type: "DISMISS_REVEAL" };
