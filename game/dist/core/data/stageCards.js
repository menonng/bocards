// P카드 = 무대 카드. 게임 시작 시 무작위로 1장이 정해져 "판 전체"에 적용되는
// 공용 규칙. 카드에는 보카로P 이름만 표시한다 (플레이버 문구는 설명에만 사용).
// (유희왕 필드 마법 + MTG 플레인체이스 + Fluxx 를 조합한 v0.2 설계)
export const STAGE_CARDS = [
    {
        id: "stage-deco27",
        producerId: "deco27",
        nameKo: "DECO*27",
        description: "고백의 계절 — 감정을 직설적으로 던지는 가사처럼, 버프·디버프·회복이 더 진하게 걸린다. " +
            "[전원] 아이템 타입 카드의 효과 수치 +1.",
        modifiers: { allItemEffectBonus: 1 },
    },
    {
        id: "stage-hachi",
        producerId: "hachi",
        nameKo: "하치",
        description: "긴 이야기 — 서사적인 곡답게 판 자체가 길어지고 설치형 아이템이 오래 남는다. " +
            "[전원] 설치형 아이템 지속 턴 +1, 시작 체력 +2. 차트 모드 종료 턴 +2.",
        modifiers: {
            storyDurationDelta: 1,
            startPopularityDelta: 2,
            turnLimitDelta: 2,
        },
    },
    {
        id: "stage-wowaka",
        producerId: "wowaka",
        nameKo: "wowaka",
        description: "질주하는 청춘 — 쉴 새 없이 몰아치는 초기 보카로 록처럼, 한 턴에 곡을 두 곡까지 발매할 수 있다. " +
            "대신 감정을 오래 담아두지 못해 손패 제한이 줄어든다. " +
            "[전원] 턴당 메인 발동 횟수 +1, 손패 제한 -2.",
        modifiers: { extraCardPlayPerTurn: 1, handLimitDelta: -2 },
    },
    {
        id: "stage-iyowa",
        producerId: "iyowa",
        nameKo: "이요와",
        description: "생각이 많은 밤 — 머릿속을 가득 채우는 상념들처럼 카드가 잘 돌지만, 다 붙잡고 있을 수는 없다. " +
            "[전원] 매 턴 드로우 +1, 턴 종료 시 손에서 무작위 1장 버림.",
        modifiers: { extraDrawPerTurn: 1, endOfTurnRandomDiscard: 1 },
    },
    {
        id: "stage-tak",
        producerId: "tak",
        nameKo: "Tak",
        description: "가장 귀여운 배틀 — K-POP 무대 같은 고에너지 하이텐션. 한 방이 크지만 오래 버티긴 어렵다. " +
            "[전원] 보컬 타입 카드 데미지 +1, 시작 체력 -2.",
        modifiers: { allVocalDamageBonus: 1, startPopularityDelta: -2 },
    },
    {
        id: "stage-mang50",
        producerId: "mang50",
        nameKo: "50mang",
        description: "윤회의 밤 — 한국 설화 속 존재들처럼, 한 번 쓰러진 곡도 다시 돌아온다. " +
            "[전원] 자신 턴 시작 시, 무덤에 카드가 있으면 1장을 손으로 되돌린다.",
        modifiers: { graveyardReviveOnTurnStart: 1 },
    },
];
//# sourceMappingURL=stageCards.js.map