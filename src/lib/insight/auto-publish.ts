import 'server-only'

// 자동발행 임계 — 보수적. 미달은 draft(사람 검토).
export const AUTO_PUBLISH = {
  insight: { minCitations: 2, minSources: 3 },
  issue:   { minContents: 4 },
}

export function insightAutoPublish(validCitations: number, sourceCount: number): boolean {
  return validCitations >= AUTO_PUBLISH.insight.minCitations
      && sourceCount   >= AUTO_PUBLISH.insight.minSources
}

export function issueAutoPublish(contentCount: number): boolean {
  return contentCount >= AUTO_PUBLISH.issue.minContents
}
