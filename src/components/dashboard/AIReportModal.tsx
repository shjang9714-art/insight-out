'use client'

import { useState } from 'react'
import { SERVICES, SELECTABLE_CONTENT, type AIReport } from './mock-data'

type ModalPhase = 'form' | 'loading' | 'result'

interface Props {
  mode: 'generate' | 'detail'
  report?: AIReport | null
  onGenerated?: (report: AIReport) => void
  onClose: () => void
}

const PERIODS = ['최근 1주일', '최근 1개월', '최근 3개월', '2026년 1분기', '2026년 상반기']

const LLM_OPTIONS = [
  { id: 'chatgpt', label: 'ChatGPT', desc: 'OpenAI GPT-4o', icon: '🟢' },
  { id: 'gemini', label: 'Gemini', desc: 'Google Gemini 1.5', icon: '🔵' },
  { id: 'claude', label: 'Claude', desc: 'Anthropic Claude 3.7', icon: '🟣' },
]

function buildMockReport(topic: string, service: string, period: string, llm: string, selectedIds: string[]): AIReport {
  const selectedItems = SELECTABLE_CONTENT.filter((c) => selectedIds.includes(c.id))
  return {
    id: Date.now().toString(),
    title: `${topic} 분석 보고서`,
    service,
    period,
    llm,
    date: new Date()
      .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\.\s*/g, '.')
      .replace(/\.$/, ''),
    summary: `${service} 영역에서 "${topic}"에 대한 ${period} 주요 동향을 분석했습니다. 시장 환경이 빠르게 변화하는 가운데, 경쟁사의 공격적인 행보와 기술 트렌드 변화가 맞물리며 새로운 기회와 위협이 동시에 존재합니다.`,
    insights: [
      `${topic} 관련 글로벌 투자 규모가 전년 대비 38% 증가하며 시장 성숙 단계 진입`,
      `${service} 부문 주요 경쟁사들이 신규 파트너십 체결을 통한 생태계 확장 전략 강화`,
      '국내 레퍼런스 확보 경쟁이 치열해지며 초기 고객 대상 공격적 할인 정책 확대',
      '규제 환경 변화로 보안·컴플라이언스 요건 강화, 관련 솔루션 수요 증가 예상',
    ],
    sources: selectedItems.length > 0
      ? selectedItems.map((item) => ({ title: item.title, source: item.source, date: '2026.05.24' }))
      : [
          { title: `${topic} 시장 동향 리포트 2026`, source: 'Gartner', date: '2026.05.20' },
          { title: `국내 ${service} 시장 현황 분석`, source: 'KRG Research', date: '2026.05.18' },
          { title: `${topic} 기술 혁신 사례 모음`, source: 'ZDNet Korea', date: '2026.05.15' },
        ],
  }
}

