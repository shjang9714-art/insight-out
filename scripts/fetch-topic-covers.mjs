#!/usr/bin/env node
/**
 * 토픽 커버 풀 확충 — Pexels에서 토픽별 이미지를 받아 검토 폴더에 저장한다.
 *
 * 배경: public/topic-covers/ 의 생성 커버 풀이 토픽당 1~2장뿐이라(특히 'IT 동향'=1장),
 *   실사 썸네일이 없는 기사들이 전부 같은 그림을 받는다(pickTopicCover는 hashIndex(id, N)로
 *   분산하는데 N=1이면 분산할 게 없다).
 *
 * 사용법:
 *   PEXELS_API_KEY=xxxx node scripts/fetch-topic-covers.mjs            # 전체
 *   PEXELS_API_KEY=xxxx node scripts/fetch-topic-covers.mjs IT 클라우드   # 특정 토픽만
 *   (키 발급: https://www.pexels.com/api/ — 무료·즉시)
 *
 * 저장 위치: public/topic-covers/_review/{basename}-{n}.webp  ← 검토용(서비스 미반영)
 *   → 눈으로 보고 쓸 만한 것만 public/topic-covers/ 로 옮긴다.
 *   → 배포하면 prebuild(scripts/build-topic-cover-manifest.mjs)가 매니페스트를 자동 재생성.
 *
 * ⚠️ 검토 없이 바로 public/topic-covers/ 에 넣지 말 것 — 스톡은 관련성이 들쭉날쭉하다.
 *
 * 라이선스: Pexels License(상업적 사용 무료, 출처표기 불필요).
 *   https://www.pexels.com/license/
 *
 * 파일명 규칙(생성기가 파싱함):
 *   - 뒤의 변형 접미(-2, -3)는 제거되고, 남은 base 가 ALIAS 로 토픽 키에 매핑된다.
 *   - 예: IT-2.webp → base 'IT' → ALIAS['IT'] = 'IT 동향'
 *   - 그래서 아래 basename 은 src/lib/contents/topic-cover.ts 의 ALIAS 와 일치해야 한다.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'topic-covers', '_review')

// WebP 로 재인코딩해 저장한다(JPEG 대비 절반 이하 — 장수를 늘려도 레포가 안 무거워짐).
// 매니페스트 생성기(scripts/build-topic-cover-manifest.mjs)가 .webp 를 이미 인식한다.
const COVER_WIDTH = 1200   // 카드 aspect-[16/9] · 레티나 감안
const WEBP_QUALITY = 78

const API_KEY = process.env.PEXELS_API_KEY
if (!API_KEY) {
  console.error('❌ PEXELS_API_KEY 가 없습니다. https://www.pexels.com/api/ 에서 무료 발급 후:')
  console.error('   PEXELS_API_KEY=xxxx node scripts/fetch-topic-covers.mjs')
  process.exit(1)
}

/**
 * 토픽별 큐레이션.
 *   basename: 저장 파일명 base (ALIAS 키와 일치할 것)
 *   query   : Pexels 검색어(영어)
 *   need    : 받을 장수
 *   startAt : 파일명 시작 번호(기존 파일과 충돌 방지 — 현재 보유 장수 + 1)
 */
const TOPICS = [
  // ── 최우선: 풀이 1장뿐이라 화면이 도배됨 ──
  { basename: 'IT',        query: 'server room network cables',       need: 12, startAt: 2 },  // 'IT 동향' — 재시도(추상 렌더 대신 구체 피사체)
  { basename: '클라우드',   query: 'cloud computing server',           need: 12, startAt: 2 },  // 현재 1장
  { basename: '에너지',     query: 'renewable energy power grid',      need: 12, startAt: 2 },  // 현재 1장
  { basename: '리포트',     query: 'financial charts documents',       need: 12, startAt: 2 },  // 재시도

  // ── 2장뿐(고volume) ──
  { basename: 'AI기술',     query: 'artificial intelligence circuit',  need: 12, startAt: 3 },  // 'AI 기술'
  { basename: '뉴스',       query: 'newsroom journalism media',        need: 12, startAt: 3 },
  { basename: '반도체',     query: 'semiconductor microchip wafer',    need: 12, startAt: 3 },
  { basename: '통신 b2b',   query: 'telecommunications network tower', need: 12, startAt: 3 },  // '통신 B2B'
  { basename: 'AIDC',       query: 'data center server room',          need: 12, startAt: 3 },
  { basename: '제조dx',     query: 'smart factory automation robot',   need: 12, startAt: 3 },  // '제조 DX'
  { basename: '피지컬ai',   query: 'humanoid robot industrial',        need: 12, startAt: 3 },  // '피지컬 AI'
  { basename: 'esg',        query: 'sustainability green business',    need: 12, startAt: 3 },  // 'ESG'
  { basename: '웹인사이트', query: 'digital insight analytics screen', need: 12, startAt: 3 },
]

