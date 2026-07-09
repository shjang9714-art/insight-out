import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'mistral',
  baseURL:      'https://api.mistral.ai/v1',
  keysEnv:      'MISTRAL_API_KEYS',
  defaultModel: 'mistral-small-latest',
  modelEnv:     'MISTRAL_MODEL',
})
