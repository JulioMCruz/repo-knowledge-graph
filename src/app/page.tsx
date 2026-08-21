'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import type { GraphData } from '@/lib/graph-generator'

const ForceGraph3DView = dynamic(
  () => import('@/components/force-graph-3d').then(mod => ({ default: mod.ForceGraph3DView })),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full w-full" style={{ background: '#07090D' }}>
        <div className="text-[#8B95A1] text-sm font-mono">Loading graph...</div>
      </div>
    )
  }
)

const DEFAULT_USERNAME = 'JulioMCruz'
const DEFAULT_SINCE_YEAR = 2024

export default function Home() {
  const [username, setUsername] = useState(DEFAULT_USERNAME)
  const [inputValue, setInputValue] = useState(DEFAULT_USERNAME)
  const [sinceYear] = useState(DEFAULT_SINCE_YEAR)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadGraph = useCallback(async (user: string, year: number) => {
    if (!user.trim()) return
    
    setLoading(true)
    setError(null)
    
    try {
      const staticUrl = `/data/${user.toLowerCase()}-${year}.json`
      let response = await fetch(staticUrl)
      
      if (!response.ok) {
        response = await fetch(`/api/graph/${encodeURIComponent(user)}?sinceYear=${year}`)
      }
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to load graph')
      }
      
      const data: GraphData = await response.json()
      setGraphData(data)
      setUsername(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGraph(DEFAULT_USERNAME, sinceYear)
  }, [loadGraph, sinceYear])

  const handleUsernameSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (trimmed && trimmed !== username) {
      loadGraph(trimmed, sinceYear)
    }
  }, [inputValue, username, sinceYear, loadGraph])

  const handleUsernameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const trimmed = inputValue.trim()
      if (trimmed && trimmed !== username) {
        loadGraph(trimmed, sinceYear)
      }
    }
  }, [inputValue, username, sinceYear, loadGraph])

  return (
    <main className="h-screen w-screen overflow-hidden relative" style={{ background: '#07090D' }}>
      <div className="absolute top-4 left-4 z-30 flex items-end gap-6">
        <div className="flex flex-col gap-1">
          <label 
            className="font-mono text-[10px] uppercase"
            style={{ color: '#5C6570', letterSpacing: '0.12em' }}
          >
            MAP
          </label>
          <form onSubmit={handleUsernameSubmit}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleUsernameKeyDown}
              onBlur={() => {
                if (!inputValue.trim()) {
                  setInputValue(username)
                }
              }}
              className="hud-panel px-3 py-2 font-medium focus:outline-none focus:ring-1 focus:ring-[#4F8CA8]"
              style={{ 
                width: 200, 
                height: 36,
                fontSize: 15,
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                background: 'rgba(11, 16, 24, 0.72)',
                color: '#E9E4D9'
              }}
            />
          </form>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(7, 9, 13, 0.9)' }}>
          <div className="hud-panel p-6 text-center">
            <div className="text-[#8B95A1] text-sm font-mono mb-2">
              Loading @{inputValue}...
            </div>
            <div className="text-[#5C6570] text-xs font-mono">
              Repos with activity since {sinceYear}
            </div>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(7, 9, 13, 0.9)' }}>
          <div className="hud-panel p-6 text-center max-w-sm">
            <div className="text-[#FF4A2A] text-sm font-mono mb-2">
              Error loading graph
            </div>
            <div className="text-[#5C6570] text-xs font-mono mb-4">
              {error}
            </div>
            <button
              onClick={() => loadGraph(username, sinceYear)}
              className="hud-panel px-4 py-2 text-xs font-mono hover:bg-[#1C2430] transition-colors"
              style={{ color: '#4F8CA8' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {graphData && !loading && (
        <Suspense fallback={
          <div className="flex items-center justify-center h-full w-full" style={{ background: '#07090D' }}>
            <div className="text-[#8B95A1] text-sm font-mono">Rendering...</div>
          </div>
        }>
          <ForceGraph3DView data={graphData} sinceYear={sinceYear} />
        </Suspense>
      )}

      {!graphData && !loading && !error && (
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-[#5C6570] text-sm font-mono">
            Enter a GitHub username to view their map
          </div>
        </div>
      )}
    </main>
  )
}
