// ─────────────────────────────────────────────────────────────
// 보카로 카드게임 — 게임 엔진 (순수 함수 기반 리듀서)
//
// reduce(state, action) => newState 형태의 순수 함수로 구현했다.
// 부수효과(DOM 조작 등)는 전혀 없다. 이렇게 만든 이유는 이 엔진을
// 그대로 서버(권위 서버)에 옮겨 멀티플레이에 재사용하기 위함이다:
// 클라이언트는 액션만 서버로 보내고, 서버가 동일한 reduce()를 실행해
// 새 상태를 계산한 뒤 양쪽에 브로드캐스트하면 된다.
// ─────────────────────────────────────────────────────────────

import {
  CardInstance,
  DeckTypeRatio,
  FieldStory,
  GameAction,
  GameState,
  PlayerState,
  SongCardDef,
  StageModifiers,
  StoryTick,
} from "./types.js";
import { SONG_CARDS } from "./data/songCards.js";
import { STAGE_CARDS } from "./data/stageCards.js";

// ── 조회 헬퍼 ────────────────────────────────────────────────

const SONG_BY_ID = new Map(SONG_CARDS.map((c) => [c.id, c]));
const STAGE_BY_ID = new Map(STAGE_CARDS.map((c) => [c.id, c]));

export function getSongDef(defId: string): SongCardDef {
  const def = SONG_BY_ID.get(defId);
  if (!def) throw new Error(`Unknown song card: ${defId}`);
  return def;
}

function getStageDef(id: string) {
  const def = STAGE_BY_ID.get(id);
  if (!def) throw new Error(`Unknown stage card: ${id}`);
  return def;
}

/** 현재 활성화된 무대 카드(들)의 수정치를 합산한다. */
export function getActiveModifiers(state: GameState): Required<StageModifiers> {
  const total: Required<StageModifiers> = {
    allSupportEffectBonus: 0,
    allVocalDamageBonus: 0,
    startPopularityDelta: 0,
    ppMaxDelta: 0,
    storyDurationDelta: 0,
    turnLimitDelta: 0,
    extraCardPlayPerTurn: 0,
    handLimitDelta: 0,
    extraDrawPerTurn: 0,
    endOfTurnRandomDiscard: 0,
    graveyardReviveOnTurnStartMaxCost: 0,
  };
  for (const id of state.activeStageCardIds) {
    const mods = getStageDef(id).modifiers;
    for (const key of Object.keys(total) as (keyof StageModifiers)[]) {
      total[key] += mods[key] ?? 0;
    }
  }
  return total;
}

/** 발동한 카드의 소속 P가 현재 무대와 일치하면 true (무대 시너지) */
function hasStageSynergy(state: GameState, producerId: string): boolean {
  return state.activeStageCardIds.some(
    (id) => getStageDef(id).producerId === producerId,
  );
}

// ── 난수 (간단한 시드 가능 PRNG — 재현 가능한 셔플/드로우를 위해) ──

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 덱 구성: 카드 풀에서 70장을 무작위로 뽑는다 ────────────────
//
// 포켓몬 카드게임처럼 "공격/아이템/효과" 세 묶음으로 나눈 뒤, 플레이어가
// 정한 비율(DeckTypeRatio)에 따라 묶음을 고르고, 그 묶음 안에서 카드 1장을
// 균등 무작위로 뽑는다. 카드 풀(48장)보다 덱이 크므로(70장) 같은 카드가
// 여러 장 들어갈 수 있지만, 레전더리(신화입성곡 등)는 덱당 1장으로 제한한다.

const DECK_SIZE = 70;

type DeckBucket = "attack" | "item" | "effect";

function bucketOf(type: SongCardDef["type"]): DeckBucket {
  if (type === "vocal") return "attack";
  if (type === "support") return "item";
  return "effect"; // story | chorus
}

const BUCKET_CARDS: Record<DeckBucket, SongCardDef[]> = {
  attack: SONG_CARDS.filter((c) => bucketOf(c.type) === "attack"),
  item: SONG_CARDS.filter((c) => bucketOf(c.type) === "item"),
  effect: SONG_CARDS.filter((c) => bucketOf(c.type) === "effect"),
};

/** 카드 풀의 실제 타입 분포를 그대로 따르는 기본 비율 (셋업 화면 초기값으로도 사용) */
export const DEFAULT_DECK_RATIO: DeckTypeRatio = {
  attack: BUCKET_CARDS.attack.length,
  item: BUCKET_CARDS.item.length,
  effect: BUCKET_CARDS.effect.length,
};

