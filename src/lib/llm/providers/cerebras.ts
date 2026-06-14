import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'cerebras',
  baseURL:      'https://api.cerebras.ai/v1',
  keysEnv:      'CEREBRAS_API_KEYS',
  defaultModel: 'llama-3.3-70b',
  modelEnv:     'CEREBRAS_MODEL',
})
