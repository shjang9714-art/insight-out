import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ADMIN_API_DIR = join(process.cwd(), 'src/app/api/admin')
const violations = []

async function collectRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectRouteFiles(path))
    else if (entry.name === 'route.ts') files.push(path)
  }

  return files
}

const checks = [
  ['로컬 관리자 인증 함수', /async\s+function\s+(?:verifyAdmin|requireAdmin)\b/],
  ['users.role 직접 조회', /\.from\(['"]users['"]\)\s*\.select\(['"]role['"]\)/s],
  ['인증 문구 리터럴', /['"](?:관리자 권한이 필요합니다\.?|로그인이 필요합니다\.?)['"]/],
]

for (const file of await collectRouteFiles(ADMIN_API_DIR)) {
  const source = await readFile(file, 'utf8')
  for (const [label, pattern] of checks) {
    if (pattern.test(source)) violations.push(`${file}: ${label}`)
  }
}

if (violations.length > 0) {
  console.error(`어드민 인증 단일화 위반 ${violations.length}건`)
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('어드민 인증 단일화 검사를 통과했습니다.')
