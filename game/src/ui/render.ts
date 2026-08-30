import { DeckTypeRatio, GameMode, GameState, ProducerInfo, SongCardDef } from "../core/types.js";
import { SONG_CARDS } from "../core/data/songCards.js";
import { STAGE_CARDS } from "../core/data/stageCards.js";
import { getSongDef, canPlayCard, DEFAULT_DECK_RATIO } from "../core/engine.js";
import { getProducer } from "../core/data/producers.js";
import { cardArtDataUri, producerBadgeDataUri, twitterAvatarUrl, youtubeThumbnailUrl } from "./cardArt.js";
import { cardTypeLabel, effectText, rarityLabel, recordText } from "./cardText.js";

export type Screen = "deck" | "battle" | "cards";

export interface AppHandlers {
  onNav: (screen: Screen) => void;
  onStartGame: (opts: { name: string; mode: GameMode; ratio: DeckTypeRatio }) => void;
  onPlayCard: (instanceId: string) => void;
  onEndTurn: () => void;
  onPassReaction: () => void;
  onDismissReveal: () => void;
  onRestart: () => void;
}

const HUMAN = 0 as const;
const AI = 1 as const;

function el(html: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild as HTMLElement;
}

// ── 툴팁(정보 팝업) ──────────────────────────────────────────

function attachHoverFlip(node: HTMLElement) {
  const pop = node.querySelector(".info-pop") as HTMLElement | null;
  if (!pop) return;
  node.addEventListener("mouseenter", () => {
    const rect = node.getBoundingClientRect();
    if (rect.right + 300 > window.innerWidth) pop.classList.add("pop-left");
    else pop.classList.remove("pop-left");
  });
}

interface ArtSpec {
  src: string;
  fallback: string;
  attribution: string | null;
}

/** 곡 카드 아트: 공식 YouTube 영상이 확인된 곡은 그 썸네일(i.ytimg.com)을,
 *  아니면 오리지널 SVG를 사용한다. 썸네일 로드 실패 시 자동으로 SVG로 대체. */
function songArt(def: SongCardDef, producer: ProducerInfo): ArtSpec {
  const fallback = cardArtDataUri(def.id, producer.accent);
  if (def.youtubeId) {
    return {
      src: youtubeThumbnailUrl(def.youtubeId),
      fallback,
      attribution: "출처: YouTube 공식 업로드 썸네일",
    };
  }
  return { src: fallback, fallback, attribution: null };
}

/** P카드(무대 카드) 아트: 공식 X 계정이 있으면 그 프로필 사진을, 없으면
 *  오리지널 배지를 사용한다. 프로필 사진 로드 실패 시 자동으로 배지로 대체. */
function producerArt(producer: ProducerInfo): ArtSpec {
  const fallback = producerBadgeDataUri(producer.accent, producer.nameKo.slice(0, 2).toUpperCase());
  if (producer.twitterHandle) {
    return {
      src: twitterAvatarUrl(producer.twitterHandle),
      fallback,
      attribution: `출처: X(@${producer.twitterHandle}) 프로필 사진`,
    };
  }
  return { src: fallback, fallback, attribution: null };
}

function imgTag(art: ArtSpec, className: string): string {
  return `<img class="${className}" src="${art.src}" alt="" onerror="this.onerror=null;this.src='${art.fallback}'"/>`;
}

function songTooltipHtml(def: SongCardDef): string {
  const producer = getProducer(def.producerId);
  const record = recordText(def);
  const art = songArt(def, producer);
  return `
    <div class="info-pop" style="--pop-accent:${producer.accent}">
      ${imgTag(art, "info-pop-art")}
      ${art.attribution ? `<div class="art-source">${art.attribution}</div>` : ""}
      <h4>${def.nameKo}</h4>
      <div class="sub">${def.nameOriginal} · ${producer.nameKo}</div>
      <div class="details">
        <b>작곡가</b> ${producer.nameKo}${def.releaseDate ? ` · <b>투고일</b> ${def.releaseDate}` : ""}
        ${record ? `<br><b>기록</b> ${record}` : ""}
        <br><b>효과</b> ${effectText(def.effect)}
      </div>
      <div class="comment">${def.flavor}</div>
    </div>`;
}

