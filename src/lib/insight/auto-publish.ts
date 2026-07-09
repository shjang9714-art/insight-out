import 'server-only'

// 자동발행 임계 — 보수적. 미달은 draft(사람 검토).
// 258 — 회사(scope='company') 카드는 build 단계 노출 우선으로 완화(근거 0인 환각 카드만 draft).
export const AUTO_PUBLISH = {
  insight: { minCitations: 2, minSources: 3 },
  company: { minCitations: 1, minSources: 1 },
  issue:   { minContents: 4 },
}

export function insightAutoPublish(validCitations: number, sourceCount: number): boolean {
  return validCitations >= AUTO_PUBLISH.insight.minCitations
      && sourceCount   >= AUTO_PUBLISH.insight.minSources
}

export function insightCompanyAutoPublish(validCitations: number, sourceCount: number): boolean {
  return validCitations >= AUTO_PUBLISH.company.minCitations
      && sourceCount   >= AUTO_PUBLISH.company.minSources
}

export function issueAutoPublish(contentCount: number): boolean {
  return contentCount >= AUTO_PUBLISH.issue.minContents
}
