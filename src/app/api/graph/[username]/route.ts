import { NextRequest, NextResponse } from 'next/server'
import { generateGraph } from '@/lib/graph-generator'
import * as fs from 'fs'
import * as path from 'path'

const CACHE_DIR = path.join(process.cwd(), '.cache', 'graphs')
const CACHE_TTL_MS = 1000 * 60 * 60

function getCachePath(username: string, sinceYear: number): string {
  return path.join(CACHE_DIR, `${username.toLowerCase()}-${sinceYear}.json`)
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const searchParams = request.nextUrl.searchParams
  const sinceYear = parseInt(searchParams.get('sinceYear') || '2024', 10)
  const forceRefresh = searchParams.get('refresh') === 'true'
  
  if (!username || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)) {
    return NextResponse.json(
      { error: 'Invalid username' },
      { status: 400 }
    )
  }
  
  if (!forceRefresh) {
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
