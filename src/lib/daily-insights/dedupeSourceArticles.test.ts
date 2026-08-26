// 지시서 20260827 — dedupeSourceArticles 유닛 테스트.
// 실행: node --experimental-strip-types --test src/lib/daily-insights/dedupeSourceArticles.test.ts
// (레포에 vitest/jest 등 테스트 러너가 없어 별도 의존성 추가 없이 Node 내장 test runner 사용)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dedupeSourceArticles, type DedupableSourceArticle } from './dedupeSourceArticles.ts'

test('같은 url, 다른 utm/www/trailing slash → 1건', () => {
  const result = dedupeSourceArticles([
    { content_id: null, url: 'https://a.com/x?utm_source=naver', title: 'A' },
    { content_id: null, url: 'https://www.a.com/x/?utm_source=daum&fbclid=1', title: 'A dup' },
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].title, 'A')
})

test('같은 content_id, 다른 url → 1건(먼저 나온 항목 유지)', () => {
  const result = dedupeSourceArticles([
    { content_id: 'c1', url: 'https://a.com/1', title: 'A' },
    { content_id: 'c1', url: 'https://b.com/2', title: 'B' },
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].title, 'A')
})

test('content_id는 다르지만 정규화 URL이 같음 → 1건(보완 규칙)', () => {
  const result = dedupeSourceArticles([
    { content_id: 'c1', url: 'https://a.com/x?utm_source=naver', title: 'A' },
    { content_id: 'c2', url: 'https://www.a.com/x/?utm_source=daum', title: 'A recrawled' },
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].content_id, 'c1')
})

test('제목만 같고 url·content_id 모두 없음 → 제목 폴백으로 1건', () => {
  const result = dedupeSourceArticles([
    { content_id: null, url: null, title: '삼성전자, 광주에 2400억 투자' },
    { content_id: null, url: null, title: '삼성전자, 광주에 2400억 투자' },
  ])
  assert.equal(result.length, 1)
})

test('url이 있으면 제목이 같아도 dedup 안 함(제목은 최후 폴백일 뿐, 유사도 판정 아님)', () => {
  const result = dedupeSourceArticles([
    { content_id: null, url: 'https://a.com/1', title: '같은 제목' },
    { content_id: null, url: 'https://b.com/2', title: '같은 제목' },
  ])
  assert.equal(result.length, 2)
})

test('매체 접미사(- 매체/| 매체)만 다른 제목 → 1건', () => {
  const result = dedupeSourceArticles([
    { content_id: null, url: null, title: 'KT, 소버린 AI 출시 - 조선일보' },
    { content_id: null, url: null, title: 'KT, 소버린 AI 출시 | 매일경제' },
  ])
  assert.equal(result.length, 1)
})

test('서로 다른 기사 → 그대로 유지', () => {
  const result = dedupeSourceArticles([
    { content_id: 'c1', url: 'https://a.com/1', title: 'A' },
    { content_id: 'c2', url: 'https://a.com/2', title: 'B' },
  ])
  assert.equal(result.length, 2)
})

test('빈 배열 / undefined / null → 빈 배열, throw 없음', () => {
  assert.deepEqual(dedupeSourceArticles([]), [])
  assert.deepEqual(dedupeSourceArticles(undefined), [])
  assert.deepEqual(dedupeSourceArticles(null), [])
})

test('필드 누락(content_id/url/title 전부 없음) → 판정 불가로 모두 유지, throw 없음', () => {
  const items: DedupableSourceArticle[] = [
    { content_id: null, url: null, title: null },
    { content_id: null, url: null, title: null },
  ]
  const result = dedupeSourceArticles(items)
  assert.equal(result.length, 2)
})

test('배열 순서 보존 — 중복 시 가장 먼저 나온 항목이 남는다', () => {
  const result = dedupeSourceArticles([
    { content_id: 'c1', url: 'https://a.com/1', title: 'First' },
    { content_id: 'c1', url: 'https://a.com/2', title: 'Second' },
    { content_id: 'c2', url: 'https://b.com/1', title: 'Third' },
  ])
  assert.deepEqual(
    result.map((a) => a.title),
    ['First', 'Third']
  )
})
