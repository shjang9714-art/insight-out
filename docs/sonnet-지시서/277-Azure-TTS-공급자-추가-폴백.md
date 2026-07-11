# 지시서 277 — Azure TTS 공급자 추가 (다공급자 + 폴백)

> David 요청: Azure TTS도 구현. 현행 Google Cloud TTS 단일 → **Google + Azure 다공급자**로, 공급자 선택(env) + **실패/한도초과 시 자동 폴백**. 무료 LLM 다공급자 패턴과 동일 사상. Azure는 REST 호출이라 **새 npm 의존성 불필요**.

대상: `src/lib/tts/synthesize-briefing.ts` 리팩터(+ 필요 시 작은 헬퍼 분리). SQL 원칙적으로 없음(아래 §5 확인). 무료 티어: Azure Neural 50만 자/월.

---

## 1. 공급자 추상화
`synthesizeBriefingAudio` 내부의 "합성" 단계를 공급자별 함수로 분리:
- `synthesizeGoogle(script, voice): Promise<Uint8Array>` — 현행 로직 그대로(`@google-cloud/text-to-speech`, MP3).
- `synthesizeAzure(script, voice): Promise<Uint8Array>` — 신규(아래 §2).
- 공통: 반환은 MP3 바이트. 실패 시 throw.

## 2. Azure 구현 (REST, 의존성 없음)
- 엔드포인트: `https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
- 헤더: `Ocp-Apim-Subscription-Key: {AZURE_SPEECH_KEY}`, `Content-Type: application/ssml+xml`, `X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3`, `User-Agent: insight-out`.
- 바디(SSML, 한국어):
  ```xml
  <speak version="1.0" xml:lang="ko-KR"><voice name="{voice}">{escapeXml(script)}</voice></speak>
  ```
  - script 는 **XML 이스케이프**(`& < > " '`).
- voice 기본: `AZURE_TTS_VOICE` 또는 `ko-KR-SunHiNeural`(여성) / 대안 `ko-KR-InJoonNeural`(남성).
- 응답 바디(arrayBuffer) → Uint8Array. 비200이면 상태·본문 로깅 후 throw.

## 3. 공급자 선택 + 폴백
- 1차 공급자: `TTS_PROVIDER`(`google`|`azure`, 기본 `google` — 현행 유지). David가 Azure 우선하려면 `azure`로 설정.
- 순서: [1차, 2차(나머지)]. 각 공급자에 대해:
  1. **해당 공급자 월 한도 체크**(`tts_usage` provider별 — 아래 캡).
  2. 키 미설정/초기화 실패/한도초과면 **다음 공급자로 폴백**.
  3. 합성 성공 시 그 공급자로 확정(사용량 기록 provider = 사용한 공급자).
- 둘 다 불가면 기존처럼 `{ ok:false, reason }`(사유에 공급자별 실패 요약).
- 캡: Google `TTS_MONTHLY_CHAR_CAP`(기존, 기본 900k). Azure `AZURE_TTS_MONTHLY_CHAR_CAP`(기본 450k — 무료 50만 보수적).

## 4. voice 정합(공급자별 형식 상이)
- Google: `ko-KR-Wavenet-C` 류 / Azure: `ko-KR-...Neural` 류.
- 규칙: `briefing.voice` 가 사용 공급자 형식과 맞으면 사용, 아니면 공급자 기본값(`GCP_TTS_VOICE` / `AZURE_TTS_VOICE`). 폴백으로 공급자가 바뀌면 그 공급자 기본 voice 사용(엉뚱한 voice 이름으로 실패 방지).
- 기록: `briefings.voice` 에는 실제 사용한 voice 저장(기존 동작 유지).

## 5. 사용량/스토리지/DB (기존 재사용)
- `tts_usage` 는 이미 `provider` 키 → `increment_tts_usage(p_provider, p_period, p_chars)` 를 **사용한 공급자**로 호출. 한도 체크도 provider별 조회.
- Storage 업로드·`briefings.audio_url` 갱신은 현행과 동일.
- ⚠ **확인**: `tts_usage.provider` 에 `'google'`만 허용하는 CHECK 제약이 있으면 `'azure'` insert 가 막힌다. 있으면 작은 SQL 핸드오프로 제약 완화(`provider in ('google','azure')`) — Sonnet이 스키마 확인 후 필요하면 보고(내가 SQL 발행).

## 6. 회귀 가드
- `TTS_PROVIDER` 미설정 시 **현행과 동일**(google 우선, 기존 캡/보이스).
- Azure 키 미설정: azure 폴백 시도 시 스킵(초기화 실패 → 다음 공급자). 크래시 금지.
- 성공 경로·스토리지·audio_url 갱신 불변.
- 폴백으로 공급자 바뀌어도 사용량은 실제 공급자에 기록.

## 7. 검증 (Sonnet)
- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- (키 있으면) `TTS_PROVIDER=azure` 로 브리핑 합성 → Azure MP3 생성·업로드·`tts_usage(provider='azure')` 증가 확인.
- `TTS_PROVIDER=google`(또는 미설정) → 현행과 동일.
- 1차 한도초과/키없음 → 2차로 폴백 확인.
- 커밋: `feat: Azure TTS 공급자 추가 + 다공급자 폴백 (지시서 277)`.

## 8. David — Vercel 환경변수 (코드 밖)
- `AZURE_SPEECH_KEY` — Azure Portal → Speech 리소스 키.
- `AZURE_SPEECH_REGION` — 리소스 리전(예: `koreacentral`).
- `AZURE_TTS_VOICE`(선택, 기본 `ko-KR-SunHiNeural`).
- `AZURE_TTS_MONTHLY_CHAR_CAP`(선택, 기본 450000).
- `TTS_PROVIDER`(선택, `azure`로 두면 Azure 우선).
- Azure 리소스 생성: Portal → "Speech service"(무료 F0 티어) 생성 → 키·리전 확보.

SQL 원칙 없음(§5 제약 있을 때만 소량). 이 지시서는 Azure TTS 공급자 + 폴백.
