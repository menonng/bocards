import { STAGE_CARDS } from "../core/data/stageCards.js";
import { getSongDef, canPlayCard } from "../core/engine.js";
import { cardTypeLabel, effectText, rarityLabel } from "./cardText.js";
function el(html) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html.trim();
    return wrapper.firstElementChild;
}
// ── 셋업 화면 ────────────────────────────────────────────────
export function renderSetup(onStart) {
    const stageOptions = STAGE_CARDS.map((s, i) => `
      <label class="stage-choice">
        <input type="radio" name="stage" value="${s.id}" ${i === 0 ? "checked" : ""} />
        <div class="stage-choice-body">
          <strong>${s.nameKo}</strong>
          <p>${s.description}</p>
        </div>
      </label>`).join("");
    const root = el(`
    <div class="setup-screen">
      <h1>보카로 카드게임 — 프로토타입</h1>
      <p class="subtitle">무대 카드(P카드) 1장을 골라 게임 전체 규칙을 정하세요.</p>
      <div class="stage-grid">${stageOptions}</div>

      <div class="setup-row">
        <label>승리 모드</label>
        <select id="mode-select">
          <option value="battle">배틀 모드 (인기도 0으로 만들기)</option>
          <option value="chart">차트 모드 (턴 제한 후 인기도 비교)</option>
        </select>
      </div>

      <div class="setup-row names">
        <label>Player 1 <input id="p0-name" placeholder="Player 1" /></label>
        <label>Player 2 <input id="p1-name" placeholder="Player 2" /></label>
      </div>

      <button id="start-btn" class="primary-btn">게임 시작 (Pass &amp; Play)</button>
      <p class="hint">한 화면을 번갈아 보는 로컬 2인용 프로토타입입니다. 자신의 턴이 아니면 화면을 넘겨주세요.</p>
    </div>
  `);
    root.querySelector("#start-btn").addEventListener("click", () => {
        const stageId = root.querySelector('input[name="stage"]:checked')?.value ??
            STAGE_CARDS[0].id;
        const mode = root.querySelector("#mode-select").value;
        const p0 = root.querySelector("#p0-name").value.trim();
        const p1 = root.querySelector("#p1-name").value.trim();
        onStart({ stageCardId: stageId, mode, p0, p1 });
    });
    return root;
}
// ── 핸드오프(패스 앤 플레이) 화면 ─────────────────────────────
export function renderHandoff(state, viewerIndex, onReveal) {
    const name = state.players[viewerIndex].name;
    const reasonText = state.phase === "reaction" ? "코러스 카드로 반응할 차례입니다" : "당신의 턴입니다";
    const root = el(`
    <div class="handoff-screen">
      <h2>화면을 넘겨주세요</h2>
      <p class="handoff-name">${name}</p>
      <p>${reasonText} · 턴 ${state.turnNumber}</p>
      <button id="reveal-btn" class="primary-btn">내 패 확인하기</button>
    </div>
  `);
    root.querySelector("#reveal-btn").addEventListener("click", onReveal);
    return root;
}
// ── 카드 렌더 ────────────────────────────────────────────────
function renderCard(def, card, playable, reason, onClick) {
    const node = el(`
    <div class="card card-${def.rarity} card-type-${def.type} ${playable ? "playable" : "disabled"}"
         data-instance-id="${card.instanceId}"
         title="${reason ?? ""}">
      <div class="card-top">
        <span class="card-cost">${def.cost}</span>
        <span class="card-type-badge">${cardTypeLabel(def.type)}</span>
      </div>
      <div class="card-name">${def.nameKo}</div>
      <div class="card-name-original">${def.nameOriginal}</div>
      <div class="card-producer">${def.producerId}${def.isMyth ? " · 👑 신화입성" : ""}</div>
      <div class="card-effect">${effectText(def.effect)}</div>
      <div class="card-rarity">${rarityLabel(def.rarity)}</div>
    </div>
  `);
    if (onClick && playable)
        node.addEventListener("click", onClick);
    return node;
}
// ── 게임 보드 ────────────────────────────────────────────────
export function renderGame(state, handlers) {
    if (state.phase === "gameover")
        return renderGameOver(state, handlers);
    const active = state.activePlayerIndex;
    const isReaction = state.phase === "reaction";
    const viewerIndex = isReaction ? (active === 0 ? 1 : 0) : active;
    const opponentIndex = viewerIndex === 0 ? 1 : 0;
    const stage = STAGE_CARDS.find((s) => state.activeStageCardIds.includes(s.id));
    const root = el(`
    <div class="game-screen">
      <header>
        <div class="stage-banner">
          <strong>${stage?.nameKo ?? ""}</strong>
          <span>${stage?.description ?? ""}</span>
        </div>
        <div class="turn-info">턴 ${state.turnNumber} · ${state.mode === "battle" ? "배틀 모드" : "차트 모드"}</div>
      </header>

      <section class="players-row">
        <div class="player-panel" id="panel-opponent"></div>
        <div class="player-panel" id="panel-me"></div>
      </section>

      <section class="hand-area" id="hand-area"></section>

      <section class="controls" id="controls"></section>

      <aside class="log-panel" id="log-panel">
        <h3>진행 기록</h3>
        <div class="log-list"></div>
      </aside>
    </div>
  `);
    root.querySelector("#panel-opponent").replaceWith(renderPlayerPanel(state, opponentIndex, "상대"));
    root.querySelector("#panel-me").replaceWith(renderPlayerPanel(state, viewerIndex, "나"));
    const handArea = root.querySelector("#hand-area");
    const player = state.players[viewerIndex];
    for (const card of player.hand) {
        const def = getSongDef(card.defId);
        const check = canPlayCard(state, viewerIndex, card.instanceId);
        handArea.appendChild(renderCard(def, card, check.ok, check.reason, () => handlers.onPlayCard(viewerIndex, card.instanceId)));
    }
    const controls = root.querySelector("#controls");
    if (isReaction) {
        controls.appendChild(el(`<button id="pass-btn" class="secondary-btn">패스 (반응하지 않음)</button>`));
        controls.querySelector("#pass-btn").addEventListener("click", () => handlers.onPassReaction(viewerIndex));
    }
    else {
        controls.appendChild(el(`<div class="pp-info">남은 메인 발동: ${player.mainPlaysRemaining} · 재생 포인트: ${player.pp}/${player.ppMax}</div>`));
        controls.appendChild(el(`<button id="end-turn-btn" class="primary-btn">턴 종료</button>`));
        controls.querySelector("#end-turn-btn").addEventListener("click", () => handlers.onEndTurn(viewerIndex));
    }
    const logList = root.querySelector(".log-list");
    for (const line of state.log.slice(-40)) {
        logList.appendChild(el(`<div class="log-line">${line}</div>`));
    }
    logList.scrollTop = logList.scrollHeight;
    if (state.revealedHand && state.revealedHand.ownerIndex === opponentIndex) {
        root.appendChild(renderRevealModal(state, handlers));
    }
    return root;
}
function renderPlayerPanel(state, index, label) {
    const p = state.players[index];
    const stories = p.fieldStories
        .map((s) => `<span class="story-chip">${getSongDef(s.defId).nameKo} (${s.remainingTurns === 999 ? "대기중" : s.remainingTurns + "턴"})</span>`)
        .join("") || "<span class='muted'>없음</span>";
    return el(`
    <div class="player-panel-inner ${index === state.activePlayerIndex ? "is-active" : ""}">
      <h3>${p.name} <span class="muted">(${label})</span></h3>
      <div class="stat">인기도: <b>${p.popularity}</b></div>
      <div class="stat">재생 포인트: ${p.pp}/${p.ppMax}</div>
      <div class="stat">손패: ${p.hand.length} · 덱: ${p.deck.length} · 무덤: ${p.graveyard.length}</div>
      <div class="stat">필드: ${stories}</div>
    </div>
  `);
}
function renderRevealModal(state, handlers) {
    const reveal = state.revealedHand;
    const cardsHtml = reveal.cards
        .map((c) => {
        const def = getSongDef(c.defId);
        return `<div class="mini-card">${def.nameKo} (${def.cost})</div>`;
    })
        .join("") || "<span class='muted'>손패 없음</span>";
    const root = el(`
    <div class="modal-overlay">
      <div class="modal-box">
        <h3>${state.players[reveal.ownerIndex].name}의 손패 공개</h3>
        <div class="mini-card-list">${cardsHtml}</div>
        <button id="dismiss-reveal" class="primary-btn">확인</button>
      </div>
    </div>
  `);
    root.querySelector("#dismiss-reveal").addEventListener("click", handlers.onDismissReveal);
    return root;
}
function renderGameOver(state, handlers) {
    const [p0, p1] = state.players;
    const winnerText = state.winnerIndex === "draw"
        ? "무승부!"
        : `${state.players[state.winnerIndex].name} 승리!`;
    const root = el(`
    <div class="gameover-screen">
      <h1>${winnerText}</h1>
      <p>${p0.name}: 인기도 ${p0.popularity} / ${p1.name}: 인기도 ${p1.popularity}</p>
      <button id="restart-btn" class="primary-btn">다시 하기</button>
      <div class="log-panel">
        <h3>진행 기록</h3>
        <div class="log-list">${state.log.map((l) => `<div class="log-line">${l}</div>`).join("")}</div>
      </div>
    </div>
  `);
    root.querySelector("#restart-btn").addEventListener("click", handlers.onRestart);
    return root;
}
//# sourceMappingURL=render.js.map