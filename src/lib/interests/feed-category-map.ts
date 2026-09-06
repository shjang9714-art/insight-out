/** keyword_groups.kind → users.feed_categories 의 key (FEED_CATEGORIES) */
export const GROUP_KIND_TO_FEED_CATEGORY: Record<string, string> = {
  telecom_b2b:   'telecom',
  cybersecurity: 'security',
  mobility:      'mobility',
  aidc:          'aidc',
  aicc:          'aicc',
  ai_tech:       'ai',
  finance:       'finance',
  public_sector: 'public',
  major_group:   'enterprise-group',
  bigtech:       'global-bigtech',
  // 'startup' 은 대응 그룹이 없다 — 저장된 값이 있으면 그대로 살린다 (§3 합집합)
}