function pickBucket(rng: () => number, ratio: DeckTypeRatio): DeckBucket {
  const a = Math.max(0, ratio.attack);
  const i = Math.max(0, ratio.item);
  const e = Math.max(0, ratio.effect);
  const total = a + i + e;
  if (total <= 0) return pickBucket(rng, DEFAULT_DECK_RATIO);
  let r = rng() * total;
  if ((r -= a) < 0) return "attack";
  if ((r -= i) < 0) return "item";
  return "effect";
}

function makeDeck(rng: () => number, ownerTag: string, ratio: DeckTypeRatio): CardInstance[] {
  const instances: CardInstance[] = [];
  const usedLegendary = new Set<string>();
  let seq = 0;
  while (instances.length < DECK_SIZE) {
    const bucket = pickBucket(rng, ratio);
    const pool = BUCKET_CARDS[bucket].length > 0 ? BUCKET_CARDS[bucket] : SONG_CARDS;
    let def = pool[Math.floor(rng() * pool.length)];
    if (def.rarity === "legendary" && usedLegendary.has(def.id)) {
      // 레전더리 1장 제한: 같은 묶음의 다른(아직 안 쓴) 카드로 재추첨
      const alt = pool.filter((c) => c.rarity !== "legendary" || !usedLegendary.has(c.id));
      if (alt.length > 0) def = alt[Math.floor(rng() * alt.length)];
      // alt가 비어있으면(극단적 케이스) 중복을 그대로 허용한다.
    }
    if (def.rarity === "legendary") usedLegendary.add(def.id);
    instances.push({ instanceId: `${ownerTag}-${def.id}-${seq++}`, defId: def.id });
  }
  return shuffle(instances, rng);
}

// ── 상태 생성 ────────────────────────────────────────────────

const BASE_PP_MAX = 10;
const BASE_HAND_LIMIT = 7;
const BASE_START_POPULARITY = 20;
const BASE_CHART_TURN_LIMIT = 20;
const OPENING_HAND_SIZE = 5;

function createPlayer(name: string, deck: CardInstance[]): PlayerState {
  return {
    name,
    popularity: BASE_START_POPULARITY,
    pp: 0,
    ppMax: BASE_PP_MAX,
    handLimit: BASE_HAND_LIMIT,
    hand: [],
    deck,
    graveyard: [],
    fieldStories: [],
    playedSongThisTurn: false,
    mainPlaysRemaining: 1,
    nextVocalDamageBonus: 0,
    pendingSelfDamageOnTurnEnd: 0,
    negateNextSupportOrStory: false,
  };
}

function drawOne(player: PlayerState): PlayerState {
  if (player.deck.length === 0) return player; // 덱 소진: 더 이상 드로우 없음(패널티 없음, MVP 단순화)
  const [card, ...rest] = player.deck;
  return { ...player, deck: rest, hand: [...player.hand, card] };
}

function drawN(player: PlayerState, n: number): PlayerState {
  let p = player;
  for (let i = 0; i < n; i++) p = drawOne(p);
  return p;
}

export function startGame(action: Extract<GameAction, { type: "START_GAME" }>): GameState {
  const rng = mulberry32(action.seed ?? Date.now());

  // P카드(무대 카드)는 게임 시작 시 무작위로 1장 정해진다. (직접 지정된 경우엔
  // 그대로 사용 — 테스트/디버그 용도)
  const stageCardIds =
    action.stageCardIds && action.stageCardIds.length > 0
      ? action.stageCardIds
      : [STAGE_CARDS[Math.floor(rng() * STAGE_CARDS.length)].id];

  const deck0 = makeDeck(rng, "p0", action.player0DeckRatio ?? DEFAULT_DECK_RATIO);
  const deck1 = makeDeck(rng, "p1", action.player1DeckRatio ?? DEFAULT_DECK_RATIO);

  let state: GameState = {
    players: [
      createPlayer(action.player0Name, deck0),
      createPlayer(action.player1Name, deck1),
    ],
    activePlayerIndex: 0,
    turnNumber: 1,
    phase: "intro",
    activeStageCardIds: stageCardIds,
    mode: action.mode,
    chartModeTurnLimit: BASE_CHART_TURN_LIMIT,
    winnerIndex: null,
    log: ["게임을 시작합니다."],
    revealedHand: null,
  };

  const mods = getActiveModifiers(state);
  state = {
    ...state,
    chartModeTurnLimit: BASE_CHART_TURN_LIMIT + mods.turnLimitDelta,
    players: [
      applyStartOfGameModifiers(state.players[0], mods),
      applyStartOfGameModifiers(state.players[1], mods),
    ] as [PlayerState, PlayerState],
  };

  // 오프닝 핸드
  state = updatePlayer(state, 0, (p) => drawN(p, OPENING_HAND_SIZE));
  state = updatePlayer(state, 1, (p) => drawN(p, OPENING_HAND_SIZE));

  state = { ...state, log: [...state.log, describeStage(state)] };

  return runIntroThroughCharge(state);
}

