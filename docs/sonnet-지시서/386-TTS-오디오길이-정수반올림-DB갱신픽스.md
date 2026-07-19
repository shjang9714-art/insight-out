# 지시서 386 — TTS 오디오 길이 정수 반올림 (briefings 갱신 500 픽스)

> 작성: 플래너(Opus) · 2026-07-18 · 범위: 버그픽스(1줄) · **SQL 0** · 선행: 375·378·379·381·385
> 협업 루프: 로컬(커밋X). 디렉터 위임 → 구현 → 검증 → "커밋".
> 번호: 386 (382~385 사용 중, 충돌 없음 확인)

---

## 0. 한 줄
`audio_duration_seconds`(DB **integer**)에 소수(195.3)를 넣어 실패하던 마지막 DB 갱신을 **정수 반올림**으로 고친다.

---

## 1. 현행 진단 (프로덕션 로그 + 코드 실측)

**프로덕션 로그(2026-07-18 23:19~23:21, briefing=dbee5e67…)** — 합성·업로드는 **전부 성공**:
```
[TTS] chars=1604 chunks=3 model=gemini-2.5-flash-preview-tts voice=Charon
[TTS] 청크 1/3 완료: 750자, 40091ms
[TTS] 청크 2/3 완료: 695자, 36072ms
[TTS] 청크 3/3 완료: 151자, 13236ms
[TTS] 전체 합성 완료: 청크 3개, 총 119401ms
[error] [TTS] briefings 갱신 실패: invalid input syntax for type integer: "195.3"
```
→ 버킷 문제(해결됨)·429(385로 해결됨)가 아니라, **마지막 `briefings` UPDATE에서 타입 불일치**.

**코드 사실** (`src/lib/tts/synthesize-briefing.ts`):
- 399행: `const durationSeconds = Math.round((pcmBuffer.length / (finalSampleRate * 1 * 2)) * 10) / 10`
  → **소수 1자리**로 반올림된다(예: `195.3`).
- 435행: `.update({ audio_url: audioUrl, voice, audio_duration_seconds: durationSeconds })`
- 스키마: `supabase/schema.sql:642` · `supabase/2026-06-11-모닝브리핑-스키마.sql:26`
  → **`audio_duration_seconds integer`**

→ Postgres가 `"195.3"`을 integer로 못 받아 `updateError` → `{ ok:false, reason:'DB 갱신 중 오류가 발생했습니다.' }` → 라우트 매핑에 없어 **500**.

**부작용(현 상태)**: 오디오 파일은 Storage에 이미 업로드됨(`upsert:true`), 사용량도 이미 누적됨(증가 RPC가 UPDATE보다 앞). 다만 `briefings.audio_url`이 비어 UI엔 "오디오 없음". → **픽스 후 "오디오 생성" 재실행하면 덮어쓰기로 정상화**(별도 정리 불필요).

---

## 2. DB / SQL
**없음.** (컬럼 타입을 numeric으로 바꾸는 마이그레이션 대신, 코드에서 정수로 반올림한다 — 재생 길이는 초 단위 정수로 충분하고 SQL 핸드오프가 필요 없다.)

---

## 3. 구현 (`src/lib/tts/synthesize-briefing.ts` 1줄)

435행:
```ts
// 변경 전
.update({ audio_url: audioUrl, voice, audio_duration_seconds: durationSeconds })
// 변경 후
.update({ audio_url: audioUrl, voice, audio_duration_seconds: Math.round(durationSeconds) })
```

> 399행의 `durationSeconds`(소수 1자리)는 **그대로 둔다** — 로그·향후 표시용 정밀도를 유지하고, DB write 시점에만 정수화한다.

---

## 4. 회귀 가드
1. **399행 계산식은 변경 금지.** WAV 헤더·샘플레이트·PCM 이어붙임 로직과 얽혀 있다.
2. `audio_url`·`voice` 필드, `status` 미변경, `.eq('id', briefingId)` 조건 그대로.
3. `increment_tts_usage`(UPDATE보다 앞), 업로드 `upsert:true`, 캡·verifyAdmin·385 페이싱 상수 모두 **무변경**.
4. 이 파일에서 **다른 줄을 건드리지 말 것.** diff는 1줄이어야 한다.

---

## 5. 검증
```bash
npx tsc --noEmit
npm run lint
npm run build

grep -n "audio_duration_seconds: Math.round(durationSeconds)" src/lib/tts/synthesize-briefing.ts  # 1
git diff --stat   # synthesize-briefing.ts 1 file, 1 insertion 1 deletion
```
- 배포 후 실측: 모닝브리핑 "오디오 생성" → **200**, 카드에 오디오 플레이어 표시·재생, `audio_duration_seconds`에 정수 저장, TTS 사용량 증가.

---

## 6. 후속 (범위 밖)
- 라우트가 `DB 갱신 중 오류`·`Storage 업로드 오류` 같은 사유를 **500 대신 502 + reason 노출**로 바꿔 UI에서 원인이 보이게 하기(이번 디버깅이 로그 없이는 불가능했던 이유).
- 사용량 RPC가 UPDATE 실패 시에도 누적되는 순서 문제(실패한 시도가 사용량을 먹음) 검토.

---

## 7. 라이브 체크리스트
- [ ] "오디오 생성" 200, 오디오 재생됨.
- [ ] 브리핑 카드에서 "오디오 없음"이 사라짐.
- [ ] 3청크 브리핑도 429 없이 완주(385 확인 겸).
