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
  isContribution?: boolean
  relationship: 'owned' | 'org-member' | 'contributed'
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

export const DEFAULT_SINCE_YEAR = 2024

const TEMP_COLORS = {
  hot: '#FF4A2A',
  warm: '#FF8F3A',
  cooling: '#E6B35A',
  cool: '#4F8CA8',
  cold: '#3A4F8C'
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const TEMP_DAYS = {
  hot: 7,
  warm: 30,
  cooling: 90,
  cool: 365
}

function calculateWeight(commits: number, stars: number, forks: number): number {
  return Math.log(1 + commits) + 1.2 * Math.log(1 + stars) + Math.log(1 + forks)
}

function calculateRadius(weight: number): number {
  const minRadius = 4
  const maxRadius = 14
  const sqrtWeight = Math.sqrt(weight)
  return Math.max(minRadius, Math.min(maxRadius, minRadius + sqrtWeight))
}

type TempCategory = 'hot' | 'warm' | 'cooling' | 'cool' | 'cold'

function calculateTemperatureCategory(pushedAt: string | null, sinceDate: Date, now: Date): TempCategory {
  if (!pushedAt) return 'cold'
  
  const pushDate = new Date(pushedAt)
  if (pushDate < sinceDate) return 'cold'
  
  const ageMs = now.getTime() - pushDate.getTime()
  const ageDays = ageMs / MS_PER_DAY
  
  if (ageDays <= TEMP_DAYS.hot) return 'hot'
  if (ageDays <= TEMP_DAYS.warm) return 'warm'
  if (ageDays <= TEMP_DAYS.cooling) return 'cooling'
  if (ageDays <= TEMP_DAYS.cool) return 'cool'
  return 'cold'
}

function tempCategoryToValue(category: TempCategory): number {
  switch (category) {
    case 'hot': return 1.0
    case 'warm': return 0.75
    case 'cooling': return 0.5
    case 'cool': return 0.25
    case 'cold': return 0.1
  }
}

function temperatureToColor(category: TempCategory): string {
  return TEMP_COLORS[category]
}

function temperatureToOpacity(category: TempCategory, isArchived: boolean): number {
  if (isArchived) return 0.45
  switch (category) {
    case 'hot':
    case 'warm':
      return 1.0
    case 'cooling':
      return 0.85
    case 'cool':
    case 'cold':
      return 0.55
  }
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
  
  const actualCommits = commits ?? 0
  const weight = calculateWeight(actualCommits, repo.stargazers_count, repo.forks_count)
  const tempCategory = calculateTemperatureCategory(repo.pushed_at, sinceDate, now)
  const temperature = tempCategoryToValue(tempCategory)
  
  return {
    id: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    commits: actualCommits,
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
    radius: calculateRadius(weight),
    temperature,
    color: temperatureToColor(tempCategory),
    opacity: temperatureToOpacity(tempCategory, repo.archived),
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
  
  const validEdges = edges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
  
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
      totalEdges: validEdges.length,
      missingCommitCounts
    }
  }
}