function describeStage(state: GameState): string {
  const names = state.activeStageCardIds
    .map((id) => getStageDef(id).nameKo)
    .join(", ");
  return `무대 카드: ${names}`;
}

function applyStartOfGameModifiers(
  player: PlayerState,
  mods: Required<StageModifiers>,
): PlayerState {
  return {
    ...player,
    popularity: Math.max(1, BASE_START_POPULARITY + mods.startPopularityDelta),
    ppMax: Math.max(1, BASE_PP_MAX + mods.ppMaxDelta),
    handLimit: Math.max(1, BASE_HAND_LIMIT + mods.handLimitDelta),
  };
}

function updatePlayer(
  state: GameState,
  index: 0 | 1,
  fn: (p: PlayerState) => PlayerState,
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[index] = fn(players[index]);
  return { ...state, players };
}

function otherIndex(i: 0 | 1): 0 | 1 {
  return i === 0 ? 1 : 0;
}

function withLog(state: GameState, line: string): GameState {
  return { ...state, log: [...state.log, line] };
}

// ── 턴 시작 처리: 인트로(스토리 틱 + 50mang 부활) → 드로우 → 차지 ──

function runIntroThroughCharge(state: GameState): GameState {
  const active = state.activePlayerIndex;
  const mods = getActiveModifiers(state);
  let s = state;

  s = withLog(s, `--- ${s.players[active].name}의 턴 ${s.turnNumber} ---`);

  // 1) 스토리 카드 틱 처리 (여러 스토리가 동시에 상대에게 데미지를 줄 수도 있으므로 합산한다)
  let totalStoryDamageToOpponent = 0;
  s = updatePlayer(s, active, (p) => {
    let player = p;
    const remainingStories: FieldStory[] = [];
    for (const story of player.fieldStories) {
      if (story.tick) {
        const result = applyStoryTick(story.tick, player);
        player = result.player;
        if (result.opponentDamage) totalStoryDamageToOpponent += result.opponentDamage;
      }
      const remaining = story.remainingTurns - 1;
      if (remaining > 0) remainingStories.push({ ...story, remainingTurns: remaining });
    }
    return { ...player, fieldStories: remainingStories };
  });
  if (totalStoryDamageToOpponent > 0) {
    s = dealDamage(s, otherIndex(active), totalStoryDamageToOpponent, "story");
  }

  // 2) 50mang 무대: 무덤 부활 체크
  if (mods.graveyardReviveOnTurnStartMaxCost > 0) {
    s = updatePlayer(s, active, (p) => {
      const idx = p.graveyard.findIndex(
        (c) => getSongDef(c.defId).cost <= mods.graveyardReviveOnTurnStartMaxCost,
      );
      if (idx === -1) return p;
      const card = p.graveyard[idx];
      const graveyard = [...p.graveyard.slice(0, idx), ...p.graveyard.slice(idx + 1)];
      return { ...p, graveyard, hand: [...p.hand, card] };
    });
  }

  // 3) 장산범: 무덤에서 부활 대기 중인 카드 회수
  s = updatePlayer(s, active, (p) => {
    const idx = p.graveyard.findIndex((c) => c.flags?.revivePending);
    if (idx === -1) return p;
    const card = p.graveyard[idx];
    const graveyard = [...p.graveyard.slice(0, idx), ...p.graveyard.slice(idx + 1)];
    const revived: CardInstance = {
      ...card,
      flags: { ...card.flags, revivePending: false, reviveUsed: true },
    };
    return { ...p, graveyard, hand: [...p.hand, revived] };
  });

  if (checkGameOver(s)) return s;

  // 덱 소진: 더 낼 곡이 없으면 그 자리에서 인기도 비교로 승부를 가른다
  // (MVP 단순화 — 실제 TCG의 "드로우 실패 시 패배" 규칙 대신, 무승부 스톨을 막기 위한 최소한의 종료 조건)
  if (s.players[active].deck.length === 0) {
    return finalizePopularityComparison(s, "모든 곡을 다 썼습니다 (덱 소진)");
  }

  // 4) 드로우 (기본 1장 + 이요와 무대 보너스)
  const drawAmount = 1 + mods.extraDrawPerTurn;
  s = updatePlayer(s, active, (p) => drawN(p, drawAmount));

  // 5) 차지: 재생 포인트 +1
  // (nextVocalDamageBonus는 여기서 초기화하지 않는다 — 서포트 카드로 예약해둔
  //  버프/디버프는 "다음 보컬 카드를 낼 때"까지 턴을 넘어서도 유지되어야
  //  1턴 1발동 기본 룰에서도 실제로 의미가 있다. 소모는 보컬 카드 발동 시 처리한다.)
  s = updatePlayer(s, active, (p) => ({
    ...p,
    pp: Math.min(p.ppMax, p.pp + 1),
    mainPlaysRemaining: 1 + mods.extraCardPlayPerTurn,
    playedSongThisTurn: false,
  }));

  return { ...s, phase: "main" };
}

