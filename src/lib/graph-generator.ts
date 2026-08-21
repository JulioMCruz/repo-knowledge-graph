import {
  fetchUserRepos,
  fetchUserOrgs,
  fetchOrgRepos,
  fetchRepoDetails,
  fetchCommitCount,
  searchUserCommits,
  checkUserCommittedToRepo,
  sleep,
  type RawRepo
} from './github'

export interface GraphNode {
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
  updatedAt: string
  createdAt: string
  isArchived: boolean
  isFork: boolean
  parentRepo?: string
  defaultBranch: string
  language: string | null
  topics: string[]
  weight: number
  radius: number
  temperature: number
  color: string
  opacity: number
  isExternal?: boolean
  isContribution?: boolean
  relationship: 'owned' | 'org-member' | 'contributed' | 'external'
}

export interface GraphEdge {
  source: string
  target: string
  type: 'fork' | 'tech' | 'contribution' | 'org-member'
  label?: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphEdge[]
  metadata: {
    username: string
    generatedAt: string
    sinceYear: number
    sinceDate: string
    totalNodes: number
    ownedRepos: number
    orgRepos: number
    contributedRepos: number
    externalNodes: number
    totalEdges: number
    missingCommitCounts: number
  }
}

export interface GenerateOptions {
  username: string
  sinceYear?: number
  token?: string
  onProgress?: (message: string) => void
}

const DEFAULT_SINCE_YEAR = 2024

const TEMP_COLORS = {
  hot: '#FF4A2A',
  warm: '#FF8F3A',
  cooling: '#E6B35A',
  cool: '#4F8CA8',
  cold: '#3A4F8C'
}

function calculateWeight(commits: number, stars: number, forks: number): number {
  return Math.log(1 + commits) + 1.2 * Math.log(1 + stars) + Math.log(1 + forks)
}

function calculateRadius(
  weight: number,
  minWeight: number,
  maxWeight: number,
  isExternal: boolean
): number {
  const minRadius = isExternal ? 2 : 4
  const maxRadius = isExternal ? 6 : 14
  
  if (maxWeight === minWeight) return (minRadius + maxRadius) / 2
  
  const normalizedWeight = (weight - minWeight) / (maxWeight - minWeight)
  return minRadius + Math.sqrt(normalizedWeight) * (maxRadius - minRadius)
}

function calculateTemperature(pushedAt: string | null, sinceDate: Date, now: Date): number {
  if (!pushedAt) return 0
  
  const pushDate = new Date(pushedAt)
  if (pushDate < sinceDate) return 0
  
  const windowMs = now.getTime() - sinceDate.getTime()
  const ageMs = now.getTime() - pushDate.getTime()
  
  return Math.max(0, 1 - (ageMs / windowMs))
}

function temperatureToColor(temperature: number): string {
  if (temperature >= 0.85) return TEMP_COLORS.hot
  if (temperature >= 0.6) return TEMP_COLORS.warm
  if (temperature >= 0.35) return TEMP_COLORS.cooling
  if (temperature >= 0.15) return TEMP_COLORS.cool
  return TEMP_COLORS.cold
}

function temperatureToOpacity(temperature: number, isExternal: boolean): number {
  if (isExternal) return 0.55
  if (temperature >= 0.6) return 1.0
  if (temperature >= 0.3) return 0.85
  return 0.55
}

function isRepoLive(repo: RawRepo, sinceDate: Date): boolean {
  if (repo.archived) return false
  const pushedAt = repo.pushed_at ? new Date(repo.pushed_at) : null
  if (!pushedAt) return false
  return pushedAt >= sinceDate
}

async function createNode(
  repo: RawRepo,
  relationship: GraphNode['relationship'],
  sinceDate: Date,
  now: Date,
  token?: string
): Promise<GraphNode> {
  const commits = await fetchCommitCount(
    repo.owner.login,
    repo.name,
    repo.default_branch,
    token
  )
  
  const weight = calculateWeight(commits || 0, repo.stargazers_count, repo.forks_count)
  const temperature = calculateTemperature(repo.pushed_at, sinceDate, now)
  const isExternal = relationship === 'external'
  
  return {
    id: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    commits: commits || 0,
    commitsMissing: commits === null,
    pushedAt: repo.pushed_at,
    updatedAt: repo.updated_at,
    createdAt: repo.created_at,
    isArchived: repo.archived,
    isFork: repo.fork,
    parentRepo: repo.parent?.full_name,
    defaultBranch: repo.default_branch,
    language: repo.language,
    topics: repo.topics || [],
    weight,
    radius: 0,
    temperature,
    color: temperatureToColor(temperature),
    opacity: temperatureToOpacity(temperature, isExternal),
    isExternal,
    isContribution: relationship === 'contributed',
    relationship
  }
}

