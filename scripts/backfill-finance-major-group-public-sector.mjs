#!/usr/bin/env node
// 일회성 백필 — 금융/대기업그룹사/공공 keyword_groups 신설(2026-07-13-금융-대기업그룹사-공공-키워드그룹-신설.sql)
// 이후, 기존 published 콘텐츠에 대해 matched_groups/matched_keywords를 재계산해 append한다.
// 지시서: 지시서_20260713b_맞춤피드-희소카테고리-무관기사백필.md §3 STEP 5
//
// 매칭 로직은 src/lib/crawler/quality.ts 의 patternHit/matchKeywordGroups 와 100% 동일하게
// 유지한다(로직 분기 없이 이 파일 안에 복제 — quality.ts는 '@/lib/...' 별칭을 쓰는 TS 모듈이라
// 별도 트랜스파일 없이 plain node로 바로 못 돌리기 때문. 로직을 바꿀 경우 quality.ts와 함께 갱신할 것).
//
// 실행: node scripts/backfill-finance-major-group-public-sector.mjs
//   기본은 --dry-run(집계만, DB 쓰기 없음). 실제 반영하려면 --apply 플래그 필요.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const TARGET_KINDS = ['finance', 'major_group', 'public_sector']
const APPLY = process.argv.includes('--apply')

// ── src/lib/crawler/quality.ts 그대로 복제 ──
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function patternHit(textLower, pattern) {
  const p = pattern.trim().toLowerCase()
  if (!p) return false
  if (/^[a-z0-9]{1,4}$/.test(p)) {
    return new RegExp(`(?<![a-z0-9])${escapeRegex(p)}(?![a-z0-9])`, 'i').test(textLower)
  }
  return textLower.includes(p)
}
function matchKeywordGroups(title, body, groups) {
  const text = `${title} ${body}`.toLowerCase()
  const groupSet = new Set()
  const kwSet = new Set()
  for (const g of groups) {
    if (g.weight <= 0) continue
    let hit = false
    for (const p of g.include_patterns) {
      if (patternHit(text, p)) {
        kwSet.add(p)
        hit = true
      }
    }
    if (hit) groupSet.add(g.name)
  }
  return { groups: [...groupSet], keywords: [...kwSet].slice(0, 8) }
}
// ────────────────────────────────────

async function fetchAllPublished() {
  let all = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('contents')
      .select('id, title, body_original, matched_groups, matched_keywords')
      .eq('status', 'published')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function main() {
  const { data: newGroups, error: gErr } = await supabase
    .from('keyword_groups')
    .select('name, kind, include_patterns, weight')
    .in('kind', TARGET_KINDS)
  if (gErr) throw gErr
  if (newGroups.length !== TARGET_KINDS.length) {
    console.error(`⚠️ ${TARGET_KINDS.length}개 그룹 중 ${newGroups.length}개만 확인됨 — SQL 실행 여부를 확인하세요.`)
    process.exit(1)
  }
  console.log('대상 그룹:', newGroups.map((g) => `${g.name}(${g.kind})`).join(', '))

  const contents = await fetchAllPublished()
  console.log(`published 콘텐츠 ${contents.length}건 검사 중...`)

  const perGroupCount = Object.fromEntries(newGroups.map((g) => [g.name, 0]))
  const updates = []

  for (const c of contents) {
    const { groups: hitGroups, keywords: hitKeywords } = matchKeywordGroups(
      c.title,
      c.body_original ?? '',
      newGroups
    )
    if (hitGroups.length === 0) continue

    const existingGroups = c.matched_groups ?? []
    const existingKeywords = c.matched_keywords ?? []
    const nextGroups = [...new Set([...existingGroups, ...hitGroups])]
    const nextKeywords = [...new Set([...existingKeywords, ...hitKeywords])]

    for (const g of hitGroups) perGroupCount[g] += 1
    updates.push({ id: c.id, matched_groups: nextGroups, matched_keywords: nextKeywords })
  }

  console.log('\n=== 그룹별 신규 매칭 건수 ===')
  for (const [name, count] of Object.entries(perGroupCount)) console.log(`  ${name}: ${count}건`)
  console.log(`영향받는 콘텐츠 고유 건수: ${updates.length}건`)

  if (!APPLY) {
    console.log('\n--dry-run 모드(기본값) — DB에 아무것도 쓰지 않았습니다. 실제 반영하려면 --apply 플래그로 재실행하세요.')
    return
  }

  console.log('\n--apply 지정됨 — 실제 UPDATE 진행...')
  let done = 0
  const CONCURRENCY = 10
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const batch = updates.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map((u) =>
        supabase
          .from('contents')
          .update({ matched_groups: u.matched_groups, matched_keywords: u.matched_keywords })
          .eq('id', u.id)
      )
    )
    done += batch.length
    process.stdout.write(`\r  진행: ${done}/${updates.length}`)
  }
  console.log('\n완료.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
