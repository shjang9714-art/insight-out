# 지시서 46 — [#50] 모닝브리핑 TTS 합성 → Storage 적재 → audio_url 갱신

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 다음을 반드시 읽을 것:
> - `AGENTS.md` — 특히 Hard Rule #4·#8(`SUPABASE_SERVICE_ROLE_KEY` 서버 전용·커밋 금지), #5(`.env.example` 동반 갱신), §6.4(service_role 클라 패턴), §2/§18(새 의존성 추가 시 사유 명시).
> - `src/lib/translate/index.ts` — **이 지시서의 정본 미러 패턴**(기간 KST·사용량 조회·캡 체크·호출·`increment_*_usage` RPC 기록). TTS 도 동일 구조로.
> - `src/lib/supabase/admin.ts` — `createAdminClient()` (service_role).
> - `src/app/api/admin/crawl-now/route.ts` — admin 인증(`verifyAdmin`)·`runtime='nodejs'`·`force-dynamic` 라우트 패턴.
> - `supabase/2026-06-11-모닝브리핑-스키마.sql` — `briefings` 계약(`script`·`audio_url`·`voice`·`audio_duration_seconds`·`status`)·`briefings` Storage 버킷.
> - `supabase/2026-06-11-tts-사용량.sql` — `tts_usage` 테이블 + `increment_tts_usage(p_provider,p_period,p_chars)` RPC(service_role 전용). **이미 수희가 실행함.**
> - `src/components/dashboard/MorningBriefingPlayer.tsx` — 산출물 소비처(audio_url 있으면 재생, 없으면 스크립트만).
>
> 전제: 위 두 SQL(briefings·tts_usage) **실행 완료**. `briefings` Storage 버킷 존재(Public 권장). 미존재면 먼저 실행/생성 요청.
> 범위: **서버 전용 TTS 합성 모듈 + admin 트리거 API**. `briefings.script` 를 읽어 Google Cloud TTS(WaveNet)로 합성 → `briefings` 버킷 업로드 → `audio_url`·`voice`·`audio_duration_seconds` 갱신. **호출 전 월 사용량 하드캡 체크로 과금 원천 차단.** UI(어드민 재생성 버튼 #49)는 **범위 밖** — 단 이 API 를 그대로 호출하도록 설계.

---

## 배경·목표
- 데이터 계약상 **용주 트랙(#50·#52)** = `script` 읽어 TTS → 오디오 업로드 → `audio_url` 갱신. 플레이어(#51)는 이미 머지됐고 `audio_url` 이 채워지면 자동 재생된다.
- TTS = **Google Cloud TTS, WaveNet 보이스 `ko-KR-Wavenet-C`**(기본). 무료 400만 자/월. 예산 폭탄 방지가 최우선 — **합성 호출 전** `tts_usage` 합산이 앱 상한(`TTS_MONTHLY_CHAR_CAP`)을 넘으면 합성하지 않고 막는다.

## 파트 A — 환경변수·인증 (`.env.example` 동반 갱신 필수)
GCP 서비스계정 키는 JSON 이라 Vercel env 에 통째로 넣기 까다로움 → **base64 1줄**로 보관한다.

`.env.example` 에 "영문 번역" 블록 아래 새 블록 추가(서버 전용·`NEXT_PUBLIC_` 금지):
```
# ----- 모닝브리핑 TTS (Google Cloud Text-to-Speech, 서버 전용) -----
# 서비스계정 JSON 키 전체를 base64 로 1줄 인코딩한 값.
#   생성: base64 -i service-account.json | tr -d '\n'   (macOS)
# 절대 클라이언트 노출·커밋 금지. Vercel 은 Production/Preview/Development 스코프 모두 설정.
GCP_TTS_SA_KEY_BASE64=
# 한국어 WaveNet 보이스 (기본 ko-KR-Wavenet-C). 미설정 시 코드 기본값 사용.
GCP_TTS_VOICE=ko-KR-Wavenet-C
# 월(KST) 글자수 상한 — 무료 400만 자보다 보수적으로(예 3500000). 합산 초과 시 합성 차단.
TTS_MONTHLY_CHAR_CAP=3500000
```
- 코드에서 `GCP_TTS_SA_KEY_BASE64` 를 디코드 → `JSON.parse` → 서비스계정 `client_email`·`private_key` 로 인증.
- 셋 중 하나라도 없으면 합성 모듈은 **명확한 한국어 에러**(서버 로그 영문 원인)로 실패하고 `briefings.status` 는 건드리지 않음.

## 파트 B — 의존성 (사유 명시 필수, AGENTS §18)
- **권장**: `@google-cloud/text-to-speech` 추가. 사유: 서비스계정 인증·재시도·타입을 공식 클라가 처리, REST 직접 호출보다 견고. PR 설명에 "왜 이 라이브러리인지" 기재.
  - Vercel(serverless) 인증: `GOOGLE_APPLICATION_CREDENTIALS` 파일 경로 대신 **인라인 credentials** 주입:
    ```ts
    const sa = JSON.parse(Buffer.from(process.env.GCP_TTS_SA_KEY_BASE64!, 'base64').toString('utf8'))
    const client = new TextToSpeechClient({ credentials: { client_email: sa.client_email, private_key: sa.private_key }, projectId: sa.project_id })
    ```
- **대안(의존성 0)**: `google-auth-library` 로 액세스 토큰 발급 후 `texttospeech.googleapis.com/v1/text:synthesize` REST 직접 호출. 둘 중 택1, PR 에 선택 사유 1줄.

## 파트 C — 합성 모듈 `src/lib/tts/synthesize-briefing.ts` (`server-only`)
`translate/index.ts` 구조를 그대로 미러한다.
- 상단 `import 'server-only'`. `createAdminClient()` 사용.
- 기간: `getKstPeriod()` 동일 로직 재사용(`'YYYY-MM'`, KST). translate 의 것을 공용 유틸로 빼도 좋고, 중복 정의도 허용(작게 유지).
- 시그니처(예): `synthesizeBriefingAudio(briefingId: string): Promise<{ ok: true; audioUrl: string } | { ok: false; reason: string }>`
- 절차:
  1. `briefings` 에서 `id, script, voice, status` 조회. `script` 없거나 공백 → `{ ok:false, reason:'스크립트 없음' }`.
  2. **캡 체크(합성 전)**: `tts_usage` 에서 `provider='google'`·현재 period `chars` 조회 → `monthUsed + script.length > TTS_MONTHLY_CHAR_CAP` 이면 합성하지 않고 `{ ok:false, reason:'월 한도 초과' }`. (translate 의 `monthUsed + text.length > limit` 와 동일 사상.)
  3. 합성: voice = `briefing.voice || process.env.GCP_TTS_VOICE || 'ko-KR-Wavenet-C'`, `languageCode:'ko-KR'`, `audioConfig.audioEncoding:'MP3'`. 결과 = MP3 바이트.
  4. **업로드**: `admin.storage.from('briefings').upload(path, bytes, { contentType:'audio/mpeg', upsert:true })`.
     - 경로: `` `${briefing_date}/${briefingId}.mp3` `` 또는 `` `${briefingId}.mp3` `` (날짜 prefix 권장).
     - 버킷 Public 이면 `getPublicUrl(path).data.publicUrl` 을 `audio_url` 로. Private 이면 경로만 저장하고 플레이어가 서명 URL 발급(이번 범위 밖이면 Public 전제로 publicUrl 사용 — 스키마 주석도 Public 권장).
  5. **사용량 기록**: 합성 성공 직후에만 `admin.rpc('increment_tts_usage', { p_provider:'google', p_period:period, p_chars: script.length })`. 실패해도 오디오는 살리되 에러 로그(translate 의 패턴 동일).
  6. **briefings 갱신**: `audio_url`·`voice`(실제 사용 보이스)·`audio_duration_seconds`(아래) UPDATE. status 는 **바꾸지 않음**(승인은 #49 어드민 몫). 합성 실패 시 status 를 `'failed'` 로 둘지는 옵션 — 기본은 건드리지 말고 reason 만 반환.
- 로그: `console.log('[TTS] briefing=… chars=… month_used=…')` / 실패는 `console.error` 한국어 메시지 + 영문 원인.
- `audio_duration_seconds`: Google TTS 는 길이를 반환하지 않음. **MP3 파싱 없이 null 허용**(플레이어가 `loadedmetadata` 로 표시함). 정확도 원하면 LINEAR16(WAV)로 합성해 PCM 길이로 계산하는 방식을 주석으로만 남기고, 기본 구현은 MP3 + duration=null 로 둔다(간결 우선).

## 파트 D — admin 트리거 API `src/app/api/admin/briefings/[id]/tts/route.ts`
- `crawl-now/route.ts` 의 `verifyAdmin()`·`runtime='nodejs'`·`export const dynamic='force-dynamic'`·`maxDuration` 패턴을 따른다.
- `POST` — 비관리자 401/403. body 또는 `params.id` 로 briefingId 수신 → `synthesizeBriefingAudio(id)` 호출.
- 응답: 성공 `{ ok:true, audioUrl }`(200), 실패 `{ ok:false, reason }`(409 한도초과 / 400 스크립트없음 / 500 합성오류 등 reason 별 상태코드 매핑). 메시지는 한국어.
- 이 라우트가 #49 어드민 "오디오 생성/재생성" 버튼의 호출 대상이 된다(이번 범위에선 버튼 X, API 만).

## 파트 E — 스키마 정본 동기화
- `tts_usage` 테이블·`increment_tts_usage` RPC 는 이미 운영 DB 에 있으나 **`supabase/schema.sql` 단일 진실 파일에는 누락**일 수 있음(Hard Rule #6). 없으면 `translation_usage` 블록 바로 아래에 동일 형식으로 추가(테이블+RLS revoke/grant+RPC). briefings 도 `schema.sql` 에 없으면 함께 반영.
- 새 마이그레이션 SQL 은 만들지 않음(이미 실행됨). schema.sql 정합만 맞춘다.

## 완료 조건
- [ ] A `.env.example` 에 `GCP_TTS_SA_KEY_BASE64`·`GCP_TTS_VOICE`·`TTS_MONTHLY_CHAR_CAP` 추가, 서버 전용 주석. base64 디코드 인증 동작.
- [ ] B 의존성 택1 + PR 사유 명시.
- [ ] C `synthesize-briefing.ts`(`server-only`): script 조회 → **합성 전 캡 체크** → WaveNet MP3 합성 → `briefings` 버킷 업로드 → publicUrl → `increment_tts_usage` 기록 → briefings(audio_url·voice) 갱신. 실패 reason 분기.
- [ ] D admin API 라우트: verifyAdmin·nodejs·force-dynamic, reason 별 상태코드, 한국어 메시지.
- [ ] E `schema.sql` 에 tts_usage/briefings 정합(누락분만 반영). 새 마이그레이션 SQL 신설 X.
- [ ] 키 누락/script 없음/한도 초과 3개 경로에서 **합성 호출이 일어나지 않음**(과금 0) 을 코드로 보장.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`·SA 키가 클라이언트 번들/`NEXT_PUBLIC_` 에 새지 않음.
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과.

## 검증 메모(Opus 재현용)
- 캡 경계: `monthUsed + script.length` 가 cap 과 같을 때/초과할 때 분기 정확한지.
- 멱등: 같은 briefing 재합성 시 `upsert:true` 로 덮어쓰고 audio_url 동일/갱신.
- 실패 시 `tts_usage` 가 증가하지 않는지(성공 후에만 increment).
- service_role·SA 키가 `'use client'` 경로에서 import 되지 않는지 grep.

## 보고 양식
```
## 완료 보고 — 지시서 46 (#50) TTS 합성·적재
- 변경/신규 파일: <목록>
- A env: <3개 변수·base64 인증>
- B 의존성: <@google-cloud/text-to-speech | REST> + 사유
- C 합성: <캡 체크 전치·WaveNet·MP3·업로드·publicUrl·increment·briefings 갱신>
- D API: <라우트·verifyAdmin·reason 상태코드>
- E 스키마: <schema.sql 정합 반영 여부>
- 검증: tsc · build · lint(신규 0) · 캡경계/과금0 3경로 · 키 누출 grep
- 미해결: <있으면>
```
