# LLM 키 점검 — Vercel 환경변수 (2026-06-21)

받는 사람: 수희(Vercel 접근자) · 보내는 사람: David(Opus 작성)
대상 프로젝트: insight-out (production)

---

## 1. 현상

`/api/admin/llm-test` 결과, **작동하는 LLM 프로바이더가 0개**라 논조·요약·관련도 분류가 전부 비어 있습니다(`test.ok=false`).

```
gemini     configured=false
groq       configured=false   ← 키 미인식
cerebras   configured=false
openrouter configured=true, 그러나 calls_used=0 (한 번도 성공 못 함)
```

→ ① Groq 키가 프로덕션에 안 잡혀 있고 ② 유일하게 잡힌 OpenRouter 키도 호출이 전부 실패.

## 2. 해야 할 일 (Vercel 대시보드)

Vercel → insight-out 프로젝트 → **Settings → Environment Variables** (Production):

1. **`GROQ_API_KEYS`** 추가/확인
   - 값: Groq API 키(여러 개면 **콤마로 구분**, 공백 없이). 예: `gsk_aaa,gsk_bbb`
   - 변수명 **정확히 `GROQ_API_KEYS`**(복수형 S, 오타 주의). Production 스코프 체크.
   - Groq 무료 키 발급: https://console.groq.com → API Keys.

2. **`OPENROUTER_API_KEYS`** 점검
   - 이미 등록돼 있으나 호출이 전부 실패 → **키가 무효이거나 만료/오타**일 수 있음. https://openrouter.ai/keys 에서 **키 재발급** 후 교체 권장.
   - OpenRouter 무료 모델은 **크레딧 없으면 하루 50요청 제한**(최근 정책상 최소 잔액 요구 케이스도 있음). 가능하면 소액($10) 충전 시 안정.
   - 값 형식: 콤마 구분, 공백 없이.

3. (선택) `GEMINI_API_KEYS` / `CEREBRAS_API_KEYS` 도 있으면 추가(폴백 다양성↑). 없으면 생략 가능.

4. **재배포** — 환경변수는 재배포해야 적용됩니다. Vercel → Deployments → 최신 빌드 **Redeploy**(또는 새 푸시).

## 3. 확인 방법 (재배포 후)

David가 어드민 로그인 상태에서 브라우저로 열기:
```
https://insight-out-app.vercel.app/api/admin/llm-test
```
- `providers` 에서 `groq.configured=true`, `openrouter.configured=true` 확인.
- **`test.ok=true`** 면 성공(= LLM 호출 살아남). `responded_provider`에 실제 응답 프로바이더 표시.
- 이후 `/admin/insights` "논조 분석" 재실행 → `analyzed > 0`.

## 4. 참고 (별도 코드 작업과 병행)

키와 별개로, 라우팅에 **폐기된 Groq 모델**(`llama-4-scout-17b-16e-instruct`, 2026-06-17 폐기)이 남아 있어 David 쪽에서 **현행 모델 `openai/gpt-oss-120b`로 교체**하는 코드/라우팅 작업(지시서 127)을 진행합니다. 키만 살아도 OpenRouter로는 돌지만, Groq까지 정상화하려면 둘 다 필요합니다.
