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

const COLORS = {
  bg: '#07090D',
  glass: 'rgba(11, 16, 24, 0.72)',
  line: '#1C2430',
  paper: '#E9E4D9',
  muted: '#8B95A1',
  faint: '#5C6570',
  tempHot: '#FF4A2A',
  tempCool: '#4F8CA8'
}

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
    if (trimmed) {
      loadGraph(trimmed, sinceYear)
    }
  }, [inputValue, sinceYear, loadGraph])

  const handleUsernameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleUsernameSubmit()
    }
  }, [handleUsernameSubmit])

  const handleUsernameBlur = useCallback(() => {
    if (!inputValue.trim()) {
      setInputValue(username)
    }
  }, [inputValue, username])

  const fieldStyle = {
    background: COLORS.glass,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 8,
    outline: 'none'
  }

  const repoCount = graphData ? graphData.nodes.filter(n => !n.isExternal).length : 0

  return (
    <main className="h-screen w-screen overflow-hidden relative" style={{ background: COLORS.bg }}>
      {/* Top HUD - always visible */}
      <div className="absolute top-4 left-4 right-4 z-30 flex items-end justify-between">
        <div className="flex items-end gap-6">
          {/* MAP (username) - always available */}
          <div className="flex flex-col gap-1">
            <label 
              style={{ 
                fontFamily: 'IBM Plex Mono', 
                fontSize: 10, 
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: COLORS.faint 
              }}
            >
              MAP
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleUsernameKeyDown}
              onBlur={handleUsernameBlur}
              disabled={loading}
              style={{ 
                ...fieldStyle,
                width: 200, 
                height: 36,
                padding: '0 12px',
                fontSize: 15,
                fontFamily: 'IBM Plex Sans',
                fontWeight: 500,
                color: COLORS.paper,
                opacity: loading ? 0.6 : 1
              }}
            />
          </div>
        </div>

        {/* Count */}
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.muted }}>
          {repoCount} repos &nbsp;·&nbsp; since {sinceYear}
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(7, 9, 13, 0.9)' }}>
          <div style={{ 
            background: COLORS.glass, 
            border: `1px solid ${COLORS.line}`, 
            borderRadius: 10,
            padding: 24,
            textAlign: 'center'
          }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.muted, marginBottom: 8 }}>
              Loading @{inputValue}...
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.faint }}>
              Repos with activity since {sinceYear}
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && !loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(7, 9, 13, 0.9)' }}>
          <div style={{ 
            background: COLORS.glass, 
            border: `1px solid ${COLORS.line}`, 
            borderRadius: 10,
            padding: 24,
            textAlign: 'center',
            maxWidth: 320
          }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.tempHot, marginBottom: 8 }}>
              Error loading graph
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.faint, marginBottom: 16 }}>
              {error}
            </div>
            <button
              onClick={() => loadGraph(username, sinceYear)}
              style={{ 
                background: COLORS.glass, 
                border: `1px solid ${COLORS.line}`, 
                borderRadius: 8,
                padding: '8px 16px',
                fontFamily: 'IBM Plex Mono', 
                fontSize: 11, 
                color: COLORS.tempCool,
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Graph */}
      {graphData && !loading && (
        <Suspense fallback={
          <div className="flex items-center justify-center h-full w-full" style={{ background: COLORS.bg }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.muted }}>Rendering...</div>
          </div>
        }>
          <ForceGraph3DView 
            data={graphData} 
            sinceYear={sinceYear}
          />
        </Suspense>
      )}

      {/* Empty state */}
      {!graphData && !loading && !error && (
        <div className="flex items-center justify-center h-full w-full">
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.faint }}>
            Enter a GitHub username to view their map
          </div>
        </div>
      )}
    </main>
  )
}
