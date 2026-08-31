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
    allItemEffectBonus: 0,
    allVocalDamageBonus: 0,
    startPopularityDelta: 0,
    storyDurationDelta: 0,
    turnLimitDelta: 0,
    extraCardPlayPerTurn: 0,
    handLimitDelta: 0,
    extraDrawPerTurn: 0,
    endOfTurnRandomDiscard: 0,
    graveyardReviveOnTurnStart: 0,
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
  return state.activeStageCardIds.some((id) => getStageDef(id).producerId === producerId);
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
// 포켓몬 카드게임처럼 "보컬/아이템" 두 묶음으로 나눈 뒤, 플레이어가 정한
// 비율(DeckTypeRatio)에 따라 묶음을 고르고, 그 묶음 안에서 카드 1장을
// 균등 무작위로 뽑는다. 카드 풀보다 덱이 크므로(70장) 같은 카드가 여러 장
// 들어갈 수 있지만, 레전더리(신화입성곡 등)는 덱당 1장으로 제한한다.

const DECK_SIZE = 70;
/** 벤치(교체 대기) 자리 최대 개수. 배틀 자리 1 + 벤치 = 필드 최대 카드 수. */
export const BENCH_SIZE = 5;
/** "마법/함정 카드 존" — 플레이어당 동시 설치 가능한 fieldStories 상한. */
export const SPELL_TRAP_ZONE_SIZE = 3;

type DeckBucket = "vocal" | "item";

const BUCKET_CARDS: Record<DeckBucket, SongCardDef[]> = {
  vocal: SONG_CARDS.filter((c) => c.type === "vocal"),
  item: SONG_CARDS.filter((c) => c.type === "item"),
};

/** 카드 풀의 실제 타입 분포를 그대로 따르는 기본 비율 (셋업 화면 초기값으로도 사용) */
export const DEFAULT_DECK_RATIO: DeckTypeRatio = {
  vocal: BUCKET_CARDS.vocal.length,
  item: BUCKET_CARDS.item.length,
};

