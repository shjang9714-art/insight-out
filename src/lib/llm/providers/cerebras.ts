import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'cerebras',
  baseURL:      'https://api.cerebras.ai/v1',
  keysEnv:      'CEREBRAS_API_KEYS',
  defaultModel: 'gpt-oss-120b',
  modelEnv:     'CEREBRAS_MODEL',
})