function stageTooltipHtml(stageId: string): string {
  const stage = STAGE_CARDS.find((s) => s.id === stageId)!;
  const producer = getProducer(stage.producerId);
  const art = producerArt(producer);
  return `
    <div class="info-pop" style="--pop-accent:${producer.accent}">
      ${imgTag(art, "info-pop-art")}
      ${art.attribution ? `<div class="art-source">${art.attribution}</div>` : ""}
      <h4>${stage.nameKo}</h4>
      <div class="sub">P카드(무대 카드) · 게임 전체 공용 규칙</div>
      <div class="details">${stage.description}</div>
    </div>`;
}

// ── 곡 카드 컴포넌트 ─────────────────────────────────────────

function songCardFull(def: SongCardDef): HTMLElement {
  const producer = getProducer(def.producerId);
  const art = songArt(def, producer);
  const borderClasses = [def.isMyth ? "gold" : "", def.youtube100M ? "red" : ""]
    .filter(Boolean)
    .join(" ");
  const badges =
    (def.isMyth ? `<span class="badge gold-badge">신화입성</span>` : "") +
    (def.youtube100M
      ? `<span class="badge red-badge" style="${def.isMyth ? "right:78px" : ""}">1억뷰</span>`
      : "");
  const node = el(`
    <div class="card ${borderClasses}" style="--card-accent:${producer.accent}">
      ${badges}
      <div class="art">${imgTag(art, "")}</div>
      <div class="cardbody">
        <span class="tag">${cardTypeLabel(def.type)}</span>
        <div class="ctitle">${def.nameKo}</div>
        <div class="artist">${producer.nameKo}${def.reusable ? " · 재사용가능" : ""}</div>
        <div class="effect">${effectText(def.effect)}</div>
        <div class="cardfoot"><span class="rarity">${rarityLabel(def.rarity)}</span></div>
      </div>
      ${songTooltipHtml(def)}
    </div>
  `);
  attachHoverFlip(node);
  return node;
}

function miniCard(
  card: { instanceId: string; defId: string },
  playable: boolean,
  reason: string | undefined,
  onClick: () => void,
): HTMLElement {
  const def = getSongDef(card.defId);
  const producer = getProducer(def.producerId);
  const art = songArt(def, producer);
  const borderClasses = [def.isMyth ? "gold" : "", def.youtube100M ? "red" : ""]
    .filter(Boolean)
    .join(" ");
  const node = el(`
    <div class="mini-card ${borderClasses} ${playable ? "playable" : "disabled"}" title="${reason ?? ""}"
         style="--card-accent:${producer.accent}">
      ${imgTag(art, "")}
      <div class="mc">${def.nameKo}</div>
      ${songTooltipHtml(def)}
    </div>
  `);
  attachHoverFlip(node);
  if (playable) node.addEventListener("click", onClick);
  return node;
}

function stageBadge(stageId: string): HTMLElement {
  const stage = STAGE_CARDS.find((s) => s.id === stageId)!;
  const producer = getProducer(stage.producerId);
  const art = producerArt(producer);
  const node = el(`
    <div class="stage-badge" style="--card-accent:${producer.accent}">
      ${imgTag(art, "")}
      <div class="stage-badge-name">${stage.nameKo}</div>
      ${stageTooltipHtml(stageId)}
    </div>
  `);
  attachHoverFlip(node);
  return node;
}

// ── 앱 셸(사이드바 + 상단바) ───────────────────────────────────

