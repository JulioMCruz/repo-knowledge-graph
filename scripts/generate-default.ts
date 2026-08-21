import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'

const configPath = path.join(process.cwd(), 'config', 'graph.yaml')

interface Config {
  sinceYear?: number
  defaultUsername?: string
}

let config: Config = {}
if (fs.existsSync(configPath)) {
  const content = fs.readFileSync(configPath, 'utf-8')
  config = yaml.parse(content) as Config
}

const SINCE_YEAR = process.env.SINCE_YEAR 
  ? parseInt(process.env.SINCE_YEAR, 10) 
  : config.sinceYear ?? 2024

const USERNAME = process.env.USERNAME || config.defaultUsername || 'JulioMCruz'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  Precomputing Graph for Default User')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  Username: ${USERNAME}`)
  console.log(`  Since Year: ${SINCE_YEAR}`)
  console.log(`  Auth: ${GITHUB_TOKEN ? 'Yes' : 'No (rate limits apply)'}`)
  console.log('═══════════════════════════════════════════════════════\n')
  
  const { generateGraph } = await import('../src/lib/graph-generator')
  
  const graphData = await generateGraph({
    username: USERNAME,
    sinceYear: SINCE_YEAR,
    token: GITHUB_TOKEN,
    onProgress: (msg) => console.log(msg)
  })
  
  const cacheDir = path.join(process.cwd(), '.cache', 'graphs')
  const cachePath = path.join(cacheDir, `${USERNAME.toLowerCase()}-${SINCE_YEAR}.json`)
  
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(cachePath, JSON.stringify(graphData, null, 2))
  
  console.log(`\n═══════════════════════════════════════════════════════`)
  console.log(`  Generation Complete`)
  console.log(`═══════════════════════════════════════════════════════`)
  console.log(`  Total repos: ${graphData.metadata.totalNodes}`)
  console.log(`    Owned: ${graphData.metadata.ownedRepos}`)
  console.log(`    Org: ${graphData.metadata.orgRepos}`)
  console.log(`    Contributed: ${graphData.metadata.contributedRepos}`)
  console.log(`    External: ${graphData.metadata.externalNodes}`)
  console.log(`  Edges: ${graphData.metadata.totalEdges}`)
  console.log(`\n  Cached to: ${cachePath}`)
  console.log('═══════════════════════════════════════════════════════\n')
}

main().catch(console.error)
