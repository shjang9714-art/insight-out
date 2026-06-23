export interface MergeJob {
  total: number
  done: number
  merged: number
  aliasAdded: number
  errors: string[]
  status: 'running' | 'done'
}

const store = new Map<string, MergeJob>()

export function createMergeJob(total: number): string {
  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  store.set(jobId, { total, done: 0, merged: 0, aliasAdded: 0, errors: [], status: 'running' })
  return jobId
}

export function getMergeJob(jobId: string): MergeJob | null {
  return store.get(jobId) ?? null
}

export function updateMergeJob(jobId: string, patch: Partial<MergeJob>) {
  const job = store.get(jobId)
  if (job) store.set(jobId, { ...job, ...patch })
}