function shell(screen: Screen, title: string, content: HTMLElement, onNav: (s: Screen) => void): HTMLElement {
  const root = el(`
    <div class="app">
      <aside>
        <div class="logo">BO<span>CARDS</span></div>
        <div class="nav">
          <button data-screen="battle">◈  대전</button>
          <button data-screen="cards">▦  카드 목록</button>
          <button data-screen="deck">◇  덱 설정</button>
        </div>
        <div class="meta">보카로 카드게임 프로토타입<br>AI 대전 모드<br><br>70장 무작위 덱<br>비율은 플레이어가 결정</div>
      </aside>
      <main>
        <div class="top">
          <div><div class="eyebrow">VOCALOID CARD GAME</div><div class="title">${title}</div></div>
        </div>
        <div class="content"></div>
      </main>
    </div>
  `);
  root.querySelectorAll<HTMLButtonElement>(".nav button").forEach((b) => {
    if (b.dataset.screen === screen) b.classList.add("active");
    b.addEventListener("click", () => onNav(b.dataset.screen as Screen));
  });
  root.querySelector(".content")!.appendChild(content);
  return root;
}

// ── 덱 설정 화면 ─────────────────────────────────────────────

function defaultPercent(ratio: DeckTypeRatio, key: keyof DeckTypeRatio): number {
  const total = ratio.attack + ratio.item + ratio.effect;
  return total > 0 ? Math.round((ratio[key] / total) * 100) : 33;
}

export function renderDeckScreen(handlers: AppHandlers): HTMLElement {
  const stageNames = STAGE_CARDS.map((s) => `<span class="stage-name-chip">${s.nameKo}</span>`).join("");
  const content = el(`
    <div class="deck">
      <div class="panel">
        <h3>70장 무작위 덱</h3>
        <p style="color:#8f95a0;font-size:13px;line-height:1.7">
          현존하는 곡 카드 풀에서 무작위로 70장을 뽑아 덱을 만듭니다. 아래 비율을 정하면
          공격/아이템/효과 카드가 그 비율에 가깝게 섞여 들어갑니다 (합이 100이 아니어도 자동 환산).
        </p>
        <div class="distribution">
          <div class="sliderrow"><span>공격</span><input type="number" min="0" max="100" id="ratio-attack" value="${defaultPercent(DEFAULT_DECK_RATIO, "attack")}"><span class="num">%</span></div>
          <div class="sliderrow"><span>아이템</span><input type="number" min="0" max="100" id="ratio-item" value="${defaultPercent(DEFAULT_DECK_RATIO, "item")}"><span class="num">%</span></div>
          <div class="sliderrow"><span>효과</span><input type="number" min="0" max="100" id="ratio-effect" value="${defaultPercent(DEFAULT_DECK_RATIO, "effect")}"><span class="num">%</span></div>
        </div>

        <div class="setup-row" style="margin-top:18px">
          <label>내 이름 <input id="p0-name" placeholder="Player 1"/></label>
        </div>
        <div class="setup-row">
          <label>승리 모드</label>
          <select id="mode-select">
            <option value="battle">배틀 모드 (체력 0으로 만들기)</option>
            <option value="chart">차트 모드 (턴 제한 후 체력 비교)</option>
          </select>
        </div>

        <p style="color:#8f95a0;font-size:12px">무대 카드(P카드)는 시작 시 아래 중 1장이 무작위로 정해집니다.</p>
        <div class="stage-pool">${stageNames}</div>

        <button id="start-btn" class="action" style="margin-top:14px">AI 대전 시작</button>
      </div>
      <div class="panel">
        <h3>안내</h3>
        <div class="log">
          이 프로토타입은 AI 상대와의 1인 대전만 지원합니다. 재생 포인트 같은
          자원 시스템은 없습니다 — 체력만 신경 쓰면 됩니다.<br><br>
          · 공격 카드를 내면 그 즉시 자신의 턴이 끝납니다.<br>
          · 아이템 카드는 손패에 있는 한 몇 장이든 낼 수 있습니다.<br>
          · 효과 카드 중 일부(코러스)는 상대 턴에도 반응으로 낼 수 있습니다.
        </div>
      </div>
    </div>
  `);

  content.querySelector("#start-btn")!.addEventListener("click", () => {
    const name = (content.querySelector("#p0-name") as HTMLInputElement).value.trim();
    const mode = (content.querySelector("#mode-select") as HTMLSelectElement).value as GameMode;
    const val = (id: string) =>
      Math.max(0, Number((content.querySelector(`#${id}`) as HTMLInputElement).value) || 0);
    const ratio: DeckTypeRatio = {
      attack: val("ratio-attack"),
      item: val("ratio-item"),
      effect: val("ratio-effect"),
    };
    handlers.onStartGame({ name, mode, ratio });
  });

  return shell("deck", "덱 설정", content, handlers.onNav);
}

