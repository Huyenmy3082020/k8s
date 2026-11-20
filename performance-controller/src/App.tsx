import React, { useEffect, useRef, useState } from 'react'
import {
  createTest,
  listTests,
  stopTest,
  deleteTest,
  type CreateTestPayload,
  type TestRun,
  type TestType,
  type Strategy,
  STRATEGIES,
} from './api.ts'

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  running: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  completed: 'bg-green-500/20 text-green-300 border border-green-500/30',
  failed: 'bg-red-500/20 text-red-300 border border-red-500/30',
  stopped: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
}

const DEFAULT_FORM: CreateTestPayload = {
  productId: 1,
  testType: 'concurrent',
  strategy: 'no-lock',
  targetUrl: 'http://localhost:3000/orders/buy',
  vus: 200,
  iterations: 1000,
  maxDuration: '30s',
  initialStock: 50,
}

function fmt(n: number | null | undefined, unit = '') {
  if (n == null) return '—'
  return `${Number(n).toFixed(2)}${unit}`
}

export default function App() {
  const [form, setForm] = useState<CreateTestPayload>(DEFAULT_FORM)
  const [runs, setRuns] = useState<TestRun[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchRuns = async () => {
    try {
      const res = await listTests({ limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' })
      setRuns(res.data)
    } catch {
      // silent
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchRuns().finally(() => setLoading(false))

    pollRef.current = setInterval(fetchRuns, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      const payload: CreateTestPayload = {
        ...form,
        initialStock: form.initialStock != null && form.initialStock !== ('' as unknown as number)
          ? Number(form.initialStock)
          : undefined,
      }
      const run = await createTest(payload)
      setSuccess(`✅ Đã tạo test run: ${run.id.slice(0, 8)}…`)
      await fetchRuns()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg) || 'Lỗi không xác định')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStop = async (id: string) => {
    try {
      const res = await stopTest(id)
      setSuccess(res.message)
      await fetchRuns()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Không thể dừng test')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa test run này?')) return
    try {
      const res = await deleteTest(id)
      setSuccess(res.message)
      await fetchRuns()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Không thể xóa test')
    }
  }

  const activeRun = runs.find(r => r.status === 'running' || r.status === 'pending')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-violet-500 animate-pulse" />
          <h1 className="text-2xl font-bold text-white">Performance Controller</h1>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-500/15 border border-red-500/40 text-red-300 rounded-lg px-4 py-3 text-sm flex justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} className="ml-4 hover:text-white">✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-500/15 border border-green-500/40 text-green-300 rounded-lg px-4 py-3 text-sm flex justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-4 hover:text-white">✕</button>
          </div>
        )}

        {/* Active run banner */}
        {activeRun && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="text-sm">
              <span className="text-blue-300 font-medium">Đang chạy: </span>
              <span className="text-slate-300 font-mono text-xs">{activeRun.id}</span>
              <span className={`ml-3 text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[activeRun.status]}`}>
                {activeRun.status}
              </span>
            </div>
            <button
              onClick={() => handleStop(activeRun.id)}
              className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
            >
              ⏹ Dừng
            </button>
          </div>
        )}

        {/* Create Test Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-5">Tạo Test Mới</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Product ID</span>
                <input
                  type="number" name="productId" min={1}
                  value={form.productId} onChange={handleChange} required
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Test Type</span>
                <select
                  name="testType" value={form.testType} onChange={handleChange}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                >
                  {(['concurrent', 'stress', 'spike', 'load'] as TestType[]).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Chiến lược (Strategy)</span>
                <select
                  name="strategy" value={form.strategy} onChange={handleChange}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                >
                  {STRATEGIES.map(st => (
                    <option key={st.key} value={st.key as Strategy}>
                      {st.correct ? '✅' : '❌'} {st.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Target URL</span>
                <input
                  type="text" name="targetUrl" value={form.targetUrl} onChange={handleChange} required
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400 uppercase tracking-wide">VUs (virtual users)</span>
                <input
                  type="number" name="vus" min={1} max={1000}
                  value={form.vus} onChange={handleChange} required
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Iterations</span>
                <input
                  type="number" name="iterations" min={1} max={50000}
                  value={form.iterations} onChange={handleChange} required
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Max Duration (e.g. 30s, 2m)</span>
                <input
                  type="text" name="maxDuration" value={form.maxDuration} onChange={handleChange}
                  pattern="^\d+[smh]$" title="Số + s/m/h, ví dụ: 30s, 2m, 1h" required
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Initial Stock (tùy chọn)</span>
                <input
                  type="number" name="initialStock" min={0}
                  value={form.initialStock ?? ''} onChange={handleChange}
                  placeholder="Không đổi"
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
                />
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit" disabled={submitting || !!activeRun}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
              >
                {submitting ? 'Đang tạo…' : '▶ Chạy Test'}
              </button>
            </div>
          </form>
        </div>

        {/* Recent Runs */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">Lịch Sử Gần Đây</h2>
            <button onClick={fetchRuns} className="text-xs text-slate-400 hover:text-white transition-colors">
              🔄 Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-slate-500 text-sm text-center py-8">Đang tải…</p>
          ) : runs.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">Chưa có test run nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-800">
                    <th className="text-left pb-3 pr-4">ID</th>
                    <th className="text-left pb-3 pr-4">Strategy</th>
                    <th className="text-left pb-3 pr-4">Verdict</th>
                    <th className="text-left pb-3 pr-4">VUs/Iter</th>
                    <th className="text-left pb-3 pr-4">Status</th>
                    <th className="text-right pb-3 pr-4">Success%</th>
                    <th className="text-right pb-3 pr-4">Avg ms</th>
                    <th className="text-right pb-3 pr-4">RPS</th>
                    <th className="text-right pb-3">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {runs.map(run => (
                    <tr key={run.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                        {run.id.slice(0, 8)}…
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">{run.strategy}</td>
                      <td className="py-3 pr-4">
                        {run.verdict
                          ? <span className={`text-xs px-2 py-0.5 rounded-full border ${run.verdict === 'PASS' ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'}`}>{run.verdict}</span>
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-slate-400">
                        {run.vus} / {run.iterations}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[run.status] ?? ''}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {run.successRate != null
                          ? <span className={Number(run.successRate) >= 95 ? 'text-green-400' : 'text-red-400'}>
                              {fmt(run.successRate)}%
                            </span>
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right text-slate-300">{fmt(run.avgResponseTime)}</td>
                      <td className="py-3 pr-4 text-right text-slate-300">{fmt(run.requestsPerSecond)}</td>
                      <td className="py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {(run.status === 'running' || run.status === 'pending') && (
                            <button
                              onClick={() => handleStop(run.id)}
                              className="text-xs bg-red-600/20 hover:bg-red-600/40 text-red-300 px-2.5 py-1 rounded transition-colors"
                            >
                              ⏹ Stop
                            </button>
                          )}
                          {run.status !== 'running' && run.status !== 'pending' && (
                            <button
                              onClick={() => handleDelete(run.id)}
                              className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1 rounded transition-colors"
                            >
                              🗑 Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
