'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { GraphData } from '@/lib/graph-generator'

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full" style={{ background: '#07090D' }}>
      <div style={{ color: '#8B95A1', fontFamily: 'IBM Plex Mono', fontSize: 11 }}>Loading...</div>
    </div>
  )
})

interface ForceGraph3DViewProps {
  data: GraphData
  sinceYear: number
}

interface GraphNode {
  id: string
  name: string
  owner: string
  fullName: string
  url: string
  description: string | null
  stars: number
  forks: number
  commits: number
  commitsMissing?: boolean
  pushedAt: string | null
  temperature: number
  color: string
  opacity: number
  radius: number
  weight: number
  isExternal?: boolean
  x?: number
  y?: number
  z?: number
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: string
}

const COLORS = {
  bg: '#07090D',
  glass: 'rgba(11, 16, 24, 0.72)',
  line: '#1C2430',
  paper: '#E9E4D9',
  muted: '#8B95A1',
  faint: '#5C6570',
  tempHot: '#FF4A2A',
  tempWarm: '#FF8F3A',
  tempCooling: '#E6B35A',
  tempCool: '#4F8CA8',
  tempCold: '#3A4F8C'
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never'
  
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

function getTemperatureLabel(temp: number): string {
  if (temp >= 0.85) return 'Hot'
  if (temp >= 0.6) return 'Warm'
  if (temp >= 0.35) return 'Cooling'
  if (temp >= 0.15) return 'Cool'
  return 'Cold'
}

function interpolateColor(color1: string, color2: string, factor: number): string {
  const hex = (c: string) => parseInt(c, 16)
  const r1 = hex(color1.slice(1, 3)), g1 = hex(color1.slice(3, 5)), b1 = hex(color1.slice(5, 7))
  const r2 = hex(color2.slice(1, 3)), g2 = hex(color2.slice(3, 5)), b2 = hex(color2.slice(5, 7))
  const r = Math.round(r1 + (r2 - r1) * factor)
  const g = Math.round(g1 + (g2 - g1) * factor)
  const b = Math.round(b1 + (b2 - b1) * factor)
  return `rgb(${r}, ${g}, ${b})`
}

export function ForceGraph3DView({ data, sinceYear }: ForceGraph3DViewProps) {
  const fgRef = useRef<{ 
    cameraPosition: (pos: { x: number; y: number; z: number }, lookAt?: { x: number; y: number; z: number }, ms?: number) => void
    graph2ScreenCoords: (x: number, y: number, z: number) => { x: number; y: number }
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set())

  const userNodes = useMemo(() => data.nodes.filter(n => !n.isExternal), [data.nodes])

  useEffect(() => {
    function updateDimensions() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setHighlightNodes(new Set())
      return
    }

    const query = searchQuery.toLowerCase()
    const matches = new Set<string>()
    
    for (const node of userNodes) {
      if (
        node.name.toLowerCase().includes(query) ||
        node.owner.toLowerCase().includes(query) ||
        node.fullName.toLowerCase().includes(query)
      ) {
        matches.add(node.id)
      }
    }
    
    setHighlightNodes(matches)
  }, [searchQuery, userNodes])

  useEffect(() => {
    if (fgRef.current && data.nodes.length > 0) {
      const hottestNodes = [...data.nodes]
        .filter(n => !n.isExternal)
        .sort((a, b) => (b.temperature * b.weight) - (a.temperature * a.weight))
      
      if (hottestNodes.length > 0) {
        setTimeout(() => {
          fgRef.current?.cameraPosition(
            { x: 0, y: 0, z: 120 },
            { x: 0, y: 0, z: 0 },
            1500
          )
        }, 800)
      }
    }
  }, [data.nodes])

  useEffect(() => {
    if (hoveredNode && fgRef.current && hoveredNode.x !== undefined && hoveredNode.y !== undefined && hoveredNode.z !== undefined) {
      const coords = fgRef.current.graph2ScreenCoords(hoveredNode.x, hoveredNode.y, hoveredNode.z)
      setTooltipPos({ x: coords.x + 12, y: coords.y })
    } else {
      setTooltipPos(null)
    }
  }, [hoveredNode])

  const graphData = useMemo(() => ({
    nodes: data.nodes as GraphNode[],
    links: data.links as GraphLink[]
  }), [data])

  const handleNodeClick = useCallback((node: unknown) => {
    const n = node as GraphNode
    if (n?.url) {
      window.open(n.url, '_blank', 'noopener,noreferrer')
    }
  }, [])

  const handleNodeHover = useCallback((node: unknown) => {
    const n = node as GraphNode | null
    setHoveredNode(n)
    if (containerRef.current) {
      containerRef.current.style.cursor = n ? 'pointer' : 'grab'
    }
  }, [])

  const getNodeOpacity = useCallback((node: GraphNode) => {
    if (hoveredNode) {
      if (node.id === hoveredNode.id) return Math.min(1, node.opacity)
      return 0.4
    }
    if (highlightNodes.size > 0 && !highlightNodes.has(node.id)) {
      return 0.15
    }
    if (node.temperature >= 0.6) return 1.0
    if (node.temperature >= 0.3) return 0.75
    return 0.55
  }, [highlightNodes, hoveredNode])

  const getNodeBloom = useCallback((node: GraphNode) => {
    const baseBloom = node.temperature >= 0.6 ? 0.6 : 0.1
    if (hoveredNode?.id === node.id) {
      return baseBloom * 1.2
    }
    return baseBloom
  }, [hoveredNode])

  const linkColor = useCallback((link: unknown) => {
    const l = link as GraphLink
    const sourceNode = typeof l.source === 'string' 
      ? data.nodes.find(n => n.id === l.source)
      : l.source as GraphNode
    const targetNode = typeof l.target === 'string'
      ? data.nodes.find(n => n.id === l.target)
      : l.target as GraphNode
    
    if (!sourceNode || !targetNode) return 'rgba(28, 36, 48, 0.12)'
    
    const avgTemp = (sourceNode.temperature + targetNode.temperature) / 2
    const mixedColor = interpolateColor(sourceNode.color, targetNode.color, 0.5)
    const opacity = 0.12 + (avgTemp * 0.06)
    
    const match = mixedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${Math.min(opacity, 0.18)})`
    }
    return `rgba(28, 36, 48, ${Math.min(opacity, 0.18)})`
  }, [data.nodes])

  const nodeThreeObject = useCallback((node: unknown) => {
    const n = node as GraphNode
    const THREE = require('three')
    
    const isHovered = hoveredNode?.id === n.id
    const scale = isHovered ? 1.12 : 1
    const radius = n.radius * scale
    
    const geometry = new THREE.SphereGeometry(radius, 32, 32)
    
    const opacity = getNodeOpacity(n)
    const bloom = getNodeBloom(n)
    const isHot = n.temperature >= 0.6
    
    let nodeColor = n.color
    if (highlightNodes.size > 0 && !highlightNodes.has(n.id)) {
      nodeColor = COLORS.line
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: nodeColor,
      emissive: nodeColor,
      emissiveIntensity: bloom * opacity,
      transparent: true,
      opacity: opacity,
      roughness: isHot ? 0.3 : 0.5,
      metalness: 0.1
    })
    
    const mesh = new THREE.Mesh(geometry, material)
    
    if (isHot && opacity > 0.8) {
      const glowGeometry = new THREE.SphereGeometry(radius * 1.15, 16, 16)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: nodeColor,
        transparent: true,
        opacity: 0.15 * opacity
      })
      const glow = new THREE.Mesh(glowGeometry, glowMaterial)
      mesh.add(glow)
    }
    
    return mesh
  }, [getNodeOpacity, getNodeBloom, hoveredNode, highlightNodes])

  const fieldStyle = {
    background: COLORS.glass,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 8,
    outline: 'none'
  }

  const panelStyle = {
    background: COLORS.glass,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 10
  }

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ background: COLORS.bg }}>
      {/* IN THIS GRAPH search - positioned next to MAP which is in page.tsx */}
      <div className="absolute top-4 z-20" style={{ left: 200 + 16 + 24 }}>
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
            IN THIS GRAPH
          </label>
          <input
            type="text"
            placeholder="Find a repo"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              ...fieldStyle,
              width: 280, 
              height: 36,
              padding: '0 12px',
              fontSize: 13,
              fontFamily: 'IBM Plex Sans',
              color: COLORS.paper,
              '::placeholder': { color: COLORS.muted }
            } as React.CSSProperties}
          />
        </div>
        {highlightNodes.size > 0 && (
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.faint, marginTop: 4 }}>
            {highlightNodes.size} found
          </div>
        )}
      </div>

      {/* Legend */}
      <div 
        className="absolute bottom-4 left-4 z-20 p-4" 
        style={{ ...panelStyle, minWidth: 180 }}
      >
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: COLORS.muted, marginBottom: 4 }}>
          TEMPERATURE
        </div>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.faint, marginBottom: 12 }}>
          last push &nbsp;·&nbsp; since {sinceYear}
        </div>
        
        {/* Continuous temp bar */}
        <div 
          style={{ 
            height: 8, 
            borderRadius: 4,
            background: `linear-gradient(to right, ${COLORS.tempCold}, ${COLORS.tempCool}, ${COLORS.tempCooling}, ${COLORS.tempWarm}, ${COLORS.tempHot})`,
            marginBottom: 10
          }} 
        />
        
        {/* Temperature ticks */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: COLORS.tempHot, boxShadow: `0 0 4px ${COLORS.tempHot}` }} />
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: COLORS.muted }}>Hot</span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: COLORS.faint, marginLeft: 'auto' }}>this week</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: COLORS.tempWarm }} />
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: COLORS.muted }}>Warm</span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: COLORS.faint, marginLeft: 'auto' }}>this month</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: COLORS.tempCooling }} />
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: COLORS.muted }}>Cooling</span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: COLORS.faint, marginLeft: 'auto' }}>this quarter</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: COLORS.tempCool }} />
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: COLORS.muted }}>Cool</span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: COLORS.faint, marginLeft: 'auto' }}>this year</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: COLORS.tempCold }} />
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: COLORS.muted }}>Cold</span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: COLORS.faint, marginLeft: 'auto' }}>stale</span>
          </div>
        </div>
        
        <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${COLORS.line}` }}>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: COLORS.muted, marginBottom: 8 }}>
            SIZE
          </div>
          {/* Three hollow circles: quiet / active / loud */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <div style={{ 
                width: 12, 
                height: 12, 
                borderRadius: '50%', 
                border: `1.5px solid ${COLORS.muted}`,
                background: 'transparent'
              }} />
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: COLORS.faint }}>quiet</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div style={{ 
                width: 18, 
                height: 18, 
                borderRadius: '50%', 
                border: `1.5px solid ${COLORS.muted}`,
                background: 'transparent'
              }} />
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: COLORS.faint }}>active</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div style={{ 
                width: 26, 
                height: 26, 
                borderRadius: '50%', 
                border: `1.5px solid ${COLORS.muted}`,
                background: 'transparent'
              }} />
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: COLORS.faint }}>loud</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hover tooltip - follows node */}
      {hoveredNode && tooltipPos && (
        <div 
          className="absolute z-20 p-4"
          style={{ 
            ...panelStyle,
            left: Math.min(tooltipPos.x, dimensions.width - 260),
            top: Math.max(16, Math.min(tooltipPos.y - 80, dimensions.height - 200)),
            maxWidth: 240,
            pointerEvents: 'none'
          }}
        >
          <h3 
            style={{ 
              fontFamily: 'IBM Plex Sans',
              fontWeight: 500,
              fontSize: 15,
              color: COLORS.paper,
              marginBottom: 2
            }}
          >
            {hoveredNode.name}
          </h3>
          <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.faint, marginBottom: 12 }}>
            @{hoveredNode.owner}
          </p>
          
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <div 
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: hoveredNode.color, boxShadow: hoveredNode.temperature >= 0.6 ? `0 0 6px ${hoveredNode.color}` : 'none' }}
            />
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.muted }}>
              {getTemperatureLabel(hoveredNode.temperature)}
            </span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.faint }}>
              · {formatRelativeTime(hoveredNode.pushedAt)}
            </span>
          </div>
          
          <div className="grid grid-cols-3 gap-2" style={{ marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: COLORS.muted }}>STARS</div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.paper }}>
                {hoveredNode.stars.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: COLORS.muted }}>FORKS</div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.paper }}>
                {hoveredNode.forks.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: COLORS.muted }}>COMMITS</div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: COLORS.paper }}>
                {hoveredNode.commitsMissing ? '—' : hoveredNode.commits.toLocaleString()}
              </div>
            </div>
          </div>
          
          <div 
            style={{ 
              fontFamily: 'IBM Plex Mono', 
              fontSize: 11, 
              color: COLORS.paper, 
              paddingTop: 8,
              borderTop: `1px solid ${COLORS.line}`
            }}
          >
            Open on GitHub →
          </div>
        </div>
      )}

      <ForceGraph3D
        ref={fgRef as React.RefObject<never>}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeId="id"
        nodeLabel=""
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkColor={linkColor}
        linkWidth={0.5}
        linkOpacity={0.15}
        backgroundColor={COLORS.bg}
        showNavInfo={false}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        enableNodeDrag={true}
        enableNavigationControls={true}
        controlType="orbit"
      />

      <style jsx>{`
        input::placeholder {
          color: ${COLORS.muted};
        }
      `}</style>
    </div>
  )
}
