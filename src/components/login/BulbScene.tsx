import Image from 'next/image'

/**
 * BulbScene — 목업 v3(insight_out_image_overlay_mockup_fixed_v3.html)의 좌측
 * 전구+애니메이션을 동일하게 재현한 히어로.
 *
 * 구성(목업과 동일):
 * - 전구 asset: 목업 베이스 이미지에서 전구 주변(광류·글로우 포함)을 분리한
 *   `/brand/login-bulb-scene.png` (원본 좌표 x40-845 / y455-958 크롭 후 미러+블러로
 *   좌308·우343·상303·하281 확장, 가장자리 feather → 1456×1087. 전구·구슬 픽셀
 *   크기는 원본 그대로, 주변 필드만 확장).
 * - 오버레이 SVG: viewBox 를 확장 크롭과 동일한 "-268 152 1456 1087" 으로 잡아
 *   목업의 path·orb·comet·twinkle 좌표를 변환 없이 그대로 사용한다.
 *   목업처럼 mix-blend-mode:screen 으로 이미지 위에 얹는다.
 * - ① bulb aura(glowPulse) ② flow guide line 11개(gold/pink)
 *   ③ 별똥별 streak 4개 ④ 곡선을 따라 전구로 모여드는 orb 11개(animateMotion)
 *   ⑤ comet head 4개 ⑥ 전구 주변 twinkle 4개.
 *
 * 접근성/성능: 레이어 전체 pointer-events:none. SMIL 은 CSS 로 정지할 수 없으므로
 * prefers-reduced-motion 시 .io-anim 그룹을 숨긴다(globals.css). 모바일에서는
 * .io-extra(작은 orb 일부)를 숨겨 입자 수를 줄인다.
 */
