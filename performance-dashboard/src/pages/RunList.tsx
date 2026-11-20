import { useEffect, useRef, useState } from 'react'
import { listTests, type TestRun, type TestStatus } from '../api.ts'
import { VerdictBadge } from '../components/VerdictBadge.tsx'
import { StatusBadge } from '../components/StatusBadge.tsx'

interface Props {
  onSelect: (id: string) => void
  onCompare: (ids: [string, string]) => void
}

function fmt(n: number | null | undefined, unit = '') {
  if (n == null) return '—'
  return `${Number(n).toFixed(2)}${unit}`
}

export function RunList({ onSelect, onCompare }: Props) {
  const [runs, setRuns] = useState<TestRun[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<TestStatus | ''>('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const limit = 15

  const fetchRuns = async (pg = page) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = {
        page: pg, limit, sortBy: 'createdAt', sortOrder: 'DESC',
      }
      if (statusFilter) params.status = statusFilter
      const res = await listTests(params)
      setRuns(res.data)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRuns(1)
    setPage(1)
  }, [statusFilter])

  useEffect(() => {
    fetchRuns(page)
  }, [page])

  useEffect(() => {
    pollRef.current = setInterval(() => fetchRuns(page), 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [page, statusFilter])

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(-2))
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Lọc status:</span>
          {(['', 'pending', 'running', 'completed', 'failed', 'stopped'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                statusFilter === s
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {s || 'Tất cả'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selected.length === 2 && (
            <button
              onClick={() => onCompare(selected as [string, string])}
              className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              ⚖️ So sánh 2 runs
            </button>
          )}
          <button onClick={() => fetchRuns(page)} className="text-xs text-slate-400 hover:text-white transition-colors">
            🔄 Refresh
          </button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2">
          Đã chọn {selected.length}/2 để so sánh. {selected.length < 2 ? 'Chọn thêm 1 nữa.' : 'Nhấn "So sánh 2 runs".'}
          <button onClick={() => setSelected([])} className="ml-2 text-slate-400 hover:text-white">✕ Bỏ chọn</button>
        </div>
      )}

      {loading && runs.length === 0 ? (
        <div className="text-center py-16 text-slate-500">Đang tải…</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 text-slate-500">Không có dữ liệu.</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60">
                <tr className="text-xs text-slate-400 uppercase tracking-wide">
                  <th className="px-3 py-3 text-left w-8"></th>
                  <th className="px-3 py-3 text-left">ID</th>
                  <th className="px-3 py-3 text-left">Strategy</th>
                  <th className="px-3 py-3 text-left">Verdict</th>
                  <th className="px-3 py-3 text-left">Product</th>
                  <th className="px-3 py-3 text-left">VUs/Iter</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-right">Success%</th>
                  <th className="px-3 py-3 text-right">Avg ms</th>
                  <th className="px-3 py-3 text-right">P95 ms</th>
                  <th className="px-3 py-3 text-right">RPS</th>
                  <th className="px-3 py-3 text-right">Reqs</th>
                  <th className="px-3 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {runs.map(run => (
                  <tr
                    key={run.id}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                    onClick={() => onSelect(run.id)}
                  >
                    <td className="px-3 py-3" onClick={e => { e.stopPropagation(); toggleSelect(run.id) }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(run.id)}
                        onChange={() => {}}
                        className="accent-violet-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-400">{run.id.slice(0, 8)}…</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-300">{run.strategy}</td>
                    <td className="px-3 py-3"><VerdictBadge verdict={run.verdict} /></td>
                    <td className="px-3 py-3 text-slate-300">#{run.productId}</td>
                    <td className="px-3 py-3 text-slate-400">{run.vus} / {run.iterations}</td>
                    <td className="px-3 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-3 py-3 text-right">
                      {run.successRate != null
                        ? <span className={Number(run.successRate) >= 95 ? 'text-green-400' : 'text-red-400'}>
                            {fmt(run.successRate)}%
                          </span>
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-300">{fmt(run.avgResponseTime)}</td>
                    <td className="px-3 py-3 text-right text-slate-300">{fmt(run.p95ResponseTime)}</td>
                    <td className="px-3 py-3 text-right text-slate-300">{fmt(run.requestsPerSecond)}</td>
                    <td className="px-3 py-3 text-right text-slate-300">{run.totalRequests ?? '—'}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {new Date(run.createdAt).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>Tổng: {total} runs</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded bg-slate-800 disabled:opacity-30 hover:bg-slate-700 transition-colors"
              >
                ← Trước
              </button>
              <span className="px-3 py-1 text-slate-300">{page} / {totalPages || 1}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded bg-slate-800 disabled:opacity-30 hover:bg-slate-700 transition-colors"
              >
                Sau →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
