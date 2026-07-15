// L2 탭 렌더(핵심 인사이트/외부 리포트/지식보고서)는 DashboardHeader의 sticky L2 행으로
// 이동(372, src/lib/nav/taxonomy.tsx). 이 파일은 reports/page.tsx가 쓰는 뷰 id 타입만 남긴다.
export type ReportViewId = 'ai' | 'external' | 'knowledge'
