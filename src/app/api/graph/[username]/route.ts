import { NextRequest, NextResponse } from 'next/server'
import { generateGraph, DEFAULT_SINCE_YEAR } from '@/lib/graph-generator'
import * as fs from 'fs'
import * as path from 'path'

const CACHE_DIR = path.join(process.cwd(), '.cache', 'graphs')
const STATIC_DIR = path.join(process.cwd(), 'public', 'data')
const CACHE_TTL_MS = 1000 * 60 * 60

function getCachePath(username: string, sinceYear: number): string {
  return path.join(CACHE_DIR, `${username.toLowerCase()}-${sinceYear}.json`)
}

function getStaticPath(username: string, sinceYear: number): string {
  return path.join(STATIC_DIR, `${username.toLowerCase()}-${sinceYear}.json`)
}

function readStatic(username: string, sinceYear: number): unknown | null {
  const staticPath = getStaticPath(username, sinceYear)
  
  try {
    if (!fs.existsSync(staticPath)) return null
    const data = fs.readFileSync(staticPath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

function readCache(username: string, sinceYear: number): unknown | null {
  const cachePath = getCachePath(username, sinceYear)
  
  try {
    if (!fs.existsSync(cachePath)) return null
    
    const stat = fs.statSync(cachePath)
    const ageMs = Date.now() - stat.mtimeMs
    
    if (ageMs > CACHE_TTL_MS) {
      fs.unlinkSync(cachePath)
      return null
    }
    
    const data = fs.readFileSync(cachePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

function writeCache(username: string, sinceYear: number, data: unknown): void {
  const cachePath = getCachePath(username, sinceYear)
  
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(cachePath, JSON.stringify(data))
  } catch (err) {
    console.error('Cache write error:', err)
  }
}

function getSinceYearFromConfig(): number {
  try {
    const configPath = path.join(process.cwd(), 'config', 'graph.yaml')
    if (fs.existsSync(configPath)) {
      const yaml = require('yaml')
      const content = fs.readFileSync(configPath, 'utf-8')
      const config = yaml.parse(content)
      return config.sinceYear ?? DEFAULT_SINCE_YEAR
    }
  } catch {
    // Fall through
  }
  return DEFAULT_SINCE_YEAR
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const searchParams = request.nextUrl.searchParams
  
  const configSinceYear = process.env.SINCE_YEAR 
    ? parseInt(process.env.SINCE_YEAR, 10) 
    : getSinceYearFromConfig()
  
  const sinceYear = searchParams.has('sinceYear')
    ? parseInt(searchParams.get('sinceYear')!, 10)
    : configSinceYear
  
  const forceRefresh = searchParams.get('refresh') === 'true'
  
  if (!username || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)) {
    return NextResponse.json(
      { error: 'Invalid username' },
      { status: 400 }
    )
  }
  
  if (!forceRefresh) {
    const staticData = readStatic(username, sinceYear)
    if (staticData) {
      return NextResponse.json(staticData)
    }
    
    const cached = readCache(username, sinceYear)
    if (cached) {
      return NextResponse.json(cached)
    }
  }
  
  try {
    const token = process.env.GITHUB_TOKEN
    
    const graphData = await generateGraph({
      username,
      sinceYear,
      token
    })
    
    writeCache(username, sinceYear, graphData)
    
    return NextResponse.json(graphData)
  } catch (error) {
    console.error('Graph generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate graph' },
      { status: 500 }
    )
  }
}
