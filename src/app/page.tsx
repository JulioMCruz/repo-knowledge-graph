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
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#8B95A1' }}>Loading graph...</div>
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

  const handleUsernameSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (trimmed && trimmed !== username) {
      loadGraph(trimmed, sinceYear)
    }
  }, [inputValue, username, sinceYear, loadGraph])

  const handleUsernameBlur = useCallback(() => {
    if (!inputValue.trim()) {
      setInputValue(username)
    }
  }, [inputValue, username])

  return (
    <main className="h-screen w-screen overflow-hidden relative" style={{ background: '#07090D' }}>
      {loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(7, 9, 13, 0.9)' }}>
          <div className="hud-panel p-6 text-center">
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#8B95A1', marginBottom: 8 }}>
              Loading @{inputValue}...
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#5C6570' }}>
              Repos with activity since {sinceYear}
            </div>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(7, 9, 13, 0.9)' }}>
          <div className="hud-panel p-6 text-center max-w-sm">
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#FF4A2A', marginBottom: 8 }}>
              Error loading graph
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#5C6570', marginBottom: 16 }}>
              {error}
            </div>
            <button
              onClick={() => loadGraph(username, sinceYear)}
              className="hud-panel px-4 py-2 hover:bg-[#1C2430] transition-colors"
              style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#4F8CA8' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {graphData && !loading && (
        <Suspense fallback={
          <div className="flex items-center justify-center h-full w-full" style={{ background: '#07090D' }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#8B95A1' }}>Rendering...</div>
          </div>
        }>
          <ForceGraph3DView 
            data={graphData} 
            sinceYear={sinceYear}
            username={inputValue}
            onUsernameChange={setInputValue}
            onUsernameSubmit={handleUsernameSubmit}
            onUsernameBlur={handleUsernameBlur}
          />
        </Suspense>
      )}

      {!graphData && !loading && !error && (
        <div className="flex items-center justify-center h-full w-full">
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#5C6570' }}>
            Enter a GitHub username to view their map
          </div>
        </div>
      )}
    </main>
  )
}
