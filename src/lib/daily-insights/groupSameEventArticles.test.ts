// 지시서 20260827b — groupSameEventArticles 유닛 테스트.
// 실행: node --experimental-strip-types --test src/lib/daily-insights/groupSameEventArticles.test.ts
// (PR #192의 dedupeSourceArticles.test.ts 구조를 그대로 따름 — node:test, 새 의존성 없음)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupSameEventArticles, type GroupableArticle } from './groupSameEventArticles.ts'

test('§배경 실사례 — SK브로드밴드/서울국제여성영화제 기사 3건이 1그룹으로 묶인다', () => {
  const articles: GroupableArticle[] = [
    {
      content_id: 'c1',
      title: "[콘텐츠 콕] 서울국제여성영화제 4년째 후원 SK브로드밴드, B tv 특집관 21일 개막",
      url: 'https://a.com/1',
      source: '스포츠서울',
      published_at: '2026-08-20',
    },
    {
      content_id: 'c2',
      title: 'SK브로드밴드 B tv 여성영화제 특집관 3년째 여는 이유',
      url: 'https://b.com/2',
      source: '전자신문',
      published_at: '2026-08-20',
    },
    {
      content_id: 'c3',
      title: "SK브로드밴드, 서울국제여성영화제 상영작 'B tv 특집관' 운영",
      url: 'https://c.com/3',
      source: '헤럴드경제',
      published_at: '2026-08-20',
    },
  ]

  const groups = groupSameEventArticles(articles)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].others.length, 2)
})

test('★회사명 가드(최대 리스크, 회귀 테스트) — SK텔레콤 vs KT는 유사도가 높아도 절대 안 묶인다', () => {
  const articles: GroupableArticle[] = [
    {
      content_id: 'c1',
      title: 'SK텔레콤, AI 데이터센터 울산 착공',
      url: 'https://a.com/1',
      source: '조선일보',
      published_at: '2026-08-20',
    },
    {
      content_id: 'c2',
      title: 'KT, AI 데이터센터 울산 착공',
      url: 'https://b.com/2',
      source: '매일경제',
      published_at: '2026-08-20',
    },
  ]

  const groups = groupSameEventArticles(articles)
  assert.equal(groups.length, 2)
})

test('발행일이 3일 차이 나면 안 묶인다', () => {
  const articles: GroupableArticle[] = [
    {
      content_id: 'c1',
      title: 'SK브로드밴드, 서울국제여성영화제 상영작 B tv 특집관 운영',
      url: 'https://a.com/1',
      source: '스포츠서울',
      published_at: '2026-08-20',
    },
    {
      content_id: 'c2',
      title: 'SK브로드밴드 B tv 여성영화제 특집관 여는 이유',
      url: 'https://b.com/2',
      source: '전자신문',
      published_at: '2026-08-23',
    },
  ]

  const groups = groupSameEventArticles(articles)
  assert.equal(groups.length, 2)
})

test('한쪽 published_at이 null이면 안 묶인다(보수적)', () => {
  const articles: GroupableArticle[] = [
    {
      content_id: 'c1',
      title: 'SK브로드밴드, 서울국제여성영화제 상영작 B tv 특집관 운영',
      url: 'https://a.com/1',
      source: '스포츠서울',
      published_at: '2026-08-20',
    },
    {
      content_id: 'c2',
      title: 'SK브로드밴드 B tv 여성영화제 특집관 여는 이유',
      url: 'https://b.com/2',
      source: '전자신문',
      published_at: null,
    },
  ]

  const groups = groupSameEventArticles(articles)
  assert.equal(groups.length, 2)
})

test('회사 언급이 양쪽 다 없는 정책 기사끼리는 유사도만으로 묶인다', () => {
  const articles: GroupableArticle[] = [
    {
      content_id: 'c1',
      title: '정부 통신 요금제 개편안 국회 제출',
      url: 'https://a.com/1',
      source: '조선일보',
      published_at: '2026-08-20',
    },
    {
      content_id: 'c2',
      title: '정부 통신 요금제 개편안 국회 통과',
      url: 'https://b.com/2',
      source: '매일경제',
      published_at: '2026-08-20',
    },
  ]

  const groups = groupSameEventArticles(articles)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].others.length, 1)
})

test('대표 선정 — (미상) 매체보다 실매체명 있는 기사가 대표가 된다(배열 순서보다 우선)', () => {
  const articles: GroupableArticle[] = [
    {
      content_id: 'c1',
      title: 'SK브로드밴드, 서울국제여성영화제 상영작 B tv 특집관 운영',
      url: 'https://a.com/1',
      source: '(미상)',
      published_at: '2026-08-20',
    },
    {
      content_id: 'c2',
      title: 'SK브로드밴드 B tv 여성영화제 특집관 여는 이유',
      url: 'https://b.com/2',
      source: '전자신문',
      published_at: '2026-08-20',
    },
  ]

  const groups = groupSameEventArticles(articles)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].representative.content_id, 'c2')
  assert.equal(groups[0].others.length, 1)
  assert.equal(groups[0].others[0].content_id, 'c1')
})

test('빈 배열 / undefined / null → 빈 배열, throw 없음', () => {
  assert.deepEqual(groupSameEventArticles([]), [])
  assert.deepEqual(groupSameEventArticles(undefined), [])
  assert.deepEqual(groupSameEventArticles(null), [])
})

test('필드 누락(title/published_at 없음) → throw 없이 각자 단독 그룹으로 처리', () => {
  const articles: GroupableArticle[] = [
    { content_id: 'c1' },
    { content_id: 'c2', title: null, published_at: null },
  ]
  const groups = groupSameEventArticles(articles)
  assert.equal(groups.length, 2)
  groups.forEach((g) => assert.equal(g.others.length, 0))
})
