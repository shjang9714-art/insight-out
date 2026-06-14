import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'groq',
  baseURL:      'https://api.groq.com/openai/v1',
  keysEnv:      'GROQ_API_KEYS',
  defaultModel: 'llama-3.3-70b-versatile',
  modelEnv:     'GROQ_MODEL',
})
