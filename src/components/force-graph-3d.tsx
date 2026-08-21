'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { GraphData } from '@/lib/graph-generator'

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full" style={{ background: '#07090D' }}>
      <div className="text-[#8B95A1] text-sm font-mono">Loading...</div>
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

export function ForceGraph3DView({ data, sinceYear }: ForceGraph3DViewProps) {
  const fgRef = useRef<{ cameraPosition: (pos: { x: number; y: number; z: number }, lookAt?: { x: number; y: number; z: number }, ms?: number) => void } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set())

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
    
    for (const node of data.nodes) {
      if (
        node.name.toLowerCase().includes(query) ||
        node.owner.toLowerCase().includes(query) ||
        node.fullName.toLowerCase().includes(query)
      ) {
        matches.add(node.id)
      }
    }
    
    setHighlightNodes(matches)
  }, [searchQuery, data.nodes])

  useEffect(() => {
    if (fgRef.current && data.nodes.length > 0) {
      setTimeout(() => {
        fgRef.current?.cameraPosition(
          { x: 0, y: 0, z: 150 },
          { x: 0, y: 0, z: 0 },
          1000
        )
      }, 500)
    }
  }, [data.nodes])

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

  const nodeColor = useCallback((node: unknown) => {
    const n = node as GraphNode
    if (highlightNodes.size > 0 && !highlightNodes.has(n.id)) {
      return '#1C2430'
    }
    return n.color
  }, [highlightNodes])

  const nodeOpacity = useCallback((node: unknown) => {
    const n = node as GraphNode
    if (hoveredNode) {
      if (n.id === hoveredNode.id) return Math.min(1, n.opacity * 1.2)
      return n.opacity * 0.4
    }
    if (highlightNodes.size > 0 && !highlightNodes.has(n.id)) {
      return 0.15
    }
    return n.opacity
  }, [highlightNodes, hoveredNode])

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
    const opacity = 0.12 + (avgTemp * 0.06)
    
    return `rgba(28, 36, 48, ${opacity})`
  }, [data.nodes])

  const nodeThreeObject = useCallback((node: unknown) => {
    const n = node as GraphNode
    const THREE = require('three')
    
    const scale = hoveredNode?.id === n.id ? 1.12 : 1
    const radius = n.radius * scale
    
    const geometry = new THREE.SphereGeometry(radius, 32, 32)
    
    const color = nodeColor(n)
    const opacity = nodeOpacity(n)
    const emissiveIntensity = n.temperature >= 0.6 ? 0.6 : 0.1
    
    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: emissiveIntensity * opacity,
      transparent: true,
      opacity: opacity,
      roughness: 0.4,
      metalness: 0.1
    })
    
    return new THREE.Mesh(geometry, material)
  }, [nodeColor, nodeOpacity, hoveredNode])

  const repoCount = data.nodes.filter(n => !n.isExternal).length

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ background: '#07090D' }}>
      <div className="absolute top-4 left-4 z-20 flex items-start gap-6">
        <div className="flex flex-col gap-1">
          <label className="legend-title">IN THIS GRAPH</label>
          <input
            type="text"
            placeholder="Find a repo"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="hud-panel px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-[#4F8CA8]"
            style={{ 
              width: 280, 
              height: 40,
              background: 'rgba(11, 16, 24, 0.72)',
              color: '#E9E4D9'
            }}
          />
          {highlightNodes.size > 0 && (
            <div className="text-[11px] font-mono" style={{ color: '#5C6570' }}>
              {highlightNodes.size} found
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20">
        <div className="data-mono" style={{ color: '#8B95A1' }}>
          {repoCount} repos &nbsp;·&nbsp; since {sinceYear}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-20 hud-panel p-4" style={{ minWidth: 160 }}>
        <div className="legend-title mb-1">TEMPERATURE</div>
        <div className="legend-value mb-3">last push &nbsp;·&nbsp; since {sinceYear}</div>
        
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: '#FF4A2A' }} />
            <span className="legend-label">Hot</span>
            <span className="legend-value ml-auto">this week</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: '#FF8F3A' }} />
            <span className="legend-label">Warm</span>
            <span className="legend-value ml-auto">this month</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: '#E6B35A' }} />
            <span className="legend-label">Cooling</span>
            <span className="legend-value ml-auto">this quarter</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: '#4F8CA8' }} />
            <span className="legend-label">Cool</span>
            <span className="legend-value ml-auto">this year</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: '#3A4F8C' }} />
            <span className="legend-label">Cold</span>
            <span className="legend-value ml-auto">stale</span>
          </div>
        </div>
        
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid #1C2430' }}>
          <div className="legend-title mb-2">SIZE</div>
          <div className="legend-value">activity</div>
        </div>
      </div>

      {hoveredNode && (
        <div 
          className="absolute z-20 hud-panel p-4"
          style={{ 
            top: '50%',
            right: 16,
            transform: 'translateY(-50%)',
            maxWidth: 280
          }}
        >
          <h3 
            className="font-medium text-[15px] mb-0.5"
            style={{ color: '#E9E4D9', fontFamily: 'var(--font-sans)' }}
          >
            {hoveredNode.name}
          </h3>
          <p className="data-mono mb-3" style={{ color: '#5C6570' }}>
            @{hoveredNode.owner}
          </p>
          
          <div className="flex items-center gap-2 mb-3">
            <div 
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: hoveredNode.color }}
            />
            <span className="data-mono" style={{ color: '#8B95A1' }}>
              {getTemperatureLabel(hoveredNode.temperature)}
            </span>
            <span className="data-mono" style={{ color: '#5C6570' }}>
              · {formatRelativeTime(hoveredNode.pushedAt)}
            </span>
          </div>
          
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <div className="legend-title">STARS</div>
              <div className="data-mono" style={{ color: '#E9E4D9' }}>
                {hoveredNode.stars.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="legend-title">FORKS</div>
              <div className="data-mono" style={{ color: '#E9E4D9' }}>
                {hoveredNode.forks.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="legend-title">COMMITS</div>
              <div className="data-mono" style={{ color: '#E9E4D9' }}>
                {hoveredNode.commitsMissing ? '—' : hoveredNode.commits.toLocaleString()}
              </div>
            </div>
          </div>
          
          <div 
            className="data-mono pt-2"
            style={{ color: '#4F8CA8', borderTop: '1px solid #1C2430' }}
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
        backgroundColor="#07090D"
        showNavInfo={false}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        enableNodeDrag={true}
        enableNavigationControls={true}
        controlType="orbit"
      />
    </div>
  )
}
