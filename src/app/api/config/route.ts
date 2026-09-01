import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'

export async function GET() {
  const config = getConfig()
  
  return NextResponse.json({
    sinceYear: config.sinceYear,
    defaultUsername: config.defaultUsername
  })
}