const only = process.argv.slice(2)
const targets = only.length > 0
  ? TOPICS.filter((t) => only.includes(t.basename))
  : TOPICS

async function searchPexels(query, need) {
  // per_page 를 넉넉히 받아 세로 사진을 걸러낸 뒤 need 장만 쓴다.
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${need * 3}`
  const res = await fetch(url, { headers: { Authorization: API_KEY } })
  if (!res.ok) throw new Error(`Pexels ${res.status} ${res.statusText}`)
  const data = await res.json()
  return (data.photos ?? [])
    .filter((p) => p.width >= p.height)   // 가로형 우선(세로 원본은 크롭이 어색해짐)
    .slice(0, need)
}

/** 내려받아 폭 COVER_WIDTH 로 리사이즈 + WebP 재인코딩해 저장. 반환: 저장 바이트 */
async function downloadAsWebp(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  const img = await loadImage(Buffer.from(await res.arrayBuffer()))

  const w = Math.min(COVER_WIDTH, img.width)
  const h = Math.round((img.height / img.width) * w)
  const canvas = createCanvas(w, h)
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)

  const webp = canvas.toBuffer('image/webp', WEBP_QUALITY)
  await writeFile(dest, webp)
  return webp.length
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  console.log(`검토 폴더: ${path.relative(ROOT, OUT_DIR)}\n`)

  const credits = []
  let total = 0
  let totalBytes = 0

  for (const t of targets) {
    process.stdout.write(`[${t.basename}] "${t.query}" … `)
    let photos
    try {
      photos = await searchPexels(t.query, t.need)
    } catch (e) {
      console.log(`❌ 검색 실패: ${e.message}`)
      continue
    }
    if (photos.length === 0) { console.log('결과 없음'); continue }

    let n = t.startAt
    for (const p of photos) {
      // large2x(1880px) 를 받아 COVER_WIDTH 로 줄여 WebP 인코딩 — 화질 손실 최소화
      const src = p.src.large2x ?? p.src.landscape ?? p.src.large
      const file = `${t.basename}-${n}.webp`
      try {
        const bytes = await downloadAsWebp(src, path.join(OUT_DIR, file))
        credits.push(`${file}\t${p.photographer}\t${p.url}`)
        totalBytes += bytes
        total++
        n++
        process.stdout.write('.')
      } catch {
        process.stdout.write('x')
      }
    }
    console.log(` ${n - t.startAt}장`)
  }

  // 출처 기록(Pexels는 표기 의무 없지만, 어디서 왔는지 추적용)
  await writeFile(
    path.join(OUT_DIR, '_credits.tsv'),
    '파일\t촬영자\t원본URL\n' + credits.join('\n') + '\n',
    'utf8'
  )

  const mb = (totalBytes / 1024 / 1024).toFixed(1)
  console.log(`\n✅ 총 ${total}장 · ${mb}MB (WebP) → ${path.relative(ROOT, OUT_DIR)}`)
  console.log('\n다음 단계:')
  console.log('  1. 검토 폴더를 열어 눈으로 확인 (관련 없거나 조악한 것 버리기)')
  console.log('  2. 쓸 것만 public/topic-covers/ 로 이동')
  console.log('  3. 커밋·배포 → prebuild 가 매니페스트를 자동 재생성')
  console.log('  4. _review 폴더와 _credits.tsv 는 커밋하지 말 것(.gitignore 확인)')
}

main().catch((e) => { console.error('실패:', e); process.exit(1) })
