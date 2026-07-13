import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = process.cwd()
const SRC_DIR = path.join(ROOT, 'src')
const DASHBOARD_APP_DIR = path.join(SRC_DIR, 'app', 'dashboard')

function walk(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(fullPath, predicate, acc)
    else if (predicate(fullPath)) acc.push(fullPath)
  }
  return acc
}

function routePathFromPage(pagePath) {
  const rel = path.relative(path.join(SRC_DIR, 'app'), path.dirname(pagePath))
  return '/' + rel.split(path.sep).join('/')
}

function routeSegments(routePath) {
  return routePath.split('/').filter(Boolean)
}

const pageFiles = walk(DASHBOARD_APP_DIR, (filePath) => path.basename(filePath) === 'page.tsx')
const dynamicRoutes = pageFiles
  .map(routePathFromPage)
  .filter((routePath) => routeSegments(routePath).some((segment) => /^\[[^/]+\]$/.test(segment)))
  .map((routePath) => ({
    routePath,
    segments: routeSegments(routePath).map((segment) => (/^\[[^/]+\]$/.test(segment) ? '*' : segment)),
  }))
const staticRoutes = new Set(
  pageFiles
    .map(routePathFromPage)
    .filter((routePath) => !routeSegments(routePath).some((segment) => /^\[[^/]+\]$/.test(segment)))
)

function expressionText(sourceFile, node) {
  return node.getText(sourceFile)
}

function patternFromTemplate(node) {
  let value = node.head.text
  for (const span of node.templateSpans) {
    value += '*'
    value += span.literal.text
  }
  return value
}

function isGetCardDetailHref(node) {
  if (!ts.isCallExpression(node)) return false
  const callee = node.expression
  if (ts.isIdentifier(callee)) return callee.text === 'getCardDetailHref'
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text === 'getCardDetailHref'
  return false
}

function collectConstHrefPatterns(sourceFile) {
  const patterns = new Map()

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const name = node.name.text
      const pattern = hrefPatternFromExpression(sourceFile, node.initializer, patterns)
      if (pattern) patterns.set(name, pattern)
      else if (/detailHref/i.test(name) && isGetCardDetailHref(node.initializer)) patterns.set(name, '<card-detail>')
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return patterns
}

function hrefPatternFromExpression(sourceFile, node, constPatterns) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) return patternFromTemplate(node)
  if (isGetCardDetailHref(node)) return '<card-detail>'
  if (ts.isIdentifier(node)) {
    if (constPatterns.has(node.text)) return constPatterns.get(node.text)
    if (/detailHref/i.test(node.text)) return '<card-detail>'
  }
  if (ts.isConditionalExpression(node)) {
    const whenTrue = hrefPatternFromExpression(sourceFile, node.whenTrue, constPatterns)
    const whenFalse = hrefPatternFromExpression(sourceFile, node.whenFalse, constPatterns)
    if (!whenTrue || !whenFalse) return null
    return [whenTrue, whenFalse].flat()
  }
  return null
}

function hrefPatternsFromAttribute(sourceFile, attr, constPatterns) {
  if (!attr?.initializer) return { readable: false, patterns: [] }
  const init = attr.initializer
  if (ts.isStringLiteral(init)) return { readable: true, patterns: [init.text] }
  if (ts.isJsxExpression(init) && init.expression) {
    const pattern = hrefPatternFromExpression(sourceFile, init.expression, constPatterns)
    if (!pattern) return { readable: false, patterns: [] }
    return { readable: true, patterns: Array.isArray(pattern) ? pattern : [pattern] }
  }
  return { readable: false, patterns: [] }
}

function attrByName(attributes, name) {
  return attributes.properties.find((attr) => ts.isJsxAttribute(attr) && attr.name.text === name)
}

function hasPrefetchFalse(prefetchAttr) {
  if (!prefetchAttr?.initializer) return false
  const init = prefetchAttr.initializer
  if (ts.isStringLiteral(init)) return init.text === 'false'
  return Boolean(
    ts.isJsxExpression(init) &&
    init.expression &&
    init.expression.kind === ts.SyntaxKind.FalseKeyword
  )
}

function stripQueryAndHash(href) {
  return href.split(/[?#]/, 1)[0]
}

function matchesDynamicRoute(hrefPattern) {
  if (hrefPattern === '<card-detail>') return true
  if (!hrefPattern.startsWith('/dashboard/')) return false

  const pathname = stripQueryAndHash(hrefPattern)
  if (!pathname.includes('*') && staticRoutes.has(pathname)) return false

  const hrefSegments = routeSegments(pathname)
  return dynamicRoutes.some(({ segments }) => {
    if (segments.length !== hrefSegments.length) return false
    return segments.every((segment, index) => (
      segment === '*' || hrefSegments[index] === '*' || hrefSegments[index] === segment
    ))
  })
}

function hasPrefetchOkComment(sourceText, sourceFile, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const lines = sourceText.split(/\r?\n/)
  return line > 0 && lines[line - 1].includes('prefetch-ok')
}

function checkFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const constPatterns = collectConstHrefPatterns(sourceFile)
  const findings = []

  function visit(node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      expressionText(sourceFile, node.tagName) === 'Link'
    ) {
      const hrefAttr = attrByName(node.attributes, 'href')
      const hrefInfo = hrefPatternsFromAttribute(sourceFile, hrefAttr, constPatterns)
      const prefetchAttr = attrByName(node.attributes, 'prefetch')
      const isExplicitlyHandled = hasPrefetchFalse(prefetchAttr) || hasPrefetchOkComment(sourceText, sourceFile, node)

      if (!hrefInfo.readable && !isExplicitlyHandled) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        findings.push({
          filePath,
          line: pos.line + 1,
          href: '<정적 판별 불가>',
          reason: 'href를 정적으로 판별할 수 없습니다',
        })
      }

      const pointsToDynamicDetail = hrefInfo.patterns.some((pattern) => matchesDynamicRoute(pattern))
      if (pointsToDynamicDetail && !isExplicitlyHandled) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        findings.push({
          filePath,
          line: pos.line + 1,
          href: hrefInfo.patterns.join(' | '),
          reason: '동적 dashboard 상세 라우트입니다',
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return findings
}

const files = walk(SRC_DIR, (filePath) => filePath.endsWith('.tsx'))
const findings = files.flatMap(checkFile)

if (findings.length > 0) {
  console.error('\n[check-prefetch] Link prefetch 정책 위반입니다.\n')
  for (const finding of findings) {
    const rel = path.relative(ROOT, finding.filePath)
    console.error(`- ${rel}:${finding.line} href=${finding.href} (${finding.reason})`)
  }
  console.error('\n목록성 상세 링크는 prefetch={false}, 고정 네비 예외는 Link 바로 위 줄에 {/* prefetch-ok: 사유 */}를 추가하세요.\n')
  process.exit(1)
}

console.log('[check-prefetch] 동적 dashboard 상세 Link 누락 0건')