export async function generateGraph(options: GenerateOptions): Promise<GraphData> {
  const { username, sinceYear = DEFAULT_SINCE_YEAR, token, onProgress } = options
  
  const log = (msg: string) => {
    console.log(msg)
    onProgress?.(msg)
  }
  
  const sinceDate = new Date(`${sinceYear}-01-01T00:00:00Z`)
  const now = new Date()
  
  log(`Generating graph for @${username} (since ${sinceYear})...`)
  
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeSet = new Set<string>()
  const processedOrgRepos = new Set<string>()
  let missingCommitCounts = 0
  let ownedCount = 0
  let orgCount = 0
  let contributedCount = 0
  let externalCount = 0
  
  log('Fetching user repos...')
  const userRepos = await fetchUserRepos(username, token)
  const liveUserRepos = userRepos.filter(r => !r.private && isRepoLive(r, sinceDate))
  
  for (const repo of liveUserRepos) {
    if (nodeSet.has(repo.full_name)) continue
    nodeSet.add(repo.full_name)
    
    log(`Processing owned: ${repo.full_name}`)
    const node = await createNode(repo, 'owned', sinceDate, now, token)
    if (node.commitsMissing) missingCommitCounts++
    nodes.push(node)
    ownedCount++
    
    if (repo.fork && repo.parent?.full_name) {
      edges.push({
        source: repo.full_name,
        target: repo.parent.full_name,
        type: 'fork',
        label: 'forked from'
      })
    }
    
    await sleep(50)
  }
  
  log('Fetching user orgs...')
  const orgs = await fetchUserOrgs(username, token)
  
  for (const org of orgs) {
    log(`Checking org: ${org.login}`)
    const orgRepos = await fetchOrgRepos(org.login, token)
    const liveOrgRepos = orgRepos.filter(r => !r.private && isRepoLive(r, sinceDate))
    
    for (const repo of liveOrgRepos) {
      if (nodeSet.has(repo.full_name)) continue
      if (processedOrgRepos.has(repo.full_name)) continue
      processedOrgRepos.add(repo.full_name)
      
      const userCommitted = await checkUserCommittedToRepo(
        username,
        repo.full_name,
        sinceDate,
        token
      )
      
      if (userCommitted) {
        nodeSet.add(repo.full_name)
        log(`Processing org repo: ${repo.full_name}`)
        const node = await createNode(repo, 'org-member', sinceDate, now, token)
        if (node.commitsMissing) missingCommitCounts++
        nodes.push(node)
        orgCount++
        
        if (repo.fork && repo.parent?.full_name) {
          edges.push({
            source: repo.full_name,
            target: repo.parent.full_name,
            type: 'fork',
            label: 'forked from'
          })
        }
      }
      
      await sleep(100)
    }
  }
  
  log('Searching for external contributions...')
  const contributedRepos = await searchUserCommits(username, sinceDate, token)
  
  for (const repoFullName of contributedRepos) {
    if (nodeSet.has(repoFullName)) continue
    
    const repo = await fetchRepoDetails(repoFullName, token)
    if (!repo || repo.private) continue
    if (!isRepoLive(repo, sinceDate)) continue
    
    nodeSet.add(repoFullName)
    log(`Processing contribution: ${repoFullName}`)
    const node = await createNode(repo, 'contributed', sinceDate, now, token)
    if (node.commitsMissing) missingCommitCounts++
    nodes.push(node)
    contributedCount++
    
    if (repo.fork && repo.parent?.full_name) {
      edges.push({
        source: repoFullName,
        target: repo.parent.full_name,
        type: 'fork',
        label: 'forked from'
      })
    }
    
    await sleep(50)
  }
  
  const forkTargets = new Set<string>()
  for (const node of nodes) {
    if (node.parentRepo && !nodeSet.has(node.parentRepo)) {
      forkTargets.add(node.parentRepo)
    }
  }
  
  for (const parentFullName of forkTargets) {
    const repo = await fetchRepoDetails(parentFullName, token)
    if (!repo) continue
    
    nodeSet.add(parentFullName)
    log(`Processing external: ${parentFullName}`)
    const node = await createNode(repo, 'external', sinceDate, now, token)
    if (node.commitsMissing) missingCommitCounts++
    nodes.push(node)
    externalCount++
    
    await sleep(50)
  }
  
  const validEdges = edges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
  
  const primaryNodes = nodes.filter(n => !n.isExternal)
  const externalNodes = nodes.filter(n => n.isExternal)
  
  if (primaryNodes.length > 0) {
    const weights = primaryNodes.map(n => n.weight)
    const minWeight = Math.min(...weights)
    const maxWeight = Math.max(...weights)
    
    for (const node of primaryNodes) {
      node.radius = calculateRadius(node.weight, minWeight, maxWeight, false)
    }
  }
  
  if (externalNodes.length > 0) {
    const weights = externalNodes.map(n => n.weight)
    const minWeight = Math.min(...weights)
    const maxWeight = Math.max(...weights)
    
    for (const node of externalNodes) {
      node.radius = calculateRadius(node.weight, minWeight, maxWeight, true)
    }
  }
  
  log('Graph generation complete!')
  
  return {
    nodes,
    links: validEdges,
    metadata: {
      username,
      generatedAt: now.toISOString(),
      sinceYear,
      sinceDate: sinceDate.toISOString(),
      totalNodes: nodes.length,
      ownedRepos: ownedCount,
      orgRepos: orgCount,
      contributedRepos: contributedCount,
      externalNodes: externalCount,
      totalEdges: validEdges.length,
      missingCommitCounts
    }
  }
}
