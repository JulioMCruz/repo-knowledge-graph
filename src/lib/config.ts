import * as fs from 'fs'
import * as path from 'path'

interface GraphConfig {
  sinceYear: number
  defaultUsername: string
  cacheTtlMs: number
}

let cachedConfig: GraphConfig | null = null

export function getConfig(): GraphConfig {
  if (cachedConfig) return cachedConfig
  
  const configPath = path.join(process.cwd(), 'config', 'graph.yaml')
  
  let fileConfig: Partial<GraphConfig> = {}
  
  if (fs.existsSync(configPath)) {
    try {
      const yaml = require('yaml')
      const content = fs.readFileSync(configPath, 'utf-8')
      fileConfig = yaml.parse(content) as Partial<GraphConfig>
    } catch {
      console.warn('Failed to parse config/graph.yaml, using defaults')
    }
  }
  
  cachedConfig = {
    sinceYear: process.env.SINCE_YEAR 
      ? parseInt(process.env.SINCE_YEAR, 10) 
      : fileConfig.sinceYear ?? 2024,
    defaultUsername: process.env.DEFAULT_USERNAME 
      || fileConfig.defaultUsername 
      || 'JulioMCruz',
    cacheTtlMs: fileConfig.cacheTtlMs ?? 3600000
  }
  
  return cachedConfig
}

export function getSinceDate(sinceYear: number): Date {
  return new Date(`${sinceYear}-01-01T00:00:00Z`)
}
