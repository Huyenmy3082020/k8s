import { useEffect, useState } from 'react'
import { compareTests, type CompareResponse } from '../api.ts'
import { StatusBadge } from '../components/StatusBadge.tsx'

interface Props {
  ids: [string, string]
  onBack: () => void
}

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return '—'
  return Number(n).toFixed(decimals)
}

const COMPARE_FIELDS = [
  { key: 'avgResponseTime', label: 'Avg Response (ms)', lowerBetter: true },
  { key: 'p95ResponseTime', label: 'P95 Response (ms)', lowerBetter: true },
  { key: 'p99ResponseTime', label: 'P99 Response (ms)', lowerBetter: true },
  { key: 'successRate', label: 'Success Rate (%)', lowerBetter: false },
  { key: 'errorRate', label: 'Error Rate (%)', lowerBetter: true },
  { key: 'requestsPerSecond', label: 'RPS', lowerBetter: false },
  { key: 'totalRequests', label: 'Total Requests', lowerBetter: false },
  { key: 'successfulRequests', label: 'Successful Requests', lowerBetter: false },
]

export function CompareView({ ids, onBack }: Props) {
  const [data, setData] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    compareTests(ids[0], ids[1])
      .then(setData)
      .catch(() => setError('Không thể so sánh hai runs này.'))
      .finally(() => setLoading(false))
  }, [ids[0], ids[1]])

  if (loading) return <div className="text-center py-16 text-slate-500">Đang tải so sánh…</div>
  if (error) return <div className="text-red-400 text-center py-10">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors text-sm">
          ← Quay lại
        </button>
        <h2 className="text-lg font-semibold text-white">So sánh 2 Test Runs</h2>
      </div>

      {/* Run headers */}
      <div className="grid grid-cols-2 gap-4">
        {[data.a, data.b].map((run, i) => (
          <div key={run.id} className={`rounded-xl border p-4 ${i === 0 ? 'border-violet-500/40 bg-violet-500/5' : 'border-cyan-500/40 bg-cyan-500/5'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${i === 0 ? 'bg-violet-600' : 'bg-cyan-600'} text-white`}>
                {i === 0 ? 'A' : 'B'}
              </span>
              <span className="font-mono text-xs text-slate-400">{run.id.slice(0, 13)}…</span>
              <StatusBadge status={run.status} />
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <div><span className="text-slate-500">Type:</span> <span className="capitalize">{run.testType}</span></div>
              <div><span className="text-slate-500">VUs/Iter:</span> {run.vus}/{run.iterations}</div>
              <div><span className="text-slate-500">Duration:</span> {run.maxDuration}</div>
              <div><span className="text-slate-500">Created:</span> {new Date(run.createdAt).toLocaleString('vi-VN')}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Diff table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr className="text-xs text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Metric</th>
              <th className="px-4 py-3 text-right text-violet-400">A</th>
              <th className="px-4 py-3 text-right text-cyan-400">B</th>
              <th className="px-4 py-3 text-right">Delta</th>
              <th className="px-4 py-3 text-right">Δ%</th>
              <th className="px-4 py-3 text-center">Thắng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {COMPARE_FIELDS.map(({ key, label, lowerBetter }) => {
              const d = data.diff[key]
              if (!d) return (
                <tr key={key} className="text-slate-500">
                  <td className="px-4 py-3">{label}</td>
                  <td className="px-4 py-3 text-right">{fmt((data.a as unknown as Record<string, number | null>)[key])}</td>
                  <td className="px-4 py-3 text-right">{fmt((data.b as unknown as Record<string, number | null>)[key])}</td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-center">—</td>
                </tr>
              )

              const aBetter = lowerBetter ? d.a < d.b : d.a > d.b
              const bBetter = lowerBetter ? d.b < d.a : d.b > d.a
              const deltaColor = d.delta === 0 ? 'text-slate-400' : (lowerBetter ? (d.delta < 0 ? 'text-green-400' : 'text-red-400') : (d.delta > 0 ? 'text-green-400' : 'text-red-400'))

              return (
                <tr key={key} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-slate-300">{label}</td>
                  <td className={`px-4 py-3 text-right font-mono ${aBetter ? 'text-violet-300 font-semibold' : 'text-slate-400'}`}>
                    {fmt(d.a)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${bBetter ? 'text-cyan-300 font-semibold' : 'text-slate-400'}`}>
                    {fmt(d.b)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-xs ${deltaColor}`}>
                    {d.delta > 0 ? '+' : ''}{fmt(d.delta)}
                  </td>
                  <td className={`px-4 py-3 text-right text-xs ${deltaColor}`}>
                    {d.deltaPercent != null ? `${d.deltaPercent > 0 ? '+' : ''}${d.deltaPercent}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {aBetter ? '🟣 A' : bBetter ? '🔵 B' : '🤝'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
