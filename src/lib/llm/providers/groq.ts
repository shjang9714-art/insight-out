import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'groq',
  baseURL:      'https://api.groq.com/openai/v1',
  keysEnv:      'GROQ_API_KEYS',
  defaultModel: 'openai/gpt-oss-120b',
  modelEnv:     'GROQ_MODEL',
})