function pickBucket(rng: () => number, ratio: DeckTypeRatio): DeckBucket {
  const v = Math.max(0, ratio.vocal);
  const i = Math.max(0, ratio.item);
  const total = v + i;
  if (total <= 0) return pickBucket(rng, DEFAULT_DECK_RATIO);
  return rng() * total < v ? "vocal" : "item";
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

const BASE_HAND_LIMIT = 7;
const BASE_START_POPULARITY = 20;
const BASE_CHART_TURN_LIMIT = 20;
const OPENING_HAND_SIZE = 5;
/** 손패가 완전히 바닥나면(0장) 추가로 뽑아주는 장수 */
export const HAND_REFILL_ON_EMPTY = 3;

function createPlayer(name: string, deck: CardInstance[]): PlayerState {
  return {
    name,
    popularity: BASE_START_POPULARITY,
    handLimit: BASE_HAND_LIMIT,
    hand: [],
    deck,
    graveyard: [],
    fieldStories: [],
    activeBattler: null,
    benchBattlers: [],
    switchedActiveThisTurn: false,
    playedSongThisTurn: false,
    mainPlaysRemaining: 1,
    itemPlaysRemaining: 1,
    nextVocalDamageBonus: 0,
    pendingSelfDamageOnTurnEnd: 0,
    negateNextSupportOrStory: false,
  };
}

// 덱이 빈 상태에서 드로우를 "시도"했는지 플레이어별로 기록한다. 실제 TCG의
// "덱사"(드로우할 카드가 없으면 패배) 규칙을 구현하기 위한 신호로, reduce()
// 진입 시 초기화하고 액션 처리가 끝난 뒤 한 번만 확인한다. 롤링 걸처럼 손으로
// 돌아와 턴당 제한 없이 재사용 가능한 카드가 있기 때문에, "이번 턴에 이미
// 곡 카드를 냈는지"가 아니라 "실제로 드로우가 실패했는지"를 기준으로 삼아야
// 카드 자체에는 인위적인 사용 횟수 제한을 두지 않으면서도 무한 루프를 막을 수 있다.
let deckOutFlags: [boolean, boolean] = [false, false];

function drawOne(player: PlayerState, index: 0 | 1): PlayerState {
  if (player.deck.length === 0) {
    deckOutFlags[index] = true; // 덱사: 뽑을 카드가 없는데 드로우를 시도함
    return player;
  }
  const [card, ...rest] = player.deck;
  return { ...player, deck: rest, hand: [...player.hand, card] };
}

function drawN(player: PlayerState, n: number, index: 0 | 1): PlayerState {
  let p = player;
  for (let i = 0; i < n; i++) p = drawOne(p, index);
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
    players: [createPlayer(action.player0Name, deck0), createPlayer(action.player1Name, deck1)],
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

  // 오프닝 핸드 — 보컬(공격) 카드가 한 장도 없으면 포켓몬 카드게임의 멀리건
  // 규칙대로 손패를 덱에 다시 섞어 넣고 재드로우한다. 유효한 손패가 나오면
  // 그중 첫 번째 보컬 카드를 배틀 자리에 무료로 세운다(메인 발동 횟수 소모
  // 없음) — 시작부터 필드가 비어 있으면 "배틀·벤치 모두 없으면 패배" 규칙이
  // 첫 턴부터 오작동하기 때문이다.
  state = updatePlayer(state, 0, (p) => drawOpeningHandWithMulligan(p, 0, rng));
  state = updatePlayer(state, 1, (p) => drawOpeningHandWithMulligan(p, 1, rng));

  state = { ...state, log: [...state.log, describeStage(state)] };

  return runIntroAndDraw(state);
}

const MAX_MULLIGANS = 20;

/** 오프닝 핸드를 뽑는다 — 보컬 카드가 없으면 손패를 덱에 다시 섞어 넣고
 *  재드로우(멀리건)한다. 성공하면 첫 보컬 카드를 배틀 자리에 세운 상태로 반환. */
function drawOpeningHandWithMulligan(
  player: PlayerState,
  index: 0 | 1,
  rng: () => number,
): PlayerState {
  let p = player;
  for (let mulligans = 0; mulligans < MAX_MULLIGANS; mulligans++) {
    if (mulligans > 0) {
      // 보컬 카드를 못 찾았으므로 손패를 덱에 다시 섞어 넣는다.
      p = { ...p, deck: shuffle([...p.hand, ...p.deck], rng), hand: [] };
    }
    p = drawN(p, OPENING_HAND_SIZE, index);
    const idx = p.hand.findIndex((c) => getSongDef(c.defId).type === "vocal");
    if (idx !== -1) {
      const card = p.hand[idx];
      const def = getSongDef(card.defId);
      return {
        ...p,
        hand: p.hand.filter((_, i) => i !== idx),
        activeBattler: {
          instanceId: card.instanceId,
          defId: card.defId,
          currentHp: def.hp ?? 1,
          maxHp: def.hp ?? 1,
        },
      };
    }
  }
  // 보컬 비율 0%인 극단적 설정 등으로 끝내 보컬 카드를 찾지 못하면, 마지막으로
  // 뽑은 손패 그대로 시작한다 — 배틀 자리는 비워두고, 즉시 패배로 이어지지는
  // 않는다("격파" 시점에만 판정).
  return p;
}

function describeStage(state: GameState): string {
  const names = state.activeStageCardIds.map((id) => getStageDef(id).nameKo).join(", ");
  return `무대 카드: ${names}`;
}

function applyStartOfGameModifiers(
  player: PlayerState,
  mods: Required<StageModifiers>,
): PlayerState {
  return {
    ...player,
    popularity: Math.max(1, BASE_START_POPULARITY + mods.startPopularityDelta),
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

// ── 턴 시작 처리: 인트로(효과 틱 + 50mang 부활) → 드로우 → 메인 준비 ──

function runIntroAndDraw(state: GameState): GameState {
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
        const result = applyStoryTick(story.tick, player, active);
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

  // 2) 50mang 무대: 무덤 부활 체크 (조건 없이 무덤의 카드 1장을 되돌린다)
  if (mods.graveyardReviveOnTurnStart > 0) {
    s = updatePlayer(s, active, (p) => {
      if (p.graveyard.length === 0) return p;
      const [card, ...rest] = p.graveyard;
      return { ...p, graveyard: rest, hand: [...p.hand, card] };
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

  // 덱 소진: 더 낼 곡이 없으면 그 자리에서 체력 비교로 승부를 가른다
  // (MVP 단순화 — 실제 TCG의 "드로우 실패 시 패배" 규칙 대신, 무승부 스톨을 막기 위한 최소한의 종료 조건)
  if (s.players[active].deck.length === 0) {
    return finalizePopularityComparison(s, "모든 곡을 다 썼습니다 (덱 소진)");
  }

  // 4) 드로우 (기본 1장 + 이요와 무대 보너스)
  const drawAmount = 1 + mods.extraDrawPerTurn;
  s = updatePlayer(s, active, (p) => drawN(p, drawAmount, active));

  // 5) 메인 발동 횟수 초기화 (자원 시스템 없이, 이 횟수가 유일한 턴당 제약이다)
  // (nextVocalDamageBonus는 여기서 초기화하지 않는다 — 아이템 카드로 예약해둔
  //  버프/디버프는 "다음 공격 카드를 낼 때"까지 턴을 넘어서도 유지되어야
  //  1턴 1발동 기본 룰에서도 실제로 의미가 있다. 소모는 공격 카드 발동 시 처리한다.)
  s = updatePlayer(s, active, (p) => ({
    ...p,
    mainPlaysRemaining: 1 + mods.extraCardPlayPerTurn,
    itemPlaysRemaining: 1,
    playedSongThisTurn: false,
    switchedActiveThisTurn: false,
  }));

  return { ...s, phase: "main" };
}

function applyStoryTick(
  tick: StoryTick,
  player: PlayerState,
  index: 0 | 1,
): { player: PlayerState; opponentDamage?: number } {
  switch (tick.kind) {
    case "drawCard":
      return { player: drawN(player, tick.amount, index) };
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
    `${state.players[targetIndex].name}의 체력이 ${total} 감소했습니다. (남은: ${s.players[targetIndex].popularity})`,
  );
  return finalizeIfGameOver(s);
}

function healPlayer(state: GameState, index: 0 | 1, amount: number): GameState {
  let s = updatePlayer(state, index, (p) => ({ ...p, popularity: p.popularity + amount }));
  s = withLog(s, `${state.players[index].name}의 체력이 ${amount} 회복했습니다.`);
  return s;
}

/** 카드를 무덤으로 보낸다 — 단, 소유자에게 대기 중인 "윤회" 부활이 있으면
 *  그 대신 카드를 손으로 돌려보낸다(1회용 소모). */
function moveToGraveyardOrRevive(
  state: GameState,
  ownerIndex: 0 | 1,
  card: CardInstance,
  cardNameKo: string,
): GameState {
  let s = state;
  const reviveStoryIdx = s.players[ownerIndex].fieldStories.findIndex(
    (story) => story.reviveOnDeathAvailable,
  );
  if (reviveStoryIdx !== -1) {
    s = updatePlayer(s, ownerIndex, (p) => ({
      ...p,
      fieldStories: p.fieldStories.filter((_, i) => i !== reviveStoryIdx),
      hand: [...p.hand, card],
    }));
    s = withLog(s, `윤회의 힘으로 [${cardNameKo}]가 손으로 돌아왔습니다.`);
  } else {
    s = updatePlayer(s, ownerIndex, (p) => ({
      ...p,
      graveyard: [...p.graveyard, card],
    }));
  }
  return s;
}

/** 스킬(보컬 카드의 공격)이 상대에게 주는 데미지. 유희왕/포켓몬처럼 상대의
 *  "배틀 카드" 체력부터 깎는다. 배틀 카드가 쓰러지면(체력 0 이하) 그 카드는
 *  무덤으로(또는 윤회로 손에) 이동하고, 남은 초과 데미지(overkill)는 그대로
 *  상대 플레이어 체력으로 스며든다. 벤치에 대기 카드가 있으면 자동으로
 *  배틀 자리로 승격되고, 배틀·벤치 모두 보컬 카드가 없어지면(그리고 윤회로도
 *  구제되지 않았으면) 그 즉시 패배한다. */
function dealSkillDamage(state: GameState, targetIndex: 0 | 1, amount: number): GameState {
  const mods = getActiveModifiers(state);
  const total = Math.max(0, amount + mods.allVocalDamageBonus);
  const targetPlayerName = state.players[targetIndex].name;
  const battler = state.players[targetIndex].activeBattler;
  if (!battler) return state; // 배틀 자리가 비어 있으면 데미지를 받을 대상이 없다

  const def = getSongDef(battler.defId);
  const newHp = battler.currentHp - total;
  let s = state;

  if (newHp > 0) {
    s = updatePlayer(s, targetIndex, (p) => ({
      ...p,
      activeBattler: { ...battler, currentHp: newHp },
    }));
    s = withLog(
      s,
      `${targetPlayerName}의 [${def.nameKo}] 체력이 ${total} 감소했습니다. (남은: ${newHp}/${battler.maxHp})`,
    );
    return finalizeIfGameOver(s);
  }

  const overkill = -newHp;
  s = withLog(s, `${targetPlayerName}의 [${def.nameKo}]이(가) 쓰러졌습니다!`);
  const flags =
    def.effect.kind === "markReviveOnceInGraveyard" ? { revivePending: true } : undefined;
  const hadReviveStory = s.players[targetIndex].fieldStories.some((f) => f.reviveOnDeathAvailable);
  s = moveToGraveyardOrRevive(
    s,
    targetIndex,
    { instanceId: battler.instanceId, defId: battler.defId, flags },
    def.nameKo,
  );
  s = updatePlayer(s, targetIndex, (p) => ({ ...p, activeBattler: null }));

  const bench = s.players[targetIndex].benchBattlers;
  if (bench.length > 0) {
    const [promoted, ...rest] = bench;
    s = updatePlayer(s, targetIndex, (p) => ({
      ...p,
      activeBattler: promoted,
      benchBattlers: rest,
    }));
    s = withLog(
      s,
      `${targetPlayerName}이(가) 벤치에서 [${getSongDef(promoted.defId).nameKo}]을(를) 배틀 자리로 올렸습니다.`,
    );
  }

  if (overkill > 0) {
    // 이미 배틀러 체력으로 한 번 반영된 무대 보너스를 또 더하지 않도록 source는 "other"로 넘긴다.
    s = dealDamage(s, targetIndex, overkill, "other");
  }
  if (checkGameOver(s)) return s;

  const stillEmpty =
    s.players[targetIndex].activeBattler === null &&
    s.players[targetIndex].benchBattlers.length === 0;
  if (stillEmpty && !hadReviveStory) {
    s = withLog(
      { ...s, phase: "gameover", winnerIndex: otherIndex(targetIndex) },
      `${targetPlayerName}이(가) 배틀·벤치에 남은 보컬 카드가 없어 패배했습니다!`,
    );
  }
  return s;
}

function checkGameOver(state: GameState): boolean {
  return state.winnerIndex !== null;
}

function finalizeIfGameOver(state: GameState): GameState {
  if (state.phase === "gameover" || state.mode !== "battle") return state;
  const [p0, p1] = state.players;
  if (p0.popularity <= 0 && p1.popularity <= 0) {
    return withLog(
      { ...state, phase: "gameover", winnerIndex: "draw" },
      "동시에 쓰러졌습니다. 무승부!",
    );
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
// 재생 포인트 같은 자원 개념은 없다 (유희왕처럼 완전 폐지). 보컬(vocal) 카드는
// 이제 "필드에 놓는" 카드다 — PLAY_CARD는 배틀/벤치에 소환하는 것이고,
// 소환된 보컬의 스킬은 별도의 USE_SKILL 액션으로 발동한다. 아이템(item)
// 카드는 기존처럼 손패에 있는 한 턴당 몇 장이든 낼 수 있다(반응 구간
// 가능 여부는 reactionPlayable 플래그로 판정).

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
    if (!def.reactionPlayable)
      return { ok: false, reason: "반응 구간에는 반응 가능한 아이템 카드만 낼 수 있습니다." };
  } else if (state.phase === "main") {
    if (playerIndex !== state.activePlayerIndex)
      return { ok: false, reason: "자신의 턴이 아닙니다." };
    if (def.type === "vocal") {
      // 소환(필드에 놓기)은 메인 발동 횟수를 소모한다 — 보드를 한 턴에 몰아
      // 채우지 못하게 하는 유일한 페이싱 장치다.
      if (player.mainPlaysRemaining <= 0)
        return { ok: false, reason: "이번 턴에 소환할 수 있는 보컬 카드를 모두 소진했습니다." };
      if (player.activeBattler !== null && player.benchBattlers.length >= BENCH_SIZE)
        return { ok: false, reason: "배틀·벤치 자리가 가득 찼습니다." };
    }
    // 설치형(마법/함정) 이펙트는 "마법/함정 카드 존" 자리(3개)를 소모한다.
    if (
      (def.effect.kind === "installStoryTick" || def.effect.kind === "installReviveOnceOnDeath") &&
      player.fieldStories.length >= SPELL_TRAP_ZONE_SIZE
    ) {
      return { ok: false, reason: "마법/함정 카드 존이 가득 찼습니다." };
    }
  } else {
    return { ok: false, reason: "지금은 카드를 낼 수 없는 단계입니다." };
  }

  // 아이템 카드는 턴당 1장만 낼 수 있다. 재사용 가능 카드(예: 롤링 걸)는
  // 예외 — 대신 확률(드로우 실패)과 덱 소진 위험으로 스스로 브레이크가
  // 걸리도록 설계되어 있으므로 이 상한을 적용하지 않는다.
  if (def.type === "item" && !def.reusable && player.itemPlaysRemaining <= 0) {
    return { ok: false, reason: "이번 턴에 낼 수 있는 아이템 카드를 모두 소진했습니다." };
  }

  return { ok: true };
}

function playCard(state: GameState, playerIndex: 0 | 1, instanceId: string): GameState {
  const check = canPlayCard(state, playerIndex, instanceId);
  if (!check.ok) return withLog(state, `(무시됨) ${check.reason}`);

  const player = state.players[playerIndex];
  const inst = player.hand.find((c) => c.instanceId === instanceId)!;
  const def = getSongDef(inst.defId);

  if (def.type === "vocal") return summonBattler(state, playerIndex, inst, def);
  return playItemCard(state, playerIndex, inst, def);
}

/** 보컬 카드를 배틀(비어 있으면) 또는 벤치 자리에 소환한다. 턴은 끝나지 않는다
 *  — 소환 직후 그 턴에 바로 스킬도 쓸 수 있다(포켓몬처럼 "소환 후유증" 없음). */
function summonBattler(
  state: GameState,
  playerIndex: 0 | 1,
  inst: CardInstance,
  def: SongCardDef,
): GameState {
  const newBattler = {
    instanceId: inst.instanceId,
    defId: inst.defId,
    currentHp: def.hp ?? 1,
    maxHp: def.hp ?? 1,
  };
  let s = updatePlayer(state, playerIndex, (p) => {
    const hand = p.hand.filter((c) => c.instanceId !== inst.instanceId);
    if (p.activeBattler === null) {
      return { ...p, hand, activeBattler: newBattler };
    }
    return { ...p, hand, benchBattlers: [...p.benchBattlers, newBattler] };
  });
  const toBench = state.players[playerIndex].activeBattler !== null;
  s = withLog(
    s,
    `${state.players[playerIndex].name}: [${def.nameKo}]을(를) ${toBench ? "벤치" : "배틀 자리"}에 소환!`,
  );
  s = updatePlayer(s, playerIndex, (p) => ({
    ...p,
    playedSongThisTurn: true,
    mainPlaysRemaining: Math.max(0, p.mainPlaysRemaining - 1),
  }));
  return finalizeIfGameOver(s);
}

/** 아이템 카드를 발동한다 (구 서포트/스토리/코러스 통합). */
function playItemCard(
  state: GameState,
  playerIndex: 0 | 1,
  inst: CardInstance,
  def: SongCardDef,
): GameState {
  const opponentIndex = otherIndex(playerIndex);
  const mods = getActiveModifiers(state);
  const synergy = hasStageSynergy(state, def.producerId) ? 1 : 0;

  // 손패에서 제거
  let s = updatePlayer(state, playerIndex, (p) => ({
    ...p,
    hand: p.hand.filter((c) => c.instanceId !== inst.instanceId),
  }));

  const isNegated = s.players[playerIndex].negateNextSupportOrStory;
  if (isNegated) {
    s = updatePlayer(s, playerIndex, (p) => ({ ...p, negateNextSupportOrStory: false }));
    s = withLog(s, `${def.nameKo} 효과가 무효화되었습니다!`);
  } else {
    s = resolveEffect(s, playerIndex, opponentIndex, def, synergy, mods);
  }

  // 소모 카드 처리: 무덤으로 (설치형/윤회/장산범/재사용 카드 예외는 별도 처리)
  const goesToField =
    !isNegated &&
    (def.effect.kind === "installStoryTick" || def.effect.kind === "installReviveOnceOnDeath");
  if (def.reusable && !goesToField) {
    // 재사용 가능 카드(예: 롤링 걸)는 무덤에 가지 않고 바로 손으로 돌아온다.
    s = updatePlayer(s, playerIndex, (p) => ({ ...p, hand: [...p.hand, inst] }));
  } else if (!goesToField) {
    let flags = inst.flags;
    if (def.effect.kind === "markReviveOnceInGraveyard" && !isNegated) {
      flags = { ...flags, revivePending: true };
    }
    s = moveToGraveyardOrRevive(s, playerIndex, { ...inst, flags }, def.nameKo);
  }

  // "발동했다"는 표시는 반응 가능(구 코러스) 카드를 제외한 모든 아이템에 남긴다
  // (표리 러버즈 등 "이번 턴에 이미 곡을 냈다면" 판정용).
  if (!def.reactionPlayable) {
    s = updatePlayer(s, playerIndex, (p) => ({ ...p, playedSongThisTurn: true }));
  }
  // 아이템 카드 턴당 1회 제한 소모 (재사용 카드=롤링 걸은 예외).
  if (!def.reusable) {
    s = updatePlayer(s, playerIndex, (p) => ({
      ...p,
      itemPlaysRemaining: Math.max(0, p.itemPlaysRemaining - 1),
    }));
  }

  s = withLog(s, `${state.players[playerIndex].name}: [${def.nameKo}] 발동!`);
  return finalizeIfGameOver(s);
}

/** 배틀 자리의 보컬 카드로 스킬을 사용한다. 그 즉시 턴이 끝난다. */
function useSkill(state: GameState, playerIndex: 0 | 1): GameState {
  if (state.phase !== "main" || playerIndex !== state.activePlayerIndex) {
    return withLog(state, "(무시됨) 지금은 스킬을 쓸 수 없습니다.");
  }
  const player = state.players[playerIndex];
  const battler = player.activeBattler;
  if (!battler) {
    return withLog(state, "(무시됨) 배틀 자리에 카드가 없습니다.");
  }
  const opponentIndex = otherIndex(playerIndex);
  const def = getSongDef(battler.defId);
  const mods = getActiveModifiers(state);
  const synergy = hasStageSynergy(state, def.producerId) ? 1 : 0;

  let s = withLog(state, `${player.name}: [${def.nameKo}] 스킬 사용!`);
  s = resolveEffect(s, playerIndex, opponentIndex, def, synergy, mods);
  s = finalizeIfGameOver(s);

  // 유희왕/포켓몬 카드게임처럼, 스킬을 쓰면 그 즉시 자신의 턴이 끝난다.
  if (s.phase === "main") {
    s = beginEndOfTurnSequence(s, playerIndex);
  }
  return s;
}

/** 배틀 카드와 벤치 카드 1장을 맞바꾼다. 자원이 없으므로 비용 없이 턴당
 *  1회 무료로 허용한다. 턴은 끝나지 않는다. */
function switchActive(state: GameState, playerIndex: 0 | 1, benchInstanceId: string): GameState {
  if (state.phase !== "main" || playerIndex !== state.activePlayerIndex) {
    return withLog(state, "(무시됨) 지금은 교체할 수 없습니다.");
  }
  const player = state.players[playerIndex];
  if (player.switchedActiveThisTurn) {
    return withLog(state, "(무시됨) 이번 턴에는 이미 교체했습니다.");
  }
  const benchIdx = player.benchBattlers.findIndex((b) => b.instanceId === benchInstanceId);
  if (benchIdx === -1) {
    return withLog(state, "(무시됨) 벤치에 없는 카드입니다.");
  }
  const promoted = player.benchBattlers[benchIdx];
  const rest = player.benchBattlers.filter((_, i) => i !== benchIdx);
  const s = updatePlayer(state, playerIndex, (p) => ({
    ...p,
    activeBattler: promoted,
    benchBattlers: p.activeBattler ? [...rest, p.activeBattler] : rest,
    switchedActiveThisTurn: true,
  }));
  return withLog(
    s,
    `${player.name}이(가) [${getSongDef(promoted.defId).nameKo}]와(과) 교체했습니다.`,
  );
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
  const itemBonus = def.type === "item" ? mods.allItemEffectBonus + synergy : 0;
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
      s = dealSkillDamage(s, target, total);
      break;
    }
    case "damageThenHealSelf": {
      const total = effect.amount + actorPlayer.nextVocalDamageBonus + vocalSynergy;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealSkillDamage(s, target, total);
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
      s = dealSkillDamage(s, target, total);
      break;
    }
    case "damageBonusIfPlayedSongThisTurn": {
      const total =
        effect.amount +
        (actorPlayer.playedSongThisTurn ? effect.bonus : 0) +
        actorPlayer.nextVocalDamageBonus +
        vocalSynergy;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealSkillDamage(s, target, total);
      break;
    }
    case "damageThenOpponentDraws": {
      const total = effect.amount + actorPlayer.nextVocalDamageBonus + vocalSynergy;
      const opponentDraw = effect.opponentDraw;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealSkillDamage(s, target, total);
      if (opponentDraw > 0) {
        s = updatePlayer(s, target, (p) => drawN(p, opponentDraw, target));
      }
      break;
    }
    case "damageThenPeekOpponentHand": {
      const total = effect.amount + actorPlayer.nextVocalDamageBonus + vocalSynergy;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealSkillDamage(s, target, total);
      s = { ...s, revealedHand: { ownerIndex: target, cards: s.players[target].hand } };
      break;
    }
    case "drawAfterDamage": {
      const total = effect.amount + actorPlayer.nextVocalDamageBonus + vocalSynergy;
      const drawAmount = effect.draw;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealSkillDamage(s, target, total);
      s = updatePlayer(s, actor, (p) => drawN(p, drawAmount, actor));
      break;
    }
    case "heal": {
      s = healPlayer(s, actor, effect.amount + itemBonus);
      break;
    }
    case "buffNextVocalWithSelfCost": {
      const amount = effect.amount + itemBonus;
      const selfCost = effect.selfPopularityCostOnTurnEnd;
      s = updatePlayer(s, actor, (p) => ({
        ...p,
        nextVocalDamageBonus: p.nextVocalDamageBonus + amount,
        pendingSelfDamageOnTurnEnd: p.pendingSelfDamageOnTurnEnd + selfCost,
      }));
      break;
    }
    case "debuffOpponentNextVocal": {
      const amount = effect.amount + itemBonus;
      s = updatePlayer(s, target, (p) => ({
        ...p,
        nextVocalDamageBonus: p.nextVocalDamageBonus - amount,
      }));
      break;
    }
    case "gainExtraMainPlay": {
      const amount = effect.amount + itemBonus;
      s = updatePlayer(s, actor, (p) => ({
        ...p,
        mainPlaysRemaining: p.mainPlaysRemaining + amount,
      }));
      break;
    }
    case "draw": {
      const amount = effect.amount;
      s = updatePlayer(s, actor, (p) => drawN(p, amount, actor));
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
            player = drawOne(player, actor);
          }
        }
        return player;
      });
      break;
    }
    case "drawThenDiscardRandom": {
      const drawAmount = effect.draw;
      const discardAmount = effect.discard;
      s = updatePlayer(s, actor, (p) => drawN(p, drawAmount, actor));
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
    case "forceOpponentDiscard": {
      s = updatePlayer(s, target, (p) => randomDiscard(p, effect.amount));
      s = withLog(s, `${state.players[target].name}이(가) 강제로 카드를 버렸습니다.`);
      break;
    }
    case "damageAndGainExtraMainPlay": {
      const total = effect.amount + actorPlayer.nextVocalDamageBonus + vocalSynergy;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealSkillDamage(s, target, total);
      s = updatePlayer(s, actor, (p) => ({
        ...p,
        mainPlaysRemaining: p.mainPlaysRemaining + effect.extraPlays,
      }));
      break;
    }
    case "damageBonusIfOpponentLowHp": {
      const targetPlayer = s.players[target];
      const total =
        effect.amount +
        (targetPlayer.popularity <= effect.threshold ? effect.bonus : 0) +
        actorPlayer.nextVocalDamageBonus +
        vocalSynergy;
      s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
      s = dealSkillDamage(s, target, total);
      break;
    }
    case "gambleDamageOrDraw": {
      if (Math.random() < 0.5) {
        const total = effect.damage + actorPlayer.nextVocalDamageBonus + vocalSynergy;
        s = updatePlayer(s, actor, (p) => ({ ...p, nextVocalDamageBonus: 0 }));
        s = dealSkillDamage(s, target, total);
        s = withLog(s, `순식간에 퍼져나가듯, 상대에게 그대로 꽂혔다!`);
      } else {
        s = updatePlayer(s, actor, (p) => drawN(p, effect.draw, actor));
        s = withLog(s, `혼돈 속에서 오히려 힌트를 얻었다.`);
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

/** 메인 페이즈를 마치고 상대의 반응 구간으로 넘기거나, 반응이 필요 없으면 바로 턴을 마친다. */
function beginEndOfTurnSequence(state: GameState, playerIndex: 0 | 1): GameState {
  const opponent = otherIndex(playerIndex);
  const opponentHasReactionCard = state.players[opponent].hand.some(
    (c) => getSongDef(c.defId).reactionPlayable,
  );
  if (opponentHasReactionCard) {
    return withLog(
      { ...state, phase: "reaction" },
      `${state.players[opponent].name}의 반응 구간입니다. (반응 아이템 카드 또는 패스)`,
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

  // 고스트 룰 등으로 예약된 자기 체력 감소 적용
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
  return runIntroAndDraw(s);
}

function finalizePopularityComparison(state: GameState, reason: string): GameState {
  const [p0, p1] = state.players;
  let winnerIndex: 0 | 1 | "draw" = "draw";
  if (p0.popularity > p1.popularity) winnerIndex = 0;
  else if (p1.popularity > p0.popularity) winnerIndex = 1;
  const msg =
    winnerIndex === "draw"
      ? `${reason} — 무승부! (체력 ${p0.popularity} : ${p1.popularity})`
      : `${reason} — ${state.players[winnerIndex].name} 승리! (체력 ${p0.popularity} : ${p1.popularity})`;
  return withLog({ ...state, phase: "gameover", winnerIndex }, msg);
}

// ── 리듀서 진입점 ────────────────────────────────────────────

export function reduce(state: GameState | null, action: GameAction): GameState {
  if (action.type === "START_GAME") return startGame(action);
  if (!state) throw new Error("게임이 아직 시작되지 않았습니다.");

  // 이번 액션 처리 중 "덱이 빈 채로 드로우를 시도"한 플레이어가 있는지 추적한다.
  deckOutFlags = [false, false];

  let result: GameState;
  switch (action.type) {
    case "PLAY_CARD":
      result = playCard(state, action.playerIndex, action.instanceId);
      break;
    case "USE_SKILL":
      result = useSkill(state, action.playerIndex);
      break;
    case "SWITCH_ACTIVE":
      result = switchActive(state, action.playerIndex, action.benchInstanceId);
      break;
    case "END_TURN":
      result = endTurn(state, action.playerIndex);
      break;
    case "PASS_REACTION":
      result = passReaction(state, action.playerIndex);
      break;
    case "DISMISS_REVEAL":
      result = { ...state, revealedHand: null };
      break;
    default:
      result = state;
  }

  // 손패가 완전히 바닥나면(0장) 3장을 추가로 뽑아준다. 덱까지 바닥난 상태라면
  // 아래 덱사 체크가 바로 이어서 게임을 끝내므로 별도의 안전장치는 필요 없다.
  if (result.phase !== "gameover") {
    for (const idx of [0, 1] as const) {
      if (result.players[idx].hand.length === 0) {
        result = updatePlayer(result, idx, (p) => drawN(p, HAND_REFILL_ON_EMPTY, idx));
        result = withLog(
          result,
          `${result.players[idx].name}의 손패가 바닥나 ${HAND_REFILL_ON_EMPTY}장을 더 뽑았습니다.`,
        );
      }
    }
  }

  // 롤링 걸처럼 턴당 횟수 제한 없이 재사용 가능한 카드는 카드 자체를 막는 대신,
  // "덱이 다 떨어진 뒤에도 드로우를 시도하면 그 즉시 덱사로 게임이 끝난다"는
  // 규칙으로 자연스럽게 제동이 걸리게 한다 (확률이 나쁘면 스스로 위험해짐).
  if (result.phase !== "gameover" && (deckOutFlags[0] || deckOutFlags[1])) {
    const names = [
      deckOutFlags[0] ? result.players[0].name : null,
      deckOutFlags[1] ? result.players[1].name : null,
    ].filter((n): n is string => n !== null);
    result = finalizePopularityComparison(
      result,
      `${names.join(", ")}의 덱이 소진된 상태에서 카드를 뽑으려 했습니다 (덱사)`,
    );
  }

  return result;
}
