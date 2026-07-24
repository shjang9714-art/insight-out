# 지시서 420 — `/api/version` no-store (배포 확인 신뢰성)

> 작성: 플래너(Opus) · 2026-07-24 · 배포 확인 시 stale 캐시로 옛 SHA 반환(2회 혼란) 대응
> 근거: `src/app/api/version/route.ts` — `force-dynamic`은 있으나 응답에 Cache-Control 없어 CDN/중간계층 캐시 가능
> 협업 루프: 검증용 브랜치 `agent/420-version-no-store`(from `origin/main`) → 재현검증 → "커밋해" → 머지.
> 번호: 420 · git author David(yjhead@gmail.com) · **SQL 0.**

---

## 0. 한 줄
`/api/version` 응답에 **`Cache-Control: no-store`** 를 붙여, 배포 확인 시 항상 **현재 배포된 SHA** 가 나오게 한다(엣지·브라우저 캐시로 옛 SHA 반환 방지).

---

## 1. 착수 전 확인
- `src/app/api/version/route.ts`: `export const dynamic = 'force-dynamic'` 있음(빌드 시 정적화 방지) — **그러나 HTTP 응답에 캐시 헤더가 없어** Vercel CDN·프록시·WebFetch 가 응답을 캐시할 수 있다. 실제로 배포 후 조회 시 옛 SHA(414·416)가 반환된 적 2회.
- 공개 엔드포인트(middleware publicPaths 포함), 비밀값 없음.

## 2. 구현 (파일 1개)
`src/app/api/version/route.ts` — `NextResponse.json(...)` 에 **no-store 헤더 추가**.
```ts
export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'
  return NextResponse.json(
    {
      commit: sha,
      shortCommit: sha.slice(0, 7),
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown',
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '',
      env: process.env.VERCEL_ENV ?? 'development',
      deployedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        // Vercel 엣지 캐시도 확실히 우회
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      },
    },
  )
}
```
- `dynamic = 'force-dynamic'`·`runtime`·필드·공개 설정 **무변경.** 헤더만 추가.

## 3. 하지 말 것
- 반환 필드·구조 변경 금지(배포 확인 스크립트 호환).
- 다른 라우트·middleware 무수정.
- 인증 붙이지 않기(공개 유지).

## 4. 회귀 가드
1. `/api/version` 이 이전과 동일 JSON 반환.
2. 응답 헤더에 `Cache-Control: no-store` 존재.
3. 배포 직후 조회 시 **캐시버스터 없이도** 현재 SHA 반환(옛 SHA 아님).
   - ⚠️ 단, Vercel **배포 전파 지연**(프로모션 시간)은 캐시와 별개 — no-store 로도 안 없어짐. 배포 직후 1~2분은 여전히 기다려야 할 수 있음(옛 SHA 가 아니라 "이전 배포"가 잠깐 응답).
4. 공개 접근 유지(401 아님).

## 5. 검증
```bash
npx tsc --noEmit && npm run lint && npm run build
grep -n "no-store\|Cache-Control" src/app/api/version/route.ts
git diff --stat origin/main   # version/route.ts + 이 지시서
```
**라이브(배포 후)**
- [ ] `curl -sI https://insight-out-app.vercel.app/api/version | grep -i cache-control` → `no-store`
- [ ] 다음 배포 확인 시 `?cb=` 없이도 최신 SHA

## 6. 커밋
브랜치 `agent/420-version-no-store` → 커밋·푸시 → 재현검증 → "커밋해" → 머지.
스테이징: `src/app/api/version/route.ts` · 이 지시서
제외: 상시 목록(topic-covers NFD·council-bridge·성능-리전이동·골드샘플).
커밋: `fix: /api/version no-store 헤더로 배포 확인 stale 캐시 방지 (420)`
```

### 기록란 (구현자)
| 항목 | 결과 |
|---|---|
| Cache-Control no-store 추가 확인 | |
| 반환 필드 무변경 확인 | |

