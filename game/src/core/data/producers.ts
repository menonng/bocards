import { ProducerInfo } from "../types.js";

// 이번 v1 구현에 포함되는 6명의 보카로P.
// 실존 인물/저작물명을 참고용으로 사용한 팬 기획 프로토타입입니다.
export const PRODUCERS: ProducerInfo[] = [
  { id: "deco27", nameKo: "DECO*27", nameOriginal: "DECO*27" },
  { id: "hachi", nameKo: "하치", nameOriginal: "ハチ" },
  { id: "wowaka", nameKo: "wowaka", nameOriginal: "wowaka" },
  { id: "iyowa", nameKo: "이요와", nameOriginal: "いよわ" },
  { id: "tak", nameKo: "Tak", nameOriginal: "TAK" },
  { id: "mang50", nameKo: "50mang", nameOriginal: "50mang(쏘망)" },
];

export function getProducer(id: string): ProducerInfo {
  const p = PRODUCERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown producer id: ${id}`);
  return p;
}
