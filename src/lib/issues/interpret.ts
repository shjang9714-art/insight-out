import type { IssueCard } from './activity'

export interface IssueInsight {
  why: string
  tone: 'risk' | 'positive' | 'neutral'
}

export function buildIssueInsight(card: IssueCard): IssueInsight {
  if (card.changeFlag === 'worsening') {
    return {
      tone: 'risk',
      why: `부정 논조가 빠르게 늘고 있어 주의가 필요합니다 (최근 부정 ${card.sentimentNeg}건).`,
    }
  }
  if (card.changeFlag === 'surge') {
    const delta = card.changePct === null ? '새로 부상' : `직전 주 대비 +${card.changePct}%`
    return {
      tone: 'risk',
      why: `최근 7일 ${card.recentCount}건으로 ${delta} — 빠르게 확산 중인 이슈입니다.`,
    }
  }
  if (card.prevCount === 0 && card.recentCount > 0) {
    return {
      tone: 'neutral',
      why: `이번 주 새로 등장한 이슈입니다 (최근 ${card.recentCount}건).`,
    }
  }
  if (card.sentimentPos > card.sentimentNeg && card.sentimentPos >= 3) {
    return {
      tone: 'positive',
      why: `최근 7일 ${card.recentCount}건, 긍정 논조가 우세합니다.`,
    }
  }
  return {
    tone: 'neutral',
    why: `최근 7일 ${card.recentCount}건으로 꾸준히 다뤄지고 있습니다.`,
  }
}

export function buildIssueRelevance(
  matched: boolean,
  activeLens: 'all' | 'boost' | 'only',
): string | null {
  if (!matched || activeLens === 'all') return null
  return '내 관심사와 연관된 이슈입니다.'
}