export function BulbScene() {
  return (
    <div className="io-anim-layer relative mx-auto aspect-[1456/1087] w-full">
      {/* 전구 asset — 목업 이미지의 전구 영역 분리본 */}
      <Image
        src="/brand/login-bulb-scene.png"
        alt=""
        aria-hidden="true"
        width={1456}
        height={1087}
        priority
        className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover"
      />

      {/* 목업 v3 오버레이 — 원본 좌표 그대로, screen 블렌드 */}
      <svg
        className="absolute inset-0 z-10 h-full w-full overflow-visible mix-blend-screen"
        viewBox="-268 152 1456 1087"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="iov3-trailGold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#fff4d1" stopOpacity=".35" />
            <stop offset="100%" stopColor="#fff1b2" stopOpacity=".9" />
          </linearGradient>
          <linearGradient id="iov3-trailPink" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#f7d8ff" stopOpacity=".34" />
            <stop offset="100%" stopColor="#ffd5ef" stopOpacity=".82" />
          </linearGradient>
          <linearGradient id="iov3-meteor" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="60%" stopColor="#fff5ce" stopOpacity=".28" />
            <stop offset="100%" stopColor="#fff8df" stopOpacity="1" />
          </linearGradient>
          <radialGradient id="iov3-orbFill" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#fffdf8" />
            <stop offset="40%" stopColor="#ffe9a8" />
            <stop offset="78%" stopColor="#ffd6f1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity=".15" />
          </radialGradient>
          <radialGradient id="iov3-bulbAura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff9de" stopOpacity=".68" />
            <stop offset="45%" stopColor="#ffe9ae" stopOpacity=".32" />
            <stop offset="100%" stopColor="#fff2b1" stopOpacity="0" />
          </radialGradient>
          <filter id="iov3-blur26"><feGaussianBlur stdDeviation="26" /></filter>
          <filter id="iov3-shadow">
            <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#f6cc67" floodOpacity=".45" />
          </filter>
        </defs>

        {/* ① 전구 aura — 은은한 glow pulse */}
        <g className="io-glow-pulse">
          <ellipse cx="460" cy="658" rx="225" ry="185" fill="url(#iov3-bulbAura)" filter="url(#iov3-blur26)" />
        </g>

        {/* ② flow guide lines — 좌우에서 전구로 수렴 */}
        <g fill="none" strokeLinecap="round" opacity=".95">
          <path id="iov3-p1" d="M28 560 C 140 560, 218 582, 290 596 C 348 606, 394 620, 442 648" stroke="url(#iov3-trailGold)" strokeWidth="4.5" />
          <path id="iov3-p2" d="M10 620 C 136 620, 226 640, 298 650 C 364 658, 404 658, 448 658" stroke="url(#iov3-trailPink)" strokeWidth="3.5" />
          <path id="iov3-p3" d="M24 698 C 160 692, 250 704, 320 700 C 380 696, 414 682, 450 668" stroke="url(#iov3-trailGold)" strokeWidth="3.2" />
          <path id="iov3-p4" d="M36 774 C 150 758, 238 740, 312 724 C 382 708, 420 688, 450 676" stroke="url(#iov3-trailPink)" strokeWidth="3" />
          <path id="iov3-p5" d="M56 492 C 174 500, 256 534, 324 558 C 376 578, 414 604, 450 638" stroke="url(#iov3-trailGold)" strokeWidth="2.8" />
          <path id="iov3-p6" d="M94 436 C 188 462, 256 508, 328 548 C 380 576, 416 604, 452 634" stroke="url(#iov3-trailPink)" strokeWidth="2.4" />
          <path id="iov3-p7" d="M822 532 C 740 556, 662 588, 598 610 C 544 628, 502 642, 470 652" stroke="url(#iov3-trailGold)" strokeWidth="3.8" />
          <path id="iov3-p8" d="M842 612 C 752 624, 682 638, 612 648 C 556 656, 510 658, 470 658" stroke="url(#iov3-trailPink)" strokeWidth="3.4" />
          <path id="iov3-p9" d="M830 698 C 734 696, 662 690, 592 680 C 538 672, 500 668, 470 664" stroke="url(#iov3-trailGold)" strokeWidth="3.2" />
          <path id="iov3-p10" d="M820 782 C 720 760, 644 730, 582 706 C 536 688, 500 674, 470 668" stroke="url(#iov3-trailPink)" strokeWidth="2.8" />
          <path id="iov3-p11" d="M804 452 C 726 482, 648 532, 584 572 C 532 604, 496 628, 468 646" stroke="url(#iov3-trailGold)" strokeWidth="2.4" />
        </g>

        {/* ③ 별똥별 streak */}
        <g fill="none" stroke="url(#iov3-meteor)" strokeLinecap="round" opacity=".95">
          <path id="iov3-m1" d="M52 500 C 176 518, 280 560, 370 598 C 402 612, 432 630, 452 648" strokeWidth="4.2" />
          <path id="iov3-m2" d="M110 760 C 216 742, 300 718, 372 696 C 414 684, 438 674, 452 666" strokeWidth="4" />
          <path id="iov3-m3" d="M780 470 C 698 504, 632 552, 574 594 C 526 628, 492 648, 466 658" strokeWidth="4.2" />
          <path id="iov3-m4" d="M800 738 C 720 720, 642 696, 580 678 C 526 664, 492 660, 468 658" strokeWidth="4" />
        </g>

        {/* ④ moving orbs — 곡선을 따라 전구로 */}
        <g className="io-anim">
          <circle r="12" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="5s" repeatCount="indefinite"><mpath href="#iov3-p1" /></animateMotion></circle>
          <circle r="9" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="4.8s" begin="-1.2s" repeatCount="indefinite"><mpath href="#iov3-p2" /></animateMotion></circle>
          <circle className="io-extra" r="8" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="4.4s" begin="-2.1s" repeatCount="indefinite"><mpath href="#iov3-p3" /></animateMotion></circle>
          <circle r="9.5" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="5.4s" begin="-.6s" repeatCount="indefinite"><mpath href="#iov3-p4" /></animateMotion></circle>
          <circle className="io-extra" r="7" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="4.9s" begin="-2.8s" repeatCount="indefinite"><mpath href="#iov3-p5" /></animateMotion></circle>
          <circle className="io-extra" r="6" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="4.1s" begin="-1.7s" repeatCount="indefinite"><mpath href="#iov3-p6" /></animateMotion></circle>
          <circle r="10" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="5.1s" begin="-.9s" repeatCount="indefinite"><mpath href="#iov3-p7" /></animateMotion></circle>
          <circle className="io-extra" r="8" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="4.7s" begin="-2.3s" repeatCount="indefinite"><mpath href="#iov3-p8" /></animateMotion></circle>
          <circle className="io-extra" r="7" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="4.2s" begin="-1.3s" repeatCount="indefinite"><mpath href="#iov3-p9" /></animateMotion></circle>
          <circle r="8.8" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="5.6s" begin="-2.7s" repeatCount="indefinite"><mpath href="#iov3-p10" /></animateMotion></circle>
          <circle className="io-extra" r="6" fill="url(#iov3-orbFill)" filter="url(#iov3-shadow)"><animateMotion dur="4.6s" begin="-.4s" repeatCount="indefinite"><mpath href="#iov3-p11" /></animateMotion></circle>
        </g>

        {/* ⑤ comet heads — streak 을 따라가는 별똥별 머리 */}
        <g className="io-anim">
          <g>
            <ellipse rx="19" ry="5.2" fill="url(#iov3-meteor)" opacity=".95"><animateMotion dur="3.8s" repeatCount="indefinite"><mpath href="#iov3-m1" /></animateMotion></ellipse>
            <circle r="5.8" fill="#fff8df"><animateMotion dur="3.8s" repeatCount="indefinite"><mpath href="#iov3-m1" /></animateMotion></circle>
          </g>
          <g>
            <ellipse rx="17" ry="4.8" fill="url(#iov3-meteor)" opacity=".92"><animateMotion dur="3.4s" begin="-1.3s" repeatCount="indefinite"><mpath href="#iov3-m2" /></animateMotion></ellipse>
            <circle r="5.3" fill="#fff8df"><animateMotion dur="3.4s" begin="-1.3s" repeatCount="indefinite"><mpath href="#iov3-m2" /></animateMotion></circle>
          </g>
          <g>
            <ellipse rx="19" ry="5.2" fill="url(#iov3-meteor)" opacity=".95"><animateMotion dur="3.9s" begin="-.8s" repeatCount="indefinite"><mpath href="#iov3-m3" /></animateMotion></ellipse>
            <circle r="5.8" fill="#fff8df"><animateMotion dur="3.9s" begin="-.8s" repeatCount="indefinite"><mpath href="#iov3-m3" /></animateMotion></circle>
          </g>
          <g>
            <ellipse rx="17" ry="4.8" fill="url(#iov3-meteor)" opacity=".9"><animateMotion dur="3.5s" begin="-2s" repeatCount="indefinite"><mpath href="#iov3-m4" /></animateMotion></ellipse>
            <circle r="5.3" fill="#fff8df"><animateMotion dur="3.5s" begin="-2s" repeatCount="indefinite"><mpath href="#iov3-m4" /></animateMotion></circle>
          </g>
        </g>

        {/* ⑥ 전구 주변 twinkle */}
        <g>
          <g className="io-twinkle" transform="translate(328 566)">
            <path d="M0 -10 L2 -2 L10 0 L2 2 L0 10 L-2 2 L-10 0 L-2 -2 Z" fill="#fff9dd" />
          </g>
          <g className="io-twinkle s2" transform="translate(602 566)">
            <path d="M0 -8 L1.6 -1.6 L8 0 L1.6 1.6 L0 8 L-1.6 1.6 L-8 0 L-1.6 -1.6 Z" fill="#fff9dd" />
          </g>
          <g className="io-twinkle s3" transform="translate(380 778)">
            <path d="M0 -7 L1.3 -1.3 L7 0 L1.3 1.3 L0 7 L-1.3 1.3 L-7 0 L-1.3 -1.3 Z" fill="#fff9dd" />
          </g>
          <g className="io-twinkle s4" transform="translate(530 748)">
            <path d="M0 -6 L1.2 -1.2 L6 0 L1.2 1.2 L0 6 L-1.2 1.2 L-6 0 L-1.2 -1.2 Z" fill="#fff9dd" />
          </g>
        </g>
      </svg>
    </div>
  )
}
