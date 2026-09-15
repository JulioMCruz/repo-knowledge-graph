import { NextRequest, NextResponse } from 'next/server'
import { generateGraph } from '@/lib/graph-generator'
import { getConfig } from '@/lib/config'
import * as fs from 'fs'
import * as path from 'path'

const STATIC_DIR = path.join(process.cwd(), 'public', 'data')

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const searchParams = request.nextUrl.searchParams
  
  const config = getConfig()
  
  const sinceYear = searchParams.has('sinceYear')
    ? parseInt(searchParams.get('sinceYear')!, 10)
    : config.sinceYear
  
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
  }
  
  try {
    const token = process.env.GITHUB_TOKEN
    
    if (!token) {
      return NextResponse.json(
        { error: 'Graph data not prebuilt. Run `npm run generate` first or provide GITHUB_TOKEN.' },
        { status: 503 }
      )
    }
    
    const graphData = await generateGraph({
      username,
      sinceYear,
      token
    })
    
    return NextResponse.json(graphData)
  } catch (error) {
    console.error('Graph generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate graph' },
      { status: 500 }
    )
  }
}
