#!/usr/bin/env node
// 지시서 281 — public/topic-covers/ 를 스캔해 src/lib/contents/topic-cover-manifest.generated.ts 를 생성한다.
// package.json 의 prebuild 훅에서 실행된다. 런타임(Vercel)에는 fs 접근 없음 — 빌드 시점에만 실행.

import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'public', 'topic-covers')
const OUT_FILE = path.join(ROOT, 'src', 'lib', 'contents', 'topic-cover-manifest.generated.ts')

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])

// 파일 rawKey(변형접미 제거 후) → 매칭 대상 canonical.
// src/lib/contents/topic-cover.ts 의 ALIAS 와 동일하게 유지할 것(단일 진실 아님 — 수동 동기화).
const ALIAS = {
  'AI기술': 'AI 기술',
  '통신 b2b': '통신 B2B',
  '피지컬ai': '피지컬 AI',
  '제조dx': '제조 DX',
  '정부규제': '정부 규제',
  'cctv': 'CCTV·영상보안',
  'sme': 'SME 솔루션',
  'sme,soho': 'SME 솔루션',
  'IT': 'IT 동향',
  'ai보고서': 'AI보고서',
  '전략보고서 표지': '전략보고서',
  'esg': 'ESG',
}

// 파일명 끝의 변형 접미(-2, 5 등) 제거. 예: "모빌리티5"→"모빌리티", "AICC-2"→"AICC"
function stripVariantSuffix(name) {
  return name.replace(/-?\d+$/, '')
}

async function main() {
  const entries = await readdir(SRC_DIR, { withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort()

  const pool = {}

  for (const file of files) {
    const ext = path.extname(file)
    const base = file.slice(0, -ext.length)
    // macOS(APFS)는 한글 파일명을 NFD(자모 분해)로 반환. 매칭 키와 URL 모두 NFC로 정규화해
    // 빌드 OS(맥=NFD / Vercel Linux=NFC 체크아웃)와 무관하게 매니페스트를 결정론적으로 만든다.
    // git 트리 파일명은 NFC이므로 Vercel에서 NFC URL이 정확히 매칭되고(200), macOS는 정규화-무관 조회라 로컬 dev도 200.
    const normalizedFile = file.normalize('NFC')
    const rawKey = stripVariantSuffix(base).normalize('NFC')
    const canonicalKey = ALIAS[rawKey] ?? rawKey
    const url = encodeURI(`/topic-covers/${normalizedFile}`)
    if (!pool[canonicalKey]) pool[canonicalKey] = []
    pool[canonicalKey].push({ file: normalizedFile, url })
  }

  const lines = []
  lines.push('// 자동 생성 파일 — 직접 수정 금지.')
  lines.push('// scripts/build-topic-cover-manifest.mjs 로 재생성 (npm run build 의 prebuild 훅에서 자동 실행).')
  lines.push(`// 원본: public/topic-covers/ (이미지 ${files.length}개 → 키 ${Object.keys(pool).length}개)`)
  lines.push('')
  lines.push('export const TOPIC_COVER_POOL: Record<string, string[]> = {')
  for (const key of Object.keys(pool).sort()) {
    // 키별 파일 배열을 파일명 오름차순으로 정렬해 출력 — readdir 순서는 실행 환경(파일시스템)마다
    // 달라질 수 있어 그대로 쓰면 같은 소스로도 커버 이미지 우선순위가 매 빌드 흔들린다.
    const sorted = pool[key].slice().sort((a, b) => a.file.localeCompare(b.file))
    const arr = sorted.map((u) => JSON.stringify(u.url)).join(', ')
    lines.push(`  ${JSON.stringify(key)}: [${arr}],`)
  }
  lines.push('}')
  lines.push('')

  await writeFile(OUT_FILE, lines.join('\n'), 'utf8')
  console.log(
    `[build-topic-cover-manifest] 이미지 ${files.length}개 → 키 ${Object.keys(pool).length}개 → ${path.relative(ROOT, OUT_FILE)}`
  )
}

main().catch((err) => {
  console.error('[build-topic-cover-manifest] 실패:', err)
  process.exit(1)
})