function applyStoryTick(
  tick: StoryTick,
  player: PlayerState,
): { player: PlayerState; opponentDamage?: number } {
  switch (tick.kind) {
    case "drawCard":
      return { player: drawN(player, tick.amount) };
    case "gainPPThisTurn":
      return {
        player: { ...player, pp: Math.min(player.ppMax, player.pp + tick.amount) },
      };
    case "damageOpponent":
      return { player, opponentDamage: tick.amount };
  }
}

// ── 데미지 / 회복 ────────────────────────────────────────────

function dealDamage(
  state: GameState,
  targetIndex: 0 | 1,
  amount: number,
  source: "vocal" | "story" | "other",
): GameState {
  const mods = getActiveModifiers(state);
  const bonus = source === "vocal" ? mods.allVocalDamageBonus : 0;
  const total = Math.max(0, amount + bonus);
  let s = updatePlayer(state, targetIndex, (p) => ({
    ...p,
    popularity: Math.max(0, p.popularity - total),
  }));
  s = withLog(
    s,
    `${state.players[targetIndex].name}의 인기도가 ${total} 감소했습니다. (남은: ${s.players[targetIndex].popularity})`,
  );
  return finalizeIfGameOver(s);
}

function healPlayer(state: GameState, index: 0 | 1, amount: number): GameState {
  let s = updatePlayer(state, index, (p) => ({ ...p, popularity: p.popularity + amount }));
  s = withLog(s, `${state.players[index].name}의 인기도가 ${amount} 회복했습니다.`);
  return s;
}

function checkGameOver(state: GameState): boolean {
  return state.winnerIndex !== null;
}

function finalizeIfGameOver(state: GameState): GameState {
  if (state.phase === "gameover" || state.mode !== "battle") return state;
  const [p0, p1] = state.players;
  if (p0.popularity <= 0 && p1.popularity <= 0) {
    return withLog({ ...state, phase: "gameover", winnerIndex: "draw" }, "동시에 쓰러졌습니다. 무승부!");
  }
  if (p0.popularity <= 0) {
    return withLog({ ...state, phase: "gameover", winnerIndex: 1 }, `${p1.name} 승리!`);
  }
  if (p1.popularity <= 0) {
    return withLog({ ...state, phase: "gameover", winnerIndex: 0 }, `${p0.name} 승리!`);
  }
  return state;
}

// ── 카드 발동 ────────────────────────────────────────────────

function computeCost(def: SongCardDef, player: PlayerState): number {
  let cost = def.cost;
  if (def.costRule?.kind === "reduceIfHandLow") {
    // 발동 전 손패 기준(자기 자신 포함) 이므로, 자기 자신을 뺀 나머지 곡카드 수로 판단
    const remaining = player.hand.length - 1;
    if (remaining <= def.costRule.threshold) cost -= def.costRule.reduction;
  }
  return Math.max(0, cost);
}

