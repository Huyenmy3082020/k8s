export const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  running: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  completed: 'bg-green-500/20 text-green-300 border border-green-500/30',
  failed: 'bg-red-500/20 text-red-300 border border-red-500/30',
  stopped: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[status] ?? 'bg-slate-700 text-slate-300'}`}>
      {status}
    </span>
  )
}
