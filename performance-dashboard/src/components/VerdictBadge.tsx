export function VerdictBadge({ verdict }: { verdict: 'PASS' | 'FAIL' | null }) {
  if (!verdict) return <span className="text-slate-600">—</span>
  const cls =
    verdict === 'PASS'
      ? 'bg-green-500/20 text-green-300 border-green-500/30'
      : 'bg-red-500/20 text-red-300 border-red-500/30'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${cls}`}>
      {verdict === 'PASS' ? '✓ PASS' : '✗ FAIL'}
    </span>
  )
}