// ── 카드 목록 화면 ───────────────────────────────────────────

export function renderCardsScreen(onNav: (s: Screen) => void): HTMLElement {
  const content = el(`
    <div>
      <h3 style="margin:0 0 4px">P카드 (무대 카드) — 6종</h3>
      <p style="color:#8f95a0;font-size:12px;margin:0 0 14px">게임 시작 시 무작위로 1장이 정해져, 판 전체에 공용으로 적용됩니다. 곡 카드와는 별개입니다.</p>
      <div class="stage-grid" id="stage-list"></div>
      <h3 style="margin:26px 0 4px">곡 카드 — ${SONG_CARDS.length}장</h3>
      <p style="color:#8f95a0;font-size:12px;margin:0 0 14px">금색 얇은 테두리 = 신화입성곡 · 빨간 얇은 테두리 = 유튜브 1억 회 재생. 카드에 마우스를 올리고 1초 기다리면 상세 정보가 뜹니다.</p>
      <div class="cards" id="song-list"></div>
    </div>
  `);
  const stageList = content.querySelector("#stage-list")!;
  for (const s of STAGE_CARDS) stageList.appendChild(stageBadge(s.id));
  const songList = content.querySelector("#song-list")!;
  for (const def of SONG_CARDS) songList.appendChild(songCardFull(def));

  return shell("cards", "카드 목록", content, onNav);
}

// ── 대전 화면 ────────────────────────────────────────────────

function fieldSummary(state: GameState, index: 0 | 1): string {
  const p = state.players[index];
  if (p.fieldStories.length === 0) return "없음";
  return p.fieldStories
    .map((s) => `${getSongDef(s.defId).nameKo}(${s.remainingTurns === 999 ? "대기" : s.remainingTurns + "턴"})`)
    .join(", ");
}

