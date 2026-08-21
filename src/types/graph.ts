export interface RepoNode {
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
  nodes: RepoNode[]
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
