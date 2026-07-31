import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'openrouter',
  baseURL:      'https://openrouter.ai/api/v1',
  keysEnv:      'OPENROUTER_API_KEYS',
  // 무료 모델 자동 라우터라 응답 모델은 고정되지 않는다. 구조화 출력 task의 명시
  // 라우팅에는 쓰지 말고, 은퇴가 반복되는 개별 `:free` 슬러그를 다시 박지 않는다.
  defaultModel: 'openrouter/free',
  modelEnv:     'OPENROUTER_MODEL',
})