export function canPlayCard(
  state: GameState,
  playerIndex: 0 | 1,
  instanceId: string,
): { ok: boolean; reason?: string } {
  if (state.phase === "gameover") return { ok: false, reason: "게임이 종료되었습니다." };
  const player = state.players[playerIndex];
  const inst = player.hand.find((c) => c.instanceId === instanceId);
  if (!inst) return { ok: false, reason: "손패에 없는 카드입니다." };
  const def = getSongDef(inst.defId);

  if (state.phase === "reaction") {
    if (playerIndex === state.activePlayerIndex)
      return { ok: false, reason: "반응 구간에서는 상대만 카드를 낼 수 있습니다." };
    if (def.type !== "chorus")
      return { ok: false, reason: "반응 구간에는 코러스 카드만 낼 수 있습니다." };
  } else if (state.phase === "main") {
    if (playerIndex !== state.activePlayerIndex)
      return { ok: false, reason: "자신의 턴이 아닙니다." };
    // 메인 발동 횟수 제한은 공격(vocal)·효과-지속형(story)에만 적용된다.
    // 아이템(support)·효과-반응형(chorus)은 재생 포인트만 허락하면 몇 장이든 낼 수 있다.
    if (
      (def.type === "vocal" || def.type === "story") &&
      player.mainPlaysRemaining <= 0
    )
      return { ok: false, reason: "이번 턴에 낼 수 있는 공격/효과(지속형) 카드를 모두 소진했습니다." };
  } else {
    return { ok: false, reason: "지금은 카드를 낼 수 없는 단계입니다." };
  }

  const cost = computeCost(def, player);
  if (player.pp < cost) return { ok: false, reason: "재생 포인트가 부족합니다." };
  return { ok: true };
}

function playCard(state: GameState, playerIndex: 0 | 1, instanceId: string): GameState {
  const check = canPlayCard(state, playerIndex, instanceId);
  if (!check.ok) return withLog(state, `(무시됨) ${check.reason}`);

  const opponentIndex = otherIndex(playerIndex);
  const player = state.players[playerIndex];
  const inst = player.hand.find((c) => c.instanceId === instanceId)!;
  const def = getSongDef(inst.defId);
  const cost = computeCost(def, player);
  const mods = getActiveModifiers(state);
  const synergy = hasStageSynergy(state, def.producerId) ? 1 : 0;

  // 손패에서 제거 + 비용 지불
  let s = updatePlayer(state, playerIndex, (p) => ({
    ...p,
    pp: p.pp - cost,
    hand: p.hand.filter((c) => c.instanceId !== instanceId),
  }));

  const isNegated =
    (def.type === "support" || def.type === "story") &&
    s.players[playerIndex].negateNextSupportOrStory;
  if (isNegated) {
    s = updatePlayer(s, playerIndex, (p) => ({ ...p, negateNextSupportOrStory: false }));
    s = withLog(s, `${def.nameKo} 효과가 무효화되었습니다!`);
  } else {
    s = resolveEffect(s, playerIndex, opponentIndex, def, synergy, mods);
  }

  // 소모 카드 처리: 무덤으로 (스토리/윤회/장산범/재사용 카드 예외는 별도 처리)
  const goesToField = def.type === "story" && !isNegated;
  if (def.reusable && !goesToField) {
    // 재사용 가능 카드(예: 롤링 걸)는 무덤에 가지 않고 바로 손으로 돌아온다.
    s = updatePlayer(s, playerIndex, (p) => ({ ...p, hand: [...p.hand, inst] }));
  } else if (!goesToField) {
    let flags = inst.flags;
    if (def.effect.kind === "markReviveOnceInGraveyard" && !isNegated) {
      flags = { ...flags, revivePending: true };
    }

    // 윤회: 이 플레이어에게 사용 대기 중인 부활 스토리가 있고, 방금 낸 카드가
    // 그 조건(비용 이하)을 만족하면 무덤 대신 즉시 손으로 되돌아온다 (1회용 소모).
    const reviveStoryIdx = s.players[playerIndex].fieldStories.findIndex(
      (story) =>
        story.reviveOnDeathAvailable &&
        (story.reviveMaxCost ?? 0) >= def.cost,
    );
    if (reviveStoryIdx !== -1) {
      s = updatePlayer(s, playerIndex, (p) => ({
        ...p,
        fieldStories: p.fieldStories.filter((_, i) => i !== reviveStoryIdx),
        hand: [...p.hand, { ...inst, flags }],
      }));
      s = withLog(s, `윤회의 힘으로 [${def.nameKo}]가 손으로 돌아왔습니다.`);
    } else {
      s = updatePlayer(s, playerIndex, (p) => ({
        ...p,
        graveyard: [...p.graveyard, { ...inst, flags }],
      }));
    }
  }

  // "발동했다"는 표시는 코러스(효과-반응형)를 제외한 모든 타입에 남긴다
  // (표리 러버즈 등 "이번 턴에 이미 곡을 냈다면" 판정용).
  if (def.type !== "chorus") {
    s = updatePlayer(s, playerIndex, (p) => ({ ...p, playedSongThisTurn: true }));
  }
  // 메인 발동 횟수(mainPlaysRemaining)는 공격(vocal)과 효과-지속형(story)만
  // 소모한다. 아이템(support)과 효과-반응형(chorus)은 포켓몬 카드게임의
  // 아이템 카드처럼 재생 포인트가 허락하는 한 턴당 여러 장 낼 수 있다.
  if (def.type === "vocal" || def.type === "story") {
    s = updatePlayer(s, playerIndex, (p) => ({
      ...p,
      mainPlaysRemaining: Math.max(0, p.mainPlaysRemaining - 1),
    }));
  }

  s = withLog(s, `${state.players[playerIndex].name}: [${def.nameKo}] 발동! (비용 ${cost})`);
  s = finalizeIfGameOver(s);

  // 유희왕/포켓몬 카드게임처럼, 보컬(공격) 카드를 발동하면 그 즉시 자신의
  // 턴이 끝난다 — 남은 메인 발동 횟수(예: wowaka 무대)가 있어도 마찬가지다.
  if (s.phase === "main" && def.type === "vocal") {
    s = beginEndOfTurnSequence(s, playerIndex);
  }

  return s;
}

