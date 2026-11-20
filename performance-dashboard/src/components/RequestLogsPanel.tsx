import { useEffect, useMemo, useState } from 'react'
import {
  getLogs,
  getAnalysis,
  type RequestLog,
  type AnalysisResponse,
  type LogStatus,
} from '../api.ts'

const STATUS_CLS: Record<LogStatus, string> = {
  SUCCESS: 'text-green-400',
  OUT_OF_STOCK: 'text-yellow-400',
  CONFLICT: 'text-orange-400',
  ERROR: 'text-red-400',
}

const BAR_CLS: Record<LogStatus, string> = {
  SUCCESS: 'bg-green-500',
  OUT_OF_STOCK: 'bg-yellow-500',
  CONFLICT: 'bg-orange-500',
  ERROR: 'bg-red-500',
}

const PAGE_SIZE = 200

function n(v: string | number | null | undefined, d = 1) {
  return v == null ? '—' : Number(v).toFixed(d)
}

function timeMs(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleTimeString('vi-VN')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

export function RequestLogsPanel({ id, running }: { id: string; running: boolean }) {
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<'' | LogStatus>('')
  const [page, setPage] = useState(1)
  const [onlyDup, setOnlyDup] = useState(false)

  useEffect(() => {
    getAnalysis(id).then(setAnalysis)
  }, [id, running])

  useEffect(() => {
    getLogs(id, { status: status || undefined, page, limit: PAGE_SIZE }).then(r => {
      setLogs(r.data)
      setTotal(r.total)
    })
  }, [id, status, page, running])

  const dupStocks = useMemo(
    () => new Set((analysis?.duplicateReads ?? []).map(d => d.stock)),
    [analysis],
  )

  // Timeline scale for the current page: each bar = [startedAt, finishedAt], darker part = waiting for lock/read
  const t0 = logs.length ? Math.min(...logs.map(l => +new Date(l.startedAt))) : 0
  const t1 = logs.length ? Math.max(...logs.map(l => +new Date(l.finishedAt))) : 1
  const span = Math.max(1, t1 - t0)

  const visible = onlyDup
    ? logs.filter(l => l.status === 'SUCCESS' && l.stockBefore != null && dupStocks.has(l.stockBefore))
    : logs
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      {/* Summary by outcome */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <p className="text-xs text-slate-400 uppercase mb-3">Tổng hợp theo kết quả</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase">
                <th className="text-left py-1">Status</th>
                <th className="text-right py-1">Số request</th>
                <th className="text-right py-1">Avg duration ms</th>
                <th className="text-right py-1">Avg chờ lock ms</th>
                <th className="text-right py-1">Max chờ lock ms</th>
                <th className="text-right py-1">Tổng retry</th>
              </tr>
            </thead>
            <tbody>
              {(analysis?.summary ?? []).map(r => (
                <tr key={r.status} className="border-t border-slate-800">
                  <td className={`py-1.5 font-mono text-xs ${STATUS_CLS[r.status]}`}>{r.status}</td>
                  <td className="text-right">{r.count}</td>
                  <td className="text-right">{n(r.avgDurationMs)}</td>
                  <td className="text-right">{n(r.avgLockWaitMs)}</td>
                  <td className="text-right">{n(r.maxLockWaitMs)}</td>
                  <td className="text-right">{r.retries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Race evidence */}
      {analysis && analysis.duplicateReads.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-5">
          <p className="text-xs text-red-300 uppercase mb-2">
            Bằng chứng race condition: các giá trị stock bị nhiều request thành công đọc cùng lúc
          </p>
          <p className="text-xs text-slate-400 mb-3">
            Khi khoá đúng, mỗi đơn thành công phải thấy một giá trị stock khác nhau. Ở đây nhiều request
            cùng thấy một giá trị, nên cùng trừ kho từ đó và ghi đè lên nhau.
          </p>
          <div className="flex flex-wrap gap-2">
            {analysis.duplicateReads.slice(0, 60).map(d => (
              <span key={d.stock} className="text-xs font-mono bg-red-500/15 text-red-200 px-2 py-0.5 rounded">
                stock={d.stock} × {d.count}
              </span>
            ))}
            {analysis.duplicateReads.length > 60 && (
              <span className="text-xs text-slate-500">… +{analysis.duplicateReads.length - 60}</span>
            )}
          </div>
        </div>
      )}

      {/* Log table with timeline */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-800">
          <select
            value={status}
            onChange={e => { setStatus(e.target.value as '' | LogStatus); setPage(1) }}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
          >
            <option value="">Tất cả status</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>
            <option value="CONFLICT">CONFLICT</option>
            <option value="ERROR">ERROR</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={onlyDup} onChange={e => setOnlyDup(e.target.checked)} />
            Chỉ hiện request đọc trùng stock
          </label>
          <span className="text-xs text-slate-500 ml-auto">
            {total} request · trang {page}/{pages}
          </span>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="text-xs px-2 py-1 rounded bg-slate-800 disabled:opacity-40">←</button>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="text-xs px-2 py-1 rounded bg-slate-800 disabled:opacity-40">→</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Bắt đầu</th>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Stock đọc</th>
                <th className="px-3 py-2 text-right">Stock ghi</th>
                <th className="px-3 py-2 text-right">Chờ lock ms</th>
                <th className="px-3 py-2 text-right">Tổng ms</th>
                <th className="px-3 py-2 text-right">Retry</th>
                <th className="px-3 py-2 text-left w-1/3">Timeline (chờ lock · xử lý)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visible.map(l => {
                const s = +new Date(l.startedAt)
                const lock = l.lockAcquiredAt ? +new Date(l.lockAcquiredAt) : s
                const f = +new Date(l.finishedAt)
                const dup = l.status === 'SUCCESS' && l.stockBefore != null && dupStocks.has(l.stockBefore)
                return (
                  <tr key={l.id} className={dup ? 'bg-red-500/5' : 'hover:bg-slate-800/30'}>
                    <td className="px-3 py-1.5 font-mono text-slate-500">{timeMs(l.startedAt)}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-400">{l.userId}</td>
                    <td className={`px-3 py-1.5 font-mono ${STATUS_CLS[l.status]}`} title={l.message ?? ''}>
                      {l.status}{l.pgErrorCode ? ` (${l.pgErrorCode})` : ''}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono ${dup ? 'text-red-300 font-semibold' : ''}`}>{l.stockBefore ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{l.stockAfter ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right">{n(l.lockWaitMs)}</td>
                    <td className="px-3 py-1.5 text-right">{n(l.durationMs)}</td>
                    <td className="px-3 py-1.5 text-right">{l.retries || ''}</td>
                    <td className="px-3 py-1.5">
                      <div className="relative h-2.5 bg-slate-800 rounded">
                        <div
                          className="absolute h-full bg-slate-500/60 rounded-l"
                          style={{ left: `${((s - t0) / span) * 100}%`, width: `${Math.max(0.3, ((lock - s) / span) * 100)}%` }}
                        />
                        <div
                          className={`absolute h-full rounded-r ${BAR_CLS[l.status]}`}
                          style={{ left: `${((lock - t0) / span) * 100}%`, width: `${Math.max(0.3, ((f - lock) / span) * 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">Không có log nào.</p>
          )}
        </div>
      </div>
    </div>
  )
}
