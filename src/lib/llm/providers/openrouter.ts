import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'openrouter',
  baseURL:      'https://openrouter.ai/api/v1',
  keysEnv:      'OPENROUTER_API_KEYS',
  defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
  modelEnv:     'OPENROUTER_MODEL',
})