function resolveEffect(
  state: GameState,
  actor: 0 | 1,
  target: 0 | 1,
  def: SongCardDef,
  synergy: number,
  mods: Required<StageModifiers>,
): GameState {
  const actorPlayer = state.players[actor];
  const supportBonus = def.type === "support" ? mods.allSupportEffectBonus + synergy : 0;
  const vocalSynergy = def.type === "vocal" ? synergy : 0;
  let s = state;

  // 각 case 블록에서 def.effect를 지역 const로 별도 바인딩한다.
  // (닫힌 화살표 함수 안에서는 switch 판별 프로퍼티의 좁혀진 타입이
  //  중첩 프로퍼티 접근까지는 유지되지 않는 TS의 한계를 피하기 위함)
  const effect = def.effect;
  switch (effect.kind) {
    case "damage": {
      const total = effect.amount + actorPlayer.nextVocalDamageBonus + vocalSynergy;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealDamage(s, target, total, "vocal");
      break;
    }
    case "damageThenHealSelf": {
      const total = effect.amount + actorPlayer.nextVocalDamageBonus + vocalSynergy;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealDamage(s, target, total, "vocal");
      s = healPlayer(s, actor, effect.heal);
      break;
    }
    case "damageBonusIfStoryOnField": {
      const hasStory = actorPlayer.fieldStories.length > 0;
      const total =
        effect.amount +
        (hasStory ? effect.bonus : 0) +
        actorPlayer.nextVocalDamageBonus +
        vocalSynergy;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealDamage(s, target, total, "vocal");
      break;
    }
    case "damageBonusIfPlayedSongThisTurn": {
      const total =
        effect.amount +
        (actorPlayer.playedSongThisTurn ? effect.bonus : 0) +
        actorPlayer.nextVocalDamageBonus +
        vocalSynergy;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealDamage(s, target, total, "vocal");
      break;
    }
    case "damageThenOpponentDraws": {
      const total = effect.amount + actorPlayer.nextVocalDamageBonus + vocalSynergy;
      const opponentDraw = effect.opponentDraw;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealDamage(s, target, total, "vocal");
      if (opponentDraw > 0) {
        s = updatePlayer(s, target, (p) => drawN(p, opponentDraw));
      }
      break;
    }
    case "damageThenPeekOpponentHand": {
      const total = effect.amount + actorPlayer.nextVocalDamageBonus + vocalSynergy;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealDamage(s, target, total, "vocal");
      s = { ...s, revealedHand: { ownerIndex: target, cards: s.players[target].hand } };
      break;
    }
    case "drawAfterDamage": {
      const total = effect.amount + actorPlayer.nextVocalDamageBonus + vocalSynergy;
      const drawAmount = effect.draw;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealDamage(s, target, total, "vocal");
      s = updatePlayer(s, actor, (p) => drawN(p, drawAmount));
      break;
    }
    case "heal": {
      s = healPlayer(s, actor, effect.amount + supportBonus);
      break;
    }
    case "buffNextVocalWithSelfCost": {
      const amount = effect.amount + supportBonus;
      const selfCost = effect.selfPopularityCostOnTurnEnd;
      s = updatePlayer(s, actor, (p) => ({
        ...p,
        nextVocalDamageBonus: p.nextVocalDamageBonus + amount,
        pendingSelfDamageOnTurnEnd: p.pendingSelfDamageOnTurnEnd + selfCost,
      }));
      break;
    }
    case "debuffOpponentNextVocal": {
      const amount = effect.amount + supportBonus;
      s = updatePlayer(s, target, (p) => ({
        ...p,
        nextVocalDamageBonus: p.nextVocalDamageBonus - amount,
      }));
      break;
    }
    case "gainPPNow": {
      const amount = effect.amount + supportBonus;
      s = updatePlayer(s, actor, (p) => ({
        ...p,
        pp: Math.min(p.ppMax, p.pp + amount),
      }));
      break;
    }
    case "draw": {
      const amount = effect.amount;
      s = updatePlayer(s, actor, (p) => drawN(p, amount));
      break;
    }
    case "drawWithSelfDuplicateChance": {
      // 롤링 걸: 카드를 뽑을 때마다 일정 확률로 "뽑은 카드" 대신 롤링 걸
      // 자신의 새 사본이 손으로 들어온다 (덱을 소모하지 않는 복제).
      const amount = effect.amount;
      const chance = effect.duplicateChance;
      const selfDefId = def.id;
      s = updatePlayer(s, actor, (p) => {
        let player = p;
        for (let i = 0; i < amount; i++) {
          if (Math.random() < chance) {
            const dup: CardInstance = {
              instanceId: `${selfDefId}-dup-${Date.now()}-${Math.random()}`,
              defId: selfDefId,
            };
            player = { ...player, hand: [...player.hand, dup] };
          } else {
            player = drawOne(player);
          }
        }
        return player;
      });
      break;
    }
    case "drawThenDiscardRandom": {
      const drawAmount = effect.draw;
      const discardAmount = effect.discard;
      s = updatePlayer(s, actor, (p) => drawN(p, drawAmount));
      s = updatePlayer(s, actor, (p) => randomDiscard(p, discardAmount));
      break;
    }
    case "negateOpponentNextSupportOrStory": {
      s = updatePlayer(s, target, (p) => ({ ...p, negateNextSupportOrStory: true }));
      break;
    }
    case "installStoryTick": {
      const duration = effect.duration + mods.storyDurationDelta;
      const story: FieldStory = {
        instanceId: `${def.id}-story-${Date.now()}-${Math.random()}`,
        defId: def.id,
        ownerIndex: actor,
        remainingTurns: duration,
        tick: effect.tick,
      };
      s = updatePlayer(s, actor, (p) => ({ ...p, fieldStories: [...p.fieldStories, story] }));
      break;
    }
    case "installReviveOnceOnDeath": {
      const story: FieldStory = {
        instanceId: `${def.id}-story-${Date.now()}-${Math.random()}`,
        defId: def.id,
        ownerIndex: actor,
        remainingTurns: 999,
        reviveOnDeathAvailable: true,
        reviveMaxCost: effect.maxCost,
      };
      s = updatePlayer(s, actor, (p) => ({ ...p, fieldStories: [...p.fieldStories, story] }));
      break;
    }
    case "markReviveOnceInGraveyard": {
      // 무덤행 시 flags.revivePending 처리는 playCard()에서 담당
      break;
    }
    case "stealRandomCard": {
      const targetHand = s.players[target].hand;
      if (targetHand.length > 0) {
        const idx = Math.floor(Math.random() * targetHand.length);
        const stolen = targetHand[idx];
        s = updatePlayer(s, target, (p) => ({
          ...p,
          hand: p.hand.filter((_, i) => i !== idx),
        }));
        s = updatePlayer(s, actor, (p) => ({ ...p, hand: [...p.hand, stolen] }));
        s = withLog(s, `상대의 손패에서 카드 한 장을 미쿠미쿠하게 가져왔습니다!`);
      }
      break;
    }
  }

  return finalizeIfGameOver(s);
}

function randomDiscard(player: PlayerState, amount: number): PlayerState {
  let p = player;
  for (let i = 0; i < amount; i++) {
    if (p.hand.length === 0) break;
    const idx = Math.floor(Math.random() * p.hand.length);
    const card = p.hand[idx];
    p = {
      ...p,
      hand: p.hand.filter((_, hi) => hi !== idx),
      graveyard: [...p.graveyard, card],
    };
  }
  return p;
}

// ── 턴 종료 / 반응 구간 ──────────────────────────────────────

/** 메인 페이즈를 마치고 상대의 반응(코러스) 구간으로 넘기거나, 반응이 필요 없으면 바로 턴을 마친다. */
function beginEndOfTurnSequence(state: GameState, playerIndex: 0 | 1): GameState {
  const opponent = otherIndex(playerIndex);
  const opponentHasChorus = state.players[opponent].hand.some(
    (c) => getSongDef(c.defId).type === "chorus",
  );
  if (opponentHasChorus) {
    return withLog(
      { ...state, phase: "reaction" },
      `${state.players[opponent].name}의 반응 구간입니다. (코러스 카드 또는 패스)`,
    );
  }
  return finishTurn(state);
}

function endTurn(state: GameState, playerIndex: 0 | 1): GameState {
  if (state.phase !== "main" || playerIndex !== state.activePlayerIndex) {
    return withLog(state, "(무시됨) 지금은 턴을 종료할 수 없습니다.");
  }
  return beginEndOfTurnSequence(state, playerIndex);
}

