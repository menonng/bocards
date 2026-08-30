// 무대 카드(P카드)를 가진 6명의 보카로P.
// 실존 인물/저작물명을 참고용으로 사용한 팬 기획 프로토타입입니다.
export const PRODUCERS = [
    { id: "deco27", nameKo: "DECO*27", nameOriginal: "DECO*27" },
    { id: "hachi", nameKo: "하치", nameOriginal: "ハチ" },
    { id: "wowaka", nameKo: "wowaka", nameOriginal: "wowaka" },
    { id: "iyowa", nameKo: "이요와", nameOriginal: "いよわ" },
    { id: "tak", nameKo: "Tak", nameOriginal: "TAK" },
    { id: "mang50", nameKo: "50mang", nameOriginal: "50mang(쏘망)" },
];
// 무대 카드는 없지만("게스트") 신화입성곡/유튜브 1억뷰곡을 곡 카드로 등록하기 위해
// 추가한 프로듀서들. P카드에 없는 보카로P의 곡도 넣어도 된다는 방침에 따라 포함.
export const GUEST_PRODUCERS = [
    { id: "ika", nameKo: "ika", nameOriginal: "ika" },
    { id: "ryo", nameKo: "ryo(supercell)", nameOriginal: "ryo(supercell)" },
    { id: "kurousa", nameKo: "쿠로우사P", nameOriginal: "黒うさP" },
    { id: "cosmo", nameKo: "cosMo@폭주P", nameOriginal: "cosMo@暴走P" },
    { id: "kemu", nameKo: "케무", nameOriginal: "kemu" },
    { id: "p40m", nameKo: "40mP", nameOriginal: "40mP" },
    { id: "rerulili", nameKo: "레루리리", nameOriginal: "Rerulili" },
    { id: "p164", nameKo: "164", nameOriginal: "164" },
    { id: "irohasasaki", nameKo: "이로하(사사키)", nameOriginal: "イロハ(sasaki)" },
    { id: "doriko", nameKo: "도리코", nameOriginal: "doriko" },
    { id: "mikitop", nameKo: "미키토P", nameOriginal: "mikitoP" },
    { id: "kairikibear", nameKo: "카이리키베어", nameOriginal: "カイリキベア" },
    { id: "neru", nameKo: "네루", nameOriginal: "Neru" },
    { id: "satsuki", nameKo: "사츠키", nameOriginal: "サツキ" },
    { id: "yukopi", nameKo: "유코피", nameOriginal: "ゆこぴ" },
    { id: "kikuo", nameKo: "키쿠오", nameOriginal: "きくお" },
];
export const ALL_PRODUCERS = [...PRODUCERS, ...GUEST_PRODUCERS];
export function getProducer(id) {
    const p = ALL_PRODUCERS.find((x) => x.id === id);
    if (!p)
        throw new Error(`Unknown producer id: ${id}`);
    return p;
}
//# sourceMappingURL=producers.js.map