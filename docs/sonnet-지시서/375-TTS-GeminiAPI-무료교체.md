# 지시서 375 — 브리핑 TTS를 Google Cloud TTS → Gemini API TTS(무료 티어)로 교체

> 대상: 구현 에이전트 · 관리자 전용 · **신규 SQL 없음** · 선행: 기존 TTS 파이프라인
> ⚠️ 읽을 것: `src/lib/tts/synthesize-briefing.ts`(현재 GCP `@google-cloud/text-to-speech` 사용·`GCP_TTS_SA_KEY_BASE64`·voice·char cap·Storage 업로드·`increment_tts_usage`) · `src/app/api/admin/briefings/[id]/tts/route.ts` · `src/lib/llm/providers/gemini.ts`(`GEMINI_API_KEYS`·`GEMINI_MODEL` 기존 패턴) · `AGENTS.md`
> ⚠️ **모델명·엔드포인트·응답형식은 반드시 현재 Gemini API 문서(ai.google.dev)로 확인**하고 구현할 것 — 아래는 설계 기준값이며 실제 계약과 어긋나면 문서 기준으로 맞춘다.

## 배경 (David)
현재 TTS는 **Google Cloud TTS**라 GCP 서비스계정 + **결제 계정 연결이 필수**. David는 **결제 연동 없이 무료로** 쓰고 싶어함 → **Gemini API TTS 무료 티어(API 키만, 결제 불필요)** 로 교체한다. (무료 티어는 rate limit 있음 — 브리핑은 빈도 낮아 적합, 기존 월 상한 가드 유지.)

## 작업 — `synthesize-briefing.ts` 합성부만 교체(나머지 파이프라인 유지)

### 1. 키·모델 env
- API 키: **`GEMINI_API_KEY`** 우선, 없으면 `GEMINI_API_KEYS`(기존 복수)의 첫 키 폴백. 없으면 명확한 에러.
- 모델: **`GEMINI_TTS_MODEL`**(예 기본값 `gemini-2.5-flash-preview-tts` — ⚠️**현재 문서에서 유효 모델명 확인** 후 확정. `gemini-3.1-flash-tts` 계열도 후보).

### 2. Gemini TTS 호출(합성)
- 엔드포인트(문서 확인): `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={KEY}`
- 요청 바디(개념):
  ```json
  { "contents":[{"parts":[{"text": "<script>"}]}],
    "generationConfig": { "responseModalities":["AUDIO"],
      "speechConfig": { "voiceConfig": { "prebuiltVoiceConfig": { "voiceName": "<voice>" } } } } }
  ```
- **voice**: Gemini는 GCP의 `ko-KR-Wavenet-C`가 아니라 **prebuilt voice 이름**(예 `Kore`·`Puck` 등, 다국어=한국어 지원). `briefing.voice`가 Gemini 보이스면 사용, 아니면 `GEMINI_TTS_VOICE`(기본 한 개) 매핑. GCP 보이스명은 Gemini 보이스로 **매핑 테이블**로 변환.
- 응답: `candidates[0].content.parts[0].inlineData.data`(**base64 PCM**, mime 예 `audio/L16;rate=24000`).

### 3. 오디오 포맷 — PCM → WAV 래핑 (중요)
- Gemini는 **raw PCM(16-bit LE, 24kHz mono 기준 — mime의 rate 확인)** 을 준다. 브라우저 `<audio>`는 raw PCM 재생 불가 → **WAV 헤더(RIFF/fmt/data)를 붙여** `.wav`로 만든다(샘플레이트는 응답 mime에서 파싱).
- Storage 업로드: 경로 `${briefing_date}/${briefingId}.wav`, `contentType: 'audio/wav'`(기존 `.mp3`/`audio/mpeg`에서 변경). `audio_duration_seconds`는 PCM 길이/샘플레이트로 **정확히 계산 가능**(선택: 채워도 좋음).

### 4. 유지 항목(회귀 금지)
- **월 문자 상한**(`TTS_MONTHLY_CHAR_CAP`) 가드 그대로. `increment_tts_usage`는 **`p_provider: 'gemini'`** 로 기록.
- `briefings.audio_url`·`voice` 갱신, status 미변경, 에러 시 graceful reason 반환.
- `stripLlmArtifacts` 스크립트 전처리 유지.
- GCP 코드(`@google-cloud/text-to-speech`·`GCP_TTS_SA_KEY_BASE64`)는 제거 또는 미사용(교체가 목적).

## 회귀 / 주의
- 무료 티어 **rate limit/일일 한도** 초과 시 명확한 에러 메시지(429 처리). 대량 재생성 자제.
- 키 서버 전용(노출 금지). 관리자 전용 경로 유지.
- **모델·엔드포인트·voice명은 현재 ai.google.dev 문서로 확정**(추정 금지). 응답 구조가 다르면 문서 기준.
- 검증: `tsc`·ESLint·`check-prefetch`·`build` + (키 설정 후 dev)브리핑 1건 TTS → wav 생성·Storage 업로드·플레이어 재생·사용량 기록. 완료보고에 커밋 해시 + 사용한 실제 모델명 명기.

## 배포 게이트
⚠️ main 머지·배포 금지. **전용 worktree**(`git worktree add /private/tmp/insight-out-375 -b agent/375-gemini-tts origin/main`)에서 작업 → push+PR, 브랜치명 회신 → Opus 검증 후 머지.

## 쪼개기
① Gemini 호출+PCM→WAV / ② voice 매핑·사용량·env 정리. 2커밋.
