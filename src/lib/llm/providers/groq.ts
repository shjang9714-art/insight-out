import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'groq',
  baseURL:      'https://api.groq.com/openai/v1',
  keysEnv:      'GROQ_API_KEYS',
  defaultModel: 'llama-4-scout-17b-16e-instruct',
  modelEnv:     'GROQ_MODEL',
})
