interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  highlight?: 'green' | 'red' | 'yellow' | 'none'
}

export function StatCard({ label, value, sub, highlight = 'none' }: StatCardProps) {
  const valueColor =
    highlight === 'green' ? 'text-green-400' :
    highlight === 'red' ? 'text-red-400' :
    highlight === 'yellow' ? 'text-yellow-400' :
    'text-white'

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}
