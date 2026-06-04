# Sonnet 지시서 10 — 리서치 리포트 PDF 뷰어 (#29)

> 작성: Opus(Cowork) · 대상: Claude Code(Sonnet) · Phase 2-B 용주 트랙 (#29 리서치 자료 뷰어)
> 선행: #15 상세페이지(`/dashboard/contents/[id]`) 존재, #15·#16 업로드/Storage(버킷 `reports`) 완료.
> ⚠️ 작업 전 `AGENTS.md`(Next.js 16, 서버컴포넌트, service_role 서버전용) + 현재 `src/app/dashboard/contents/[id]/page.tsx`(상세페이지)·`src/app/api/admin/upload/route.ts`(버킷·경로 규칙)·`src/lib/contents/full-body.ts`·`src/lib/supabase/admin.ts` 를 읽을 것.

## 0. 목표 (한 줄)
콘텐츠 상세 페이지에서, **업로드된 리포트(`file_path` 있음)** 면 PDF 미리보기(iframe)+다운로드를, **뉴스(`original_url`)** 면 기존 본문(#15)을 보여준다.

## 1. 데이터·저장 (이미 존재)
- 리포트는 `contents` 행에 `category`(가트너/KRG/웹인사이트), `file_path`(예: `가트너/2026/uuid.pdf`) 로 저장됨. 파일은 Supabase Storage **비공개 버킷 `reports`**.
- 비공개라 표시하려면 **서명 다운로드 URL** 필요 → 서버에서 service_role(`createAdminClient()`) 로 생성.

## 2. 할 일

### 2.1 `src/lib/contents/report-url.ts` (신규, 서버 전용)
- 상단 주석 "서버 전용 — service_role 사용".
- `getReportSignedUrl(filePath: string): Promise<string | null>`:
  ```ts
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from('reports').createSignedUrl(filePath, 60 * 30) // 30분
  return error ? null : (data?.signedUrl ?? null)
  ```
  try/catch 로 감싸 실패 시 null.

### 2.2 `src/app/dashboard/contents/[id]/page.tsx` (수정 — 분기 추가)
콘텐츠 조회 후, **`content.file_path` 유무로 분기**:
- **리포트(`file_path` 있음)**:
  - `const signedUrl = await getReportSignedUrl(content.file_path)`
  - `const isPdf = content.file_path.toLowerCase().endsWith('.pdf')`
  - 본문 영역 대신 **뷰어 블록** 렌더:
    - `signedUrl && isPdf` → `<iframe src={signedUrl} className="w-full h-[80vh] rounded-lg border border-gray-200" title={제목} />` + 아래 "새 탭에서 열기" 링크(signedUrl, target=_blank rel=noopener).
    - `signedUrl && !isPdf` → 파일 유형 안내(예: "이 파일은 미리보기를 지원하지 않습니다") + **"파일 다운로드"** 링크(signedUrl).
    - `!signedUrl` → "파일을 불러올 수 없습니다." 안내(폴백).
  - 리포트엔 `original_url`/풀본문 추출 **호출하지 않음**(ensureFullBody 스킵). `summary_ko` 가 있으면 뷰어 위에 요약으로 표시(선택).
- **뉴스(`file_path` 없음)**: 기존 #15 동작 그대로(`ensureFullBody` + 본문 텍스트 + 원문 링크).
- 제목·메타(출처/작성자/발행일)·서비스/키워드 태그는 양쪽 공통으로 유지.

### 2.3 건드리지 말 것
- 뉴스 분기(ensureFullBody)·태깅·크롤러 로직 변경 금지(리포트 분기만 추가).
- 업로드 라우트(`api/admin/upload`)·스키마 변경 불필요.

## 3. 주의
- `report-url.ts` 는 service_role 서버 전용 → 클라이언트 import 금지(AGENTS #8). 상세페이지는 서버 컴포넌트라 OK.
- 서명 URL은 만료(30분)되므로 매 조회 시 새로 생성(캐시 금지). 페이지는 이미 `dynamic='force-dynamic'`.
- PDF iframe 은 브라우저 기본 뷰어 사용(별도 라이브러리 불필요). PPTX/DOCX/XLSX 는 미리보기 없이 다운로드.
- 버킷명은 업로드 라우트 기준 **`reports`** 확인(다르면 거기에 맞춤).

## 4. 완료 조건
- [ ] `report-url.ts` `getReportSignedUrl` (서버 전용, 실패 시 null)
- [ ] 상세페이지: `file_path` 있으면 PDF iframe(또는 다운로드), 없으면 기존 뉴스 본문
- [ ] 리포트는 ensureFullBody 호출 안 함 / 뉴스 분기 동작 불변
- [ ] 제목·메타·태그 공통 표시, 서명 URL 실패 폴백
- [ ] service_role 서버 전용, `'use client'` 없음
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과

## 5. 검증 명령
```bash
npx tsc --noEmit && npm run build && npm run lint
```

## 6. 완료 보고 양식
```
## 완료 보고 — 지시서 10 리포트 PDF 뷰어(#29)
- 변경 파일: <경로 목록>
- 한 일: <3~5줄>
- 완료 조건 충족: [x] 항목별
- 검증 결과: tsc · build · lint
- 미해결·판단보류: <없으면 "없음">
```
