# LLM 모델 라우팅·관리 설계 + 무료 발급처 (팀 공유용)

> 업데이트: 2026-06 · 무료 한도·모델은 수시 변동(가입 화면 우선).
> 선행: `docs/묶음B-LLM양질엔진-설계.md`(키 풀). 이 문서는 "용도별 라우팅 + 어드민 관리"로 확장한 설계.

## 0. 핵심 결론

- **"키 다 등록 + 용도별 라우팅"이 효율적**이다. 단 무조건 최고 모델에 다 보내면 귀한 무료 한도를 낭비 → **작업 가치에 맞춰 모델 티어 배정**.
- **하이브리드**: 용도(task)별 1순위 모델 지정 + 한도 소진/장애 시 **폴백**. = 성능(용도 맞춤) + 안정성(폴백) + 한도 효율.
- 이 모든 걸 **어드민에서 관리**(provider 키·on/off, 모델 카탈로그, 용도→모델 매핑) → DB 기반(코드 하드코딩 X).

## 1. 용도(task) → 모델 라우팅 (제안)

| 용도(task) | 특성 | 1순위 | 2순위/폴백 |
|---|---|---|---|
| **분류·태깅·시그널**(대량 배치, B3) | 고빈도·속도·저비용·JSON | Cerebras(1M토큰/일, 초고속) | Groq → Gemini Flash-Lite → OpenRouter |
| **한국어 요약** | 한국어 품질 중요 | Gemini 2.5 Flash | Mistral → Groq(Qwen3) |
| **전략 보고서**(AI보고서, 저빈도) | 추론·장문·품질 > 속도 | DeepSeek R1 / Qwen3-235B(Cerebras) | Gemini Flash → (추후 유료) |

- 분류는 **양 많고 가치 낮음** → 가장 빠르고 한도 큰 무료(Cerebras/Groq)에.
- 보고서는 **양 적고 가치 높음** → 강한 추론 모델에. 귀한 한도 아껴 씀.

## 2. 무료 발급처 × 제공 모델 × 적합 용도

| Provider | 주요 무료 모델(2026-06) | 강점 | 적합 용도 | 발급처 | OpenAI호환 |
|---|---|---|---|---|---|
| Google Gemini | 2.5 Flash / Flash-Lite (※2.0 종료 6/1, Pro 유료) | 한국어·균형·1M컨텍스트 | 요약, 분류 | https://aistudio.google.com/apikey | △(별도 REST) |
| Groq | Llama 4 Scout, Qwen3 32B, Llama 3.1 8B, DeepSeek R1 Distill | **초고속**(14,400req/일) | 분류(고속) | https://console.groq.com/keys | ✅ |
| Cerebras | Llama 4 Scout, Qwen3 32B/235B, Llama 3.1 70B/405B, GPT-OSS 120B, DeepSeek R1 | 초고속 **+ 1M토큰/일(대용량)** | 분류(대량), 보고서 | https://cloud.cerebras.ai | ✅ |
| OpenRouter | 회전 무료(Llama/Mistral/Gemma/DeepSeek) | 모델 다양·폴백 허브 | 범용 폴백 | https://openrouter.ai/keys | ✅ |
| **Mistral** | Large/Codestral/Pixtral (~1B토큰/월) | 한도 큼·EU·다용도 | 요약, 보고서 보조 | https://console.mistral.ai/api-keys | ✅ |
| **GitHub Models** | GPT·Llama·Phi·Mistral 등 45+ | **팀 확장 최易**(GitHub 계정) | 보조·실험 | https://github.com/marketplace/models (키=PAT) | ✅ |
| **Cloudflare Workers AI** | Llama/Qwen/Mistral 소형 | 일일 무료(1만 neurons) | 경량 분류 보조 | https://dash.cloudflare.com → AI | ✅ |
| Cohere | Command 계열 | 분류·RAG | 분류 보조 | https://dashboard.cohere.com/api-keys | △ |
| Hugging Face | 다양(서버리스) | 실험 | 실험 | https://huggingface.co/settings/tokens | △ |

체험 크레딧(만료형, 보조): NVIDIA NIM(build.nvidia.com), SambaNova(cloud.sambanova.ai), Together AI(api.together.ai).

## 3. 어드민 관리 구조 (구현 시 = SQL + UI 필요)

> ⚠️ "provider만 폴백 풀에 추가"는 SQL 불필요(기존 설계). 그러나 **아래 카탈로그·라우팅을 어드민에서 관리**하려면 신규 테이블 2개 + 어드민 화면이 필요(= 새 작업).

- `llm_models` (카탈로그): provider, model_id, label, 강점태그(speed/korean/reasoning), context, is_active. — "어느 발급처가 무슨 모델 제공"을 관리.
- `llm_task_routing`: task_type(classify/summarize/report), priority, provider, model_id, is_active. — 용도→모델 순서.
- 기존 `llm_settings`(provider on/off·한도), `llm_usage`(사용량) 재사용.
- 어드민 `/admin/llm`: provider 키 상태(llm-test)·on/off·한도, 모델 카탈로그 편집, 용도별 라우팅 편집.
- `llmComplete(task, system, user)` 로 시그니처 확장 → task 라우팅 표 따라 모델 선택 + 폴백.

## 4. 즉시 액션 (모델 ID 갱신 — 현행화)
- **Gemini 기본값 `gemini-2.0-flash` → `gemini-2.5-flash`**(또는 flash-lite). 2.0 은 6/1 종료. `GEMINI_MODEL` env 로 즉시 교체 가능, 코드 기본값도 갱신 권장.
- Groq `llama-3.3-70b-versatile` / Cerebras `llama-3.3-70b` → 현재 무료 라인업(Llama 4 Scout, Qwen3 32B 등)으로 확인·갱신. `*_MODEL` env override 가능.

## 5. 단계 제안
1. (지금) 현재 4 provider 키 Vercel 등록 + **모델 ID 현행화** → `/api/admin/llm-test` 통과.
2. provider 추가(Mistral·GitHub Models·Cloudflare): **코드 only**(팩토리 baseURL), SQL 불필요.
3. (원하면) **어드민 관리형 라우팅**: `llm_models`+`llm_task_routing` 테이블 + `/admin/llm` UI + llmComplete task 라우팅 = 별도 지시서(SQL+UI).
