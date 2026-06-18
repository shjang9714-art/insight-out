# 무료 LLM API 발급처 (팀 공유용)

> 업데이트: 2026-06 · 용도: Insight Out LLM 키 풀에 넣을 무료 API 키 발급. 발급 후 키를 David 에게 전달 → Vercel 환경변수(`*_API_KEYS`, provider별 콤마)로 등록.
> ⚠️ 무료 한도·정책은 수시로 바뀜. 가입 시 화면 안내를 우선.

## 이미 보유 (키 풀에 연결됨)

| Provider | 무료 유형 | 대략 한도(무료) | 발급처 |
|---|---|---|---|
| Google Gemini (AI Studio) | 영구 무료 | Flash 약 1,500 req/일 | https://aistudio.google.com/apikey |
| Groq | 영구 무료 | 약 14,400 req/일, 30K tok/분 | https://console.groq.com/keys |
| OpenRouter | 영구 무료(무료 모델) | 무료 모델 회전 제공 | https://openrouter.ai/keys |
| Cerebras | 영구 무료 | 약 1M tok/일, 30 req/분 | https://cloud.cerebras.ai |

## 추가 추천 — 영구 무료(카드 불필요), 통합 쉬움

| Provider | 무료 유형 | 대략 한도 | 발급처 | OpenAI 호환 |
|---|---|---|---|---|
| **Mistral** (La Plateforme) | 영구 무료(실험 티어) | 개발용 rate-limit | https://console.mistral.ai/api-keys | ✅ |
| **GitHub Models** | 영구 무료(모든 GitHub 계정) | req당 8K in/4K out, 45+ 모델 | https://github.com/marketplace/models · 키=PAT https://github.com/settings/personal-access-tokens | ✅ |
| **Cloudflare Workers AI** | 영구 무료(일일) | 10,000 neurons/일(≈Llama 8B 1만 스텝) | https://dash.cloudflare.com → AI · 토큰 https://dash.cloudflare.com/profile/api-tokens | ✅ |
| **Cohere** | 무료(rate-limited 키) | 평가용 제한 | https://dashboard.cohere.com/api-keys | 부분 |
| **Hugging Face** (Inference) | 영구 무료(서버리스) | rate-limited | https://huggingface.co/settings/tokens | 부분 |

> **팀 공유 팁**: GitHub Models 는 팀원 누구나 GitHub 계정만 있으면 즉시 발급(개인 PAT) → 팀 키 수 늘리기 가장 쉬움.

## 체험 크레딧(기간/한도 만료 — 보조용)

| Provider | 무료 유형 | 발급처 |
|---|---|---|
| NVIDIA NIM | 일회성 체험 크레딧(30~90일) | https://build.nvidia.com |
| SambaNova | $5 체험(카드 불필요, 만료) | https://cloud.sambanova.ai |
| Together AI | 체험 크레딧 | https://api.together.ai |
| Z.ai / Zhipu (GLM) | 무료 티어 | https://z.ai |

## 우리 코드 연동 메모
- 현재 키 풀 코드는 **OpenAI 호환 provider**(Groq·OpenRouter·Cerebras)를 한 팩토리로 처리 → **Mistral·GitHub Models·Cloudflare** 는 같은 팩토리에 baseURL/모델만 추가하면 됨(소폭 작업). Gemini 만 별도(REST).
- 발급한 키는 provider별로 모아 Vercel `*_API_KEYS` 에 콤마로 합쳐 등록.

---
출처: cheahjs/free-llm-api-resources, TokenMix, costbench, awesomeagents(2026) — 아래 채팅 Sources 참조.
