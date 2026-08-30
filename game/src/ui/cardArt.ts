// ─────────────────────────────────────────────────────────────
// 카드 아트 — 저작권이 있는 실제 일러스트를 그대로 쓰지 않기 위해,
// 참고 이미지의 "무드"(색감·모티프)만 살려 코드로 직접 그리는
// 추상 SVG 아트다. 실사진/일러스트가 아니라 상징적 그래픽이라는
// 점을 감안해 만들어졌다 (자세한 사정은 game/README.md 참고).
// ─────────────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 동심원 패턴 (롤링 걸 참고 이미지의 원 모티프를 오리지널로 재해석) */
function orbitRings(color: string): string {
  const rings = [70, 54, 38, 22]
    .map(
      (r, i) =>
        `<circle cx="90" cy="70" r="${r}" fill="none" stroke="${withAlpha(color, 0.55 - i * 0.1)}" stroke-width="6"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 180 140">
    <rect width="180" height="140" fill="#101014"/>
    ${rings}
    <circle cx="90" cy="70" r="6" fill="${color}"/>
  </svg>`;
}

/** 균열이 간 크리스탈 하트 (아논운 마더구스 참고 이미지를 오리지널로 재해석) */
function shardHeart(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 180 140">
    <rect width="180" height="140" fill="#101014"/>
    <g transform="translate(90 70)">
      <path d="M0,-28 L26,-8 L20,28 L0,44 L-20,28 L-26,-8 Z" fill="none" stroke="${withAlpha(color, 0.8)}" stroke-width="2.5"/>
      <path d="M0,-28 L0,44 M-26,-8 L26,-8 M-20,28 L20,28" stroke="${withAlpha(color, 0.4)}" stroke-width="1.5"/>
      <path d="M-6,-6 L4,10 L-4,14 L8,32" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    </g>
  </svg>`;
}

/** 부드러운 방사형 빛 번짐 (멜트 참고 이미지의 파스텔 톤을 오리지널로 재해석) */
function radialBloom(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 180 140">
    <defs>
      <radialGradient id="g" cx="50%" cy="45%" r="65%">
        <stop offset="0%" stop-color="${withAlpha(color, 0.9)}"/>
        <stop offset="60%" stop-color="${withAlpha(color, 0.25)}"/>
        <stop offset="100%" stop-color="#101014"/>
      </radialGradient>
    </defs>
    <rect width="180" height="140" fill="#101014"/>
    <rect width="180" height="140" fill="url(#g)"/>
  </svg>`;
}

/** 흩뿌려진 기하 조각들 (효과 카드 — 설치형/반응형 공통) */
function scatterShards(color: string, seed: number): string {
  let s = seed || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s % 1000) / 1000;
  };
  const shapes = Array.from({ length: 10 }, () => {
    const x = 10 + rand() * 160;
    const y = 10 + rand() * 120;
    const size = 4 + rand() * 10;
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${withAlpha(color, 0.35 + rand() * 0.4)}" transform="rotate(${Math.round(rand() * 45)} ${x} ${y})"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 180 140">
    <rect width="180" height="140" fill="#101014"/>
    ${shapes}
  </svg>`;
}

/** 프로듀서 배지 — 원 + 이니셜 (DECO*27 로고의 "원+글자" 구성만 참고한 오리지널 마크) */
export function producerBadgeDataUri(color: string, initials: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 180 140">
    <rect width="180" height="140" fill="#0c0c10"/>
    <circle cx="90" cy="68" r="34" fill="none" stroke="${color}" stroke-width="4"/>
    <circle cx="118" cy="40" r="4" fill="${color}"/>
    <text x="90" y="78" font-family="Arial, sans-serif" font-size="26" font-weight="900"
          text-anchor="middle" fill="${color}">${initials}</text>
  </svg>`;
  return svgToDataUri(svg);
}

/** 카드 id를 기반으로 결정론적으로 아트 하나를 골라 data URI로 반환한다. */
export function cardArtDataUri(cardId: string, color: string): string {
  const h = hashString(cardId);
  const variant = h % 4;
  let svg: string;
  switch (variant) {
    case 0:
      svg = orbitRings(color);
      break;
    case 1:
      svg = shardHeart(color);
      break;
    case 2:
      svg = radialBloom(color);
      break;
    default:
      svg = scatterShards(color, h);
  }
  return svgToDataUri(svg);
}
