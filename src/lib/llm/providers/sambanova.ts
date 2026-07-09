import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'sambanova',
  baseURL:      'https://api.sambanova.ai/v1',
  keysEnv:      'SAMBANOVA_API_KEYS',
  defaultModel: 'Meta-Llama-3.3-70B-Instruct',
  modelEnv:     'SAMBANOVA_MODEL',
})
