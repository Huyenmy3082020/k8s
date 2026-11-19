import { useState } from 'react'
import { RunList } from './pages/RunList.tsx'
import { RunDetail } from './pages/RunDetail.tsx'
import { CompareView } from './pages/CompareView.tsx'

type View =
  | { type: 'list' }
  | { type: 'detail'; id: string }
  | { type: 'compare'; ids: [string, string] }

export default function App() {
  const [view, setView] = useState<View>({ type: 'list' })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Nav */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
            <h1
              className="text-xl font-bold text-white cursor-pointer hover:text-violet-400 transition-colors"
              onClick={() => setView({ type: 'list' })}
            >
              Performance Dashboard
            </h1>
          </div>

          {view.type !== 'list' && (
            <span className="text-slate-600">/</span>
          )}
          {view.type === 'detail' && (
            <span className="text-sm text-slate-400 font-mono">{view.id.slice(0, 13)}…</span>
          )}
          {view.type === 'compare' && (
            <span className="text-sm text-slate-400">So sánh</span>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {view.type === 'list' && (
          <RunList
            onSelect={id => setView({ type: 'detail', id })}
            onCompare={ids => setView({ type: 'compare', ids })}
          />
        )}
        {view.type === 'detail' && (
          <RunDetail
            id={view.id}
            onBack={() => setView({ type: 'list' })}
          />
        )}
        {view.type === 'compare' && (
          <CompareView
            ids={view.ids}
            onBack={() => setView({ type: 'list' })}
          />
        )}
      </main>
    </div>
  )
}