function passReaction(state: GameState, playerIndex: 0 | 1): GameState {
  if (state.phase !== "reaction" || playerIndex === state.activePlayerIndex) {
    return withLog(state, "(무시됨) 지금은 반응을 패스할 수 없습니다.");
  }
  return finishTurn(state);
}

function finishTurn(state: GameState): GameState {
  const active = state.activePlayerIndex;
  const mods = getActiveModifiers(state);
  let s = state;

  // 고스트 룰 등으로 예약된 자기 인기도 감소 적용
  const pending = s.players[active].pendingSelfDamageOnTurnEnd;
  if (pending > 0) {
    s = updatePlayer(s, active, (p) => ({ ...p, pendingSelfDamageOnTurnEnd: 0 }));
    s = dealDamage(s, active, pending, "other");
    if (checkGameOver(s)) return s;
  }

  // 이요와 무대: 턴 종료 시 무작위 카드 버림
  if (mods.endOfTurnRandomDiscard > 0) {
    s = updatePlayer(s, active, (p) => randomDiscard(p, mods.endOfTurnRandomDiscard));
  }

  // 손패 제한 초과 시 무작위 버림 (wowaka 무대로 제한이 줄어들 수 있음)
  s = updatePlayer(s, active, (p) => {
    const over = p.hand.length - p.handLimit;
    return over > 0 ? randomDiscard(p, over) : p;
  });

  // 차트 모드: 턴 제한 도달 시 종료
  if (s.mode === "chart" && s.turnNumber >= s.chartModeTurnLimit) {
    return finalizePopularityComparison(s, "차트 모드 종료");
  }

  const nextActive = otherIndex(active);
  s = {
    ...s,
    activePlayerIndex: nextActive,
    turnNumber: s.turnNumber + 1,
    phase: "intro",
  };
  return runIntroThroughCharge(s);
}

function finalizePopularityComparison(state: GameState, reason: string): GameState {
  const [p0, p1] = state.players;
  let winnerIndex: 0 | 1 | "draw" = "draw";
  if (p0.popularity > p1.popularity) winnerIndex = 0;
  else if (p1.popularity > p0.popularity) winnerIndex = 1;
  const msg =
    winnerIndex === "draw"
      ? `${reason} — 무승부! (인기도 ${p0.popularity} : ${p1.popularity})`
      : `${reason} — ${state.players[winnerIndex].name} 승리! (인기도 ${p0.popularity} : ${p1.popularity})`;
  return withLog({ ...state, phase: "gameover", winnerIndex }, msg);
}

// ── 리듀서 진입점 ────────────────────────────────────────────

export function reduce(state: GameState | null, action: GameAction): GameState {
  if (action.type === "START_GAME") return startGame(action);
  if (!state) throw new Error("게임이 아직 시작되지 않았습니다.");

  switch (action.type) {
    case "PLAY_CARD":
      return playCard(state, action.playerIndex, action.instanceId);
    case "END_TURN":
      return endTurn(state, action.playerIndex);
    case "PASS_REACTION":
      return passReaction(state, action.playerIndex);
    case "DISMISS_REVEAL":
      return { ...state, revealedHand: null };
    default:
      return state;
  }
}
