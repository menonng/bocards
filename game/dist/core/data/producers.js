// 무대 카드(P카드)를 가진 6명의 보카로P.
// 실존 인물/저작물명을 참고용으로 사용한 팬 기획 프로토타입입니다.
//
// accent 색상은 실제 앨범 아트/일러스트를 그대로 추출한 것이 아니라, 각 P의
// 대표곡·브랜드 이미지에서 받은 "무드"를 참고해 새로 고른 값이다 (저작권
// 있는 이미지를 직접 사용하지 않기 위함 — game/README.md 참고).
// twitterHandle은 사용자가 직접 전달한 공식 X(트위터) 계정이다. P카드 배지는
// unavatar.io(공개 아바타 프록시 서비스)를 통해 해당 계정의 현재 프로필
// 사진을 실시간으로 미리보기하고, 실패하면 오리지널 배지로 자동 대체한다.
export const PRODUCERS = [
    { id: "deco27", nameKo: "DECO*27", nameOriginal: "DECO*27", accent: "#d1445a", twitterHandle: "DECO27" },
    { id: "hachi", nameKo: "하치", nameOriginal: "ハチ", accent: "#6f8fae", twitterHandle: "hachi_08" },
    { id: "wowaka", nameKo: "wowaka", nameOriginal: "wowaka", accent: "#8890a0", twitterHandle: "wowaka" },
    { id: "iyowa", nameKo: "이요와", nameOriginal: "いよわ", accent: "#c9714a", twitterHandle: "igusuri_please" },
    { id: "tak", nameKo: "Tak", nameOriginal: "TAK", accent: "#5cb3d9", twitterHandle: "TAK_DRDR" },
    { id: "mang50", nameKo: "50mang", nameOriginal: "50mang(쏘망)", accent: "#8a6fae", twitterHandle: "50mang_" },
];
// 무대 카드는 없지만("게스트") 신화입성곡/유튜브 1억뷰곡을 곡 카드로 등록하기 위해
// 추가한 프로듀서들. P카드에 없는 보카로P의 곡도 넣어도 된다는 방침에 따라 포함.
export const GUEST_PRODUCERS = [
    { id: "ika", nameKo: "ika", nameOriginal: "ika", accent: "#7fae8f" },
    // ryo(supercell): 멜트 참고 이미지의 파스텔 로즈 톤
    { id: "ryo", nameKo: "ryo(supercell)", nameOriginal: "ryo(supercell)", accent: "#b8748f" },
    { id: "kurousa", nameKo: "쿠로우사P", nameOriginal: "黒うさP", accent: "#c94f4f" },
    { id: "cosmo", nameKo: "cosMo@폭주P", nameOriginal: "cosMo@暴走P", accent: "#5a8fae" },
    { id: "kemu", nameKo: "케무", nameOriginal: "kemu", accent: "#9a6fc9" },
    // 40mP: 아논운 마더구스 참고 이미지의 그레이스케일 크랙 하트
    { id: "p40m", nameKo: "40mP", nameOriginal: "40mP", accent: "#9199a6" },
    { id: "rerulili", nameKo: "레루리리", nameOriginal: "Rerulili", accent: "#c9534a" },
    { id: "p164", nameKo: "164", nameOriginal: "164", accent: "#6fae8a" },
    { id: "irohasasaki", nameKo: "이로하(사사키)", nameOriginal: "イロハ(sasaki)", accent: "#a65c5c" },
    { id: "doriko", nameKo: "도리코", nameOriginal: "doriko", accent: "#c98a4a" },
    { id: "mikitop", nameKo: "미키토P", nameOriginal: "mikitoP", accent: "#4a9ac9" },
    { id: "kairikibear", nameKo: "카이리키베어", nameOriginal: "カイリキベア", accent: "#5c7a4a" },
    { id: "neru", nameKo: "네루", nameOriginal: "Neru", accent: "#5c6470" },
    { id: "satsuki", nameKo: "사츠키", nameOriginal: "サツキ", accent: "#c94a8a" },
    { id: "yukopi", nameKo: "유코피", nameOriginal: "ゆこぴ", accent: "#c9c14a" },
    { id: "kikuo", nameKo: "키쿠오", nameOriginal: "きくお", accent: "#7a5ca6" },
    { id: "balloon", nameKo: "바르운", nameOriginal: "バルーン", accent: "#5c8f9c" },
    { id: "kanzakiiori", nameKo: "칸자키 이오리", nameOriginal: "カンザキイオリ", accent: "#4a5a6e" },
    { id: "chinozo", nameKo: "Chinozo", nameOriginal: "Chinozo", accent: "#c95c9c" },
    { id: "kanaria", nameKo: "카나리아", nameOriginal: "Kanaria", accent: "#c9a03a" },
    { id: "nuyuri", nameKo: "누유리", nameOriginal: "ぬゆり", accent: "#6a6fae" },
    { id: "hiiragimagnetite", nameKo: "히이라기 마그네타이트", nameOriginal: "柊マグネタイト", accent: "#8a3a3a" },
    { id: "amala", nameKo: "아마라", nameOriginal: "雨良", accent: "#4a8ac9" },
    { id: "junky", nameKo: "정키", nameOriginal: "Junky", accent: "#c9784a" },
    { id: "trapchick", nameKo: "TRAP CHICK", nameOriginal: "TRAP CHICK", accent: "#c9c14a" },
    { id: "abm", nameKo: "뭐든지모에화", nameOriginal: "何でも萌え化", accent: "#c94a6e" },
];
// wowaka: 롤링걸 참고 이미지의 그레이·모노톤 서클 패턴 무드로 통일
// iyowa: 열이상 참고 이미지의 붉은 에너지 톤으로 통일 (위 배열에서 이미 반영)
export const ALL_PRODUCERS = [...PRODUCERS, ...GUEST_PRODUCERS];
export function getProducer(id) {
    const p = ALL_PRODUCERS.find((x) => x.id === id);
    if (!p)
        throw new Error(`Unknown producer id: ${id}`);
    return p;
}
//# sourceMappingURL=producers.js.map