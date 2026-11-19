import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { getTest, getMetrics, getErrors, type TestRun, type TestMetric, type TestError } from '../api.ts'
import { StatusBadge } from '../components/StatusBadge.tsx'
import { StatCard } from '../components/StatCard.tsx'

interface Props {
  id: string
  onBack: () => void
}

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return '—'
  return Number(n).toFixed(decimals)
}

function duration(ms: number | null) {
  if (!ms) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function RunDetail({ id, onBack }: Props) {
  const [run, setRun] = useState<TestRun | null>(null)
  const [metrics, setMetrics] = useState<TestMetric[]>([])
  const [errors, setErrors] = useState<TestError[]>([])
  const [errorTotal, setErrorTotal] = useState(0)
  const [tab, setTab] = useState<'overview' | 'metrics' | 'errors'>('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getTest(id),
      getMetrics(id),
      getErrors(id),
    ]).then(([runData, metricsData, errorsData]) => {
      setRun(runData)
      setMetrics(metricsData.metrics)
      setErrors(errorsData.errors)
      setErrorTotal(errorsData.total)
    }).finally(() => setLoading(false))

    // poll while running
    const poll = setInterval(async () => {
      const r = await getTest(id)
      setRun(r)
      if (r.status === 'running') {
        const [m, e] = await Promise.all([getMetrics(id), getErrors(id)])
        setMetrics(m.metrics)
        setErrors(e.errors)
        setErrorTotal(e.total)
      } else {
        clearInterval(poll)
      }
    }, 4000)
    return () => clearInterval(poll)
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">Đang tải…</div>
    )
  }
  if (!run) {
    return <div className="text-red-400 py-10 text-center">Không tìm thấy test run.</div>
  }

  const chartData = metrics.map(m => ({
    time: new Date(m.timestamp).toLocaleTimeString('vi-VN'),
    'Avg ms': m.avgResponseTime != null ? Number(m.avgResponseTime).toFixed(1) : null,
    'P95 ms': m.p95ResponseTime != null ? Number(m.p95ResponseTime).toFixed(1) : null,
    'RPS': m.rps != null ? Number(m.rps).toFixed(1) : null,
    'VUs': m.vus,
    'Error%': m.errorRate != null ? Number(m.errorRate).toFixed(2) : null,
  }))

  const successPct = run.successRate != null ? Number(run.successRate) : null

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors text-sm">
          ← Quay lại
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white font-mono">{run.id.slice(0, 13)}…</h2>
          <StatusBadge status={run.status} />
          {run.inventoryMismatch && (
            <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">
              ⚠️ Inventory Mismatch
            </span>
          )}
        </div>
      </div>

      {/* Meta info */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 text-sm grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6">
        <div><span className="text-slate-500">Type:</span> <span className="text-slate-200 capitalize">{run.testType}</span></div>
        <div><span className="text-slate-500">Product:</span> <span className="text-slate-200">#{run.productId}</span></div>
        <div><span className="text-slate-500">VUs:</span> <span className="text-slate-200">{run.vus}</span></div>
        <div><span className="text-slate-500">Iterations:</span> <span className="text-slate-200">{run.iterations}</span></div>
        <div><span className="text-slate-500">Max Duration:</span> <span className="text-slate-200">{run.maxDuration}</span></div>
        <div><span className="text-slate-500">Actual Duration:</span> <span className="text-slate-200">{duration(run.durationMs)}</span></div>
        <div className="col-span-2 truncate"><span className="text-slate-500">URL:</span> <span className="text-slate-200 text-xs">{run.targetUrl}</span></div>
        <div><span className="text-slate-500">Stock trước:</span> <span className="text-slate-200">{run.initialStock ?? '—'}</span></div>
        <div><span className="text-slate-500">Stock sau:</span> <span className="text-slate-200">{run.finalStock ?? '—'}</span></div>
        <div><span className="text-slate-500">Orders thành công:</span> <span className="text-slate-200">{run.successfulOrderCount ?? '—'}</span></div>
        <div><span className="text-slate-500">Oversold:</span>
          <span className={`ml-1 ${run.oversoldQuantity ? 'text-red-400' : 'text-slate-200'}`}>
            {run.oversoldQuantity ?? 0}
          </span>
        </div>
      </div>

      {run.errorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <strong>Error:</strong> {run.errorMessage}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Total Reqs" value={run.totalRequests ?? '—'} />
        <StatCard label="Thành công" value={run.successfulRequests ?? '—'} />
        <StatCard
          label="Success Rate"
          value={successPct != null ? `${fmt(successPct)}%` : '—'}
          highlight={successPct == null ? 'none' : successPct >= 95 ? 'green' : 'red'}
        />
        <StatCard
          label="Error Rate"
          value={run.errorRate != null ? `${fmt(run.errorRate)}%` : '—'}
          highlight={run.errorRate == null ? 'none' : Number(run.errorRate) > 5 ? 'red' : 'green'}
        />
        <StatCard label="Avg ms" value={fmt(run.avgResponseTime)} />
        <StatCard label="Median ms" value={fmt(run.medianResponseTime)} />
        <StatCard label="P90 ms" value={fmt(run.p90ResponseTime)} />
        <StatCard label="P95 ms" value={fmt(run.p95ResponseTime)} />
        <StatCard label="P99 ms" value={fmt(run.p99ResponseTime)} />
        <StatCard label="Max ms" value={fmt(run.maxResponseTime)} />
        <StatCard label="RPS" value={fmt(run.requestsPerSecond)} />
        <StatCard label="Out of Stock" value={run.outOfStockRequests ?? '—'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {(['overview', 'metrics', 'errors'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-sm py-2 rounded-lg transition-colors capitalize ${
              tab === t
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t === 'errors' ? `Errors (${errorTotal})` : t === 'metrics' ? `Metrics (${metrics.length})` : 'Overview'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-sm space-y-2 text-slate-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-slate-400 text-xs uppercase mb-2">Response Time Percentiles</p>
              <div className="space-y-1">
                {[['Avg', run.avgResponseTime], ['Median', run.medianResponseTime], ['P90', run.p90ResponseTime], ['P95', run.p95ResponseTime], ['P99', run.p99ResponseTime], ['Max', run.maxResponseTime]].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-slate-500">{label as string}</span>
                    <span>{fmt(val as number | null)} ms</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-slate-400 text-xs uppercase mb-2">Request Breakdown</p>
              <div className="space-y-1">
                {[
                  ['Total', run.totalRequests],
                  ['Successful', run.successfulRequests],
                  ['Out of Stock', run.outOfStockRequests],
                  ['Unexpected', run.unexpectedRequests],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-slate-500">{label as string}</span>
                    <span>{val ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'metrics' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-6">
          {chartData.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">Chưa có dữ liệu metrics.</p>
          ) : (
            <>
              <div>
                <p className="text-xs text-slate-400 uppercase mb-3">Response Time (ms)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#94a3b8' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="Avg ms" stroke="#8b5cf6" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="P95 ms" stroke="#f59e0b" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase mb-3">RPS & VUs</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#94a3b8' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="RPS" stroke="#22d3ee" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="VUs" stroke="#a3e635" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase mb-3">Error Rate %</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#94a3b8' }} />
                    <Line type="monotone" dataKey="Error%" stroke="#f87171" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'errors' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {errors.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">Không có lỗi nào được ghi lại.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60">
                  <tr className="text-xs text-slate-400 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Time</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Message</th>
                    <th className="px-4 py-3 text-left">URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {errors.map(err => (
                    <tr key={err.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {new Date(err.timestamp).toLocaleTimeString('vi-VN')}
                      </td>
                      <td className="px-4 py-2">
                        {err.statusCode != null
                          ? <span className={`text-xs font-mono ${err.statusCode >= 500 ? 'text-red-400' : 'text-yellow-400'}`}>
                              {err.statusCode}
                            </span>
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">{err.errorType ?? '—'}</td>
                      <td className="px-4 py-2 text-xs text-slate-300 max-w-xs truncate">{err.message ?? '—'}</td>
                      <td className="px-4 py-2 text-xs text-slate-500 max-w-xs truncate">{err.url ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {errorTotal > errors.length && (
                <p className="text-xs text-slate-500 text-center py-3">
                  Hiển thị {errors.length} / {errorTotal} lỗi
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