export function renderBattleScreen(state: GameState, handlers: AppHandlers): HTMLElement {
  const content = el(`<div class="battle"></div>`);
  const board = el(`<div class="board"></div>`);
  const side = el(`<div class="side"></div>`);
  content.appendChild(board);
  content.appendChild(side);

  const stageId = state.activeStageCardIds[0];
  const isReaction = state.phase === "reaction";
  const isHumanTurn =
    (state.phase === "main" && state.activePlayerIndex === HUMAN) ||
    (isReaction && state.activePlayerIndex === AI);

  board.appendChild(
    el(`<div class="side-stat"><span>OPPONENT / ${state.players[AI].name}</span><span class="hp">♥ ${state.players[AI].popularity}</span></div>`),
  );
  const stageWrap = el(`<div class="arena"></div>`);
  if (stageId) stageWrap.appendChild(stageBadge(stageId));
  const turnLabel = el(
    `<div class="turn">${state.phase === "gameover" ? "게임 종료" : isReaction ? (isHumanTurn ? "당신의 반응 구간" : "상대의 반응 구간") : state.activePlayerIndex === HUMAN ? "당신의 턴" : "상대의 턴"} · 턴 ${state.turnNumber}</div>`,
  );
  stageWrap.appendChild(turnLabel);
  board.appendChild(stageWrap);
  board.appendChild(
    el(`<div class="side-stat"><span>YOU / ${state.players[HUMAN].name}</span><span class="hp">♥ ${state.players[HUMAN].popularity}</span></div>`),
  );

  const handRow = el(`<div class="hand"></div>`);
  const human = state.players[HUMAN];
  for (const card of human.hand) {
    const check = canPlayCard(state, HUMAN, card.instanceId);
    handRow.appendChild(miniCard(card, check.ok && isHumanTurn, check.reason, () => handlers.onPlayCard(card.instanceId)));
  }
  board.appendChild(handRow);

  // 사이드 패널 (자원 시스템 없음 — 메인 발동 횟수만 표시)
  side.appendChild(
    el(`
      <div class="panel">
        <h3>ACTIONS</h3>
        <div class="resource">
          <div class="res"><b>${human.mainPlaysRemaining}</b><small>남은 메인 발동</small></div>
        </div>
      </div>
    `),
  );
  side.appendChild(
    el(`
      <div class="panel">
        <h3>FIELD</h3>
        <div class="log">
          <b>나의 효과</b> ${fieldSummary(state, HUMAN)}<br>
          <b>상대 효과</b> ${fieldSummary(state, AI)}<br>
          덱 ${human.deck.length} · 손패 ${human.hand.length} · 무덤 ${human.graveyard.length}
        </div>
      </div>
    `),
  );
  const logLines = state.log
    .slice(-12)
    .map((l) => `<div>${l}</div>`)
    .join("");
  side.appendChild(el(`<div class="panel"><h3>LAST ACTION</h3><div class="log">${logLines}</div></div>`));

  if (state.phase === "gameover") {
    const winnerText =
      state.winnerIndex === "draw"
        ? "무승부!"
        : state.winnerIndex === HUMAN
          ? "승리했습니다!"
          : "패배했습니다.";
    side.appendChild(
      el(`<button class="action" id="restart-btn">${winnerText} 다시 하기</button>`),
    );
  } else if (isReaction && isHumanTurn) {
    side.appendChild(el(`<button class="action" id="pass-btn">패스 (반응하지 않음)</button>`));
  } else if (state.phase === "main" && state.activePlayerIndex === HUMAN) {
    side.appendChild(el(`<button class="action" id="end-turn-btn">턴 종료</button>`));
  } else {
    side.appendChild(el(`<div class="log" style="text-align:center;padding:10px 0">상대(AI)가 생각 중...</div>`));
  }

  if (state.revealedHand && state.revealedHand.ownerIndex === AI) {
    content.appendChild(revealModal(state, handlers));
  }

  const root = shell("battle", "대전", content, handlers.onNav);
  root.querySelector("#end-turn-btn")?.addEventListener("click", handlers.onEndTurn);
  root.querySelector("#pass-btn")?.addEventListener("click", handlers.onPassReaction);
  root.querySelector("#restart-btn")?.addEventListener("click", handlers.onRestart);
  return root;
}

function revealModal(state: GameState, handlers: AppHandlers): HTMLElement {
  const reveal = state.revealedHand!;
  const cardsHtml =
    reveal.cards.map((c) => `<div class="mini-card-flat">${getSongDef(c.defId).nameKo}</div>`).join("") ||
    "<span class='muted'>손패 없음</span>";
  const node = el(`
    <div class="modal-overlay">
      <div class="modal-box">
        <h3>${state.players[reveal.ownerIndex].name}의 손패 공개</h3>
        <div class="mini-card-list">${cardsHtml}</div>
        <button id="dismiss-reveal" class="action">확인</button>
      </div>
    </div>
  `);
  node.querySelector("#dismiss-reveal")!.addEventListener("click", handlers.onDismissReveal);
  return node;
}

export function renderBattlePlaceholder(handlers: AppHandlers): HTMLElement {
  const content = el(`
    <div class="panel" style="max-width:480px">
      <h3>아직 진행 중인 대전이 없습니다</h3>
      <p style="color:#8f95a0;font-size:13px;line-height:1.7">먼저 "덱 설정" 탭에서 카드 비율을 정하고 대전을 시작하세요.</p>
      <button class="action" id="goto-deck">덱 설정으로 이동</button>
    </div>
  `);
  content.querySelector("#goto-deck")!.addEventListener("click", () => handlers.onNav("deck"));
  return shell("battle", "대전", content, handlers.onNav);
}