export default function AIReportModal({ mode, report, onGenerated, onClose }: Props) {
  const [phase, setPhase] = useState<ModalPhase>(mode === 'detail' ? 'result' : 'form')
  const [formStep, setFormStep] = useState(1)

  // Step 1
  const [topic, setTopic] = useState('')
  const [service, setService] = useState(SERVICES.find((s) => s.id !== 'all')?.label ?? '')
  const [period, setPeriod] = useState(PERIODS[1])

  // Step 2
  const [selectedContent, setSelectedContent] = useState<string[]>([])

  // Step 3
  const [selectedLlm, setSelectedLlm] = useState('claude')

  const [displayReport, setDisplayReport] = useState<AIReport | null>(report ?? null)

  const toggleContent = (id: string) => {
    setSelectedContent((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleGenerate = async () => {
    setPhase('loading')
    await new Promise((r) => setTimeout(r, 2000))
    const llmLabel = LLM_OPTIONS.find((l) => l.id === selectedLlm)?.label ?? selectedLlm
    const generated = buildMockReport(topic.trim(), service, period, llmLabel, selectedContent)
    setDisplayReport(generated)
    setPhase('result')
    onGenerated?.(generated)
  }

  const handleReset = () => {
    setPhase('form')
    setFormStep(1)
    setDisplayReport(null)
    setTopic('')
    setSelectedContent([])
    setSelectedLlm('claude')
  }

  const modalTitle =
    phase === 'form'
      ? `AI 보고서 생성 (${formStep}/3)`
      : phase === 'loading'
        ? 'AI 보고서 생성 중...'
        : (displayReport?.title ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-lg">🤖</span>
            <h2 className="truncate text-base font-semibold text-gray-900">{modalTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-100"
          >
            <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicator (form only) */}
        {phase === 'form' && (
          <div className="flex border-b border-gray-50 px-6 py-2 gap-2">
            {['주제 · 서비스 · 기간', '콘텐츠 선택', 'LLM 선택'].map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                  i + 1 < formStep ? 'bg-brand-600 text-white' :
                  i + 1 === formStep ? 'bg-brand-600 text-white' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {i + 1 < formStep ? '✓' : i + 1}
                </div>
                <span className={`text-xs ${i + 1 === formStep ? 'font-medium text-gray-800' : 'text-gray-400'}`}>
                  {label}
                </span>
                {i < 2 && <span className="text-gray-200">›</span>}
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">

          {/* ─── Step 1 ─── */}
          {phase === 'form' && formStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  주제 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="예: AICC 시장 동향, 경쟁사 제로 트러스트 전략"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">서비스</label>
                  <select
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    {SERVICES.filter((s) => s.id !== 'all').map((s) => (
                      <option key={s.id} value={s.label}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">기간</label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    {PERIODS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 2 ─── */}
          {phase === 'form' && formStep === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                보고서에 포함할 아티클을 선택하세요. <span className="text-brand-600 font-medium">{selectedContent.length}개 선택됨</span>
              </p>
              {SELECTABLE_CONTENT.map((item) => {
                const checked = selectedContent.includes(item.id)
                return (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                      checked ? 'border-brand-200 bg-brand-50' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleContent(item.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#E6007E] rounded"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug text-gray-800">{item.title}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{item.tag}</span>
                        <span className="text-[11px] text-gray-400">{item.source}</span>
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}

          {/* ─── Step 3 ─── */}
          {phase === 'form' && formStep === 3 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">보고서 생성에 사용할 AI 모델을 선택하세요. 실제 연동은 추후 지원될 예정입니다.</p>
              {LLM_OPTIONS.map((llm) => {
                const selected = selectedLlm === llm.id
                return (
                  <label
                    key={llm.id}
                    className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors ${
                      selected ? 'border-brand-200 bg-brand-50' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="llm"
                      value={llm.id}
                      checked={selected}
                      onChange={() => setSelectedLlm(llm.id)}
                      className="h-4 w-4 shrink-0 accent-[#E6007E]"
                    />
                    <span className="text-2xl">{llm.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{llm.label}</p>
                      <p className="text-xs text-gray-400">{llm.desc}</p>
                    </div>
                    {selected && (
                      <span className="ml-auto rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-medium text-white">선택됨</span>
                    )}
                  </label>
                )
              })}
            </div>
          )}

          {/* ─── Loading ─── */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-800">보고서를 생성하고 있습니다</p>
                <p className="mt-1 text-xs text-gray-400">
                  {LLM_OPTIONS.find((l) => l.id === selectedLlm)?.label}로 아티클을 분석하고 인사이트를 도출 중...
                </p>
              </div>
            </div>
          )}

          {/* ─── Result ─── */}
          {phase === 'result' && displayReport && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">
                  {displayReport.service}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                  {displayReport.period}
                </span>
                {displayReport.llm && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                    {displayReport.llm}
                  </span>
                )}
                <span className="text-xs text-gray-400">{displayReport.date}</span>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">요약</h3>
                <p className="text-sm leading-relaxed text-gray-700">{displayReport.summary}</p>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">핵심 인사이트</h3>
                <ul className="space-y-2.5">
                  {displayReport.insights.map((insight, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                        {i + 1}
                      </span>
                      <p className="text-sm leading-snug text-gray-700">{insight}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">출처 아티클</h3>
                <div className="space-y-2">
                  {displayReport.sources.map((src, i) => (
                    <div
                      key={i}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100">
                        <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug text-gray-800">{src.title}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="text-[11px] text-gray-500">{src.source}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-[11px] text-gray-400">{src.date}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          {phase === 'form' && (
            <>
              <button
                onClick={formStep === 1 ? onClose : () => setFormStep((s) => s - 1)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                {formStep === 1 ? '취소' : '이전'}
              </button>
              {formStep < 3 ? (
                <button
                  onClick={() => setFormStep((s) => s + 1)}
                  disabled={formStep === 1 && !topic.trim()}
                  className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  다음
                </button>
              ) : (
                <button
                  onClick={handleGenerate}
                  className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                >
                  보고서 생성
                </button>
              )}
            </>
          )}
          {phase === 'loading' && <div className="ml-auto" />}
          {phase === 'result' && (
            <>
              {mode === 'generate' && (
                <button
                  onClick={handleReset}
                  className="text-sm text-gray-500 transition-colors hover:text-gray-900"
                >
                  새 보고서 생성
                </button>
              )}
              <button
                onClick={onClose}
                className="ml-auto rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                닫기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
