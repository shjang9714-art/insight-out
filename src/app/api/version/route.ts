import { NextResponse } from 'next/server'

// 배포 검증용 공개 엔드포인트.
// 현재 배포된 커밋 SHA·브랜치·환경을 반환해, Vercel 대시보드 없이도
// "내가 머지한 커밋이 실제로 배포됐는지"를 curl 한 번으로 확인할 수 있게 함.
// 비밀값 없음(커밋 SHA 는 공개 저장소 정보) → 인증 불필요(middleware.ts publicPaths 포함).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'
  return NextResponse.json({
    commit: sha,
    shortCommit: sha.slice(0, 7),
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown',
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '',
    env: process.env.VERCEL_ENV ?? 'development',
    deployedAt: new Date().toISOString(),
  })
}
