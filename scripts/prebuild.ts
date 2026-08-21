import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const configPath = path.join(process.cwd(), 'config', 'graph.yaml')
  
  let sinceYear = 2024
  let defaultUsername = 'JulioMCruz'
  
  if (fs.existsSync(configPath)) {
    const yaml = require('yaml')
    const content = fs.readFileSync(configPath, 'utf-8')
    const config = yaml.parse(content)
    sinceYear = parseInt(process.env.SINCE_YEAR || config.sinceYear || '2024', 10)
    defaultUsername = process.env.DEFAULT_USERNAME || config.defaultUsername || 'JulioMCruz'
  }
  
  const token = process.env.GITHUB_TOKEN || ''
  
  console.log('═══════════════════════════════════════════════════════')
  console.log('  Prebuild: Generating Default Graph JSON')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  Username: ${defaultUsername}`)
  console.log(`  sinceYear: ${sinceYear} (activity on or after Jan 1, ${sinceYear})`)
  console.log(`  Auth: ${token ? 'Yes' : 'No (rate limits apply)'}`)
  console.log('═══════════════════════════════════════════════════════\n')
  
  const { generateGraph } = await import('../src/lib/graph-generator')
  
  const graphData = await generateGraph({
    username: defaultUsername,
    sinceYear,
    token,
    onProgress: (msg) => console.log(msg)
  })
  
  const outputDir = path.join(process.cwd(), 'public', 'data')
  const outputPath = path.join(outputDir, `${defaultUsername.toLowerCase()}-${sinceYear}.json`)
  
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(graphData, null, 2))
  
  const cacheDir = path.join(process.cwd(), '.cache', 'graphs')
  const cachePath = path.join(cacheDir, `${defaultUsername.toLowerCase()}-${sinceYear}.json`)
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(cachePath, JSON.stringify(graphData))
  
  console.log(`\n═══════════════════════════════════════════════════════`)
  console.log(`  Prebuild Complete`)
  console.log(`═══════════════════════════════════════════════════════`)
  console.log(`  Repos in window: ${graphData.metadata.totalNodes - graphData.metadata.externalNodes}`)
  console.log(`    Owned: ${graphData.metadata.ownedRepos}`)
  console.log(`    Org (touched): ${graphData.metadata.orgRepos}`)
  console.log(`    Contributed: ${graphData.metadata.contributedRepos}`)
  console.log(`  External refs: ${graphData.metadata.externalNodes}`)
  console.log(`  Edges: ${graphData.metadata.totalEdges}`)
  console.log(`\n  Static: ${outputPath}`)
  console.log(`  Cache: ${cachePath}`)
  console.log('═══════════════════════════════════════════════════════\n')
}

main().catch((err) => {
  console.error('Prebuild failed:', err)
  process.exit(1)
})
