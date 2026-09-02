import 'server-only'

import { cache } from 'react'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { createClient } from '@/lib/supabase/server'
import {
  EMPTY_LENS_CONTEXT,
  loadLensContext,
  type LensContext,
} from '@/lib/lens-core'

export const getServerLensContext = cache(async (): Promise<LensContext> => {
  const user = await getCachedUser()
  if (!user) return EMPTY_LENS_CONTEXT

  const supabase = await createClient()
  return loadLensContext(supabase, user.id)
})
