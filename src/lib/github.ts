const BASE_URL = 'https://api.github.com'
const GRAPHQL_URL = 'https://api.github.com/graphql'

function getHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'repo-knowledge-graph'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  token?: string,
  retries = 3
): Promise<Response> {
  const headers = getHeaders(token)
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { 
        ...options, 
        headers: { ...headers, ...options.headers } 
      })
      
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining')
        if (rateLimitRemaining === '0') {
          const resetTime = response.headers.get('X-RateLimit-Reset')
          const waitTime = resetTime ? (parseInt(resetTime) * 1000 - Date.now() + 1000) : 60000
          console.log(`Rate limited. Waiting ${Math.ceil(waitTime / 1000)}s...`)
          await sleep(Math.min(waitTime, 60000))
          continue
        }
      }
      
      if (response.status === 404) return response
      
      if (!response.ok && i < retries - 1) {
        await sleep((i + 1) * 2000)
        continue
      }
      
      return response
    } catch (error) {
      if (i < retries - 1) {
        await sleep((i + 1) * 2000)
        continue
      }
      throw error
    }
  }
  throw new Error(`Failed after ${retries} retries`)
}

export interface RawRepo {
  id: number
  name: string
  full_name: string
  owner: { login: string }
  html_url: string
  description: string | null
  stargazers_count: number
  forks_count: number
  pushed_at: string | null
  updated_at: string
  created_at: string
  archived: boolean
  fork: boolean
  private?: boolean
  parent?: { full_name: string }
  default_branch: string
  language: string | null
  topics: string[]
}

export interface RawOrg {
  login: string
  id: number
}

export async function fetchUserRepos(username: string, token?: string): Promise<RawRepo[]> {
  const repos: RawRepo[] = []
  let page = 1
  
  while (true) {
    const response = await fetchWithRetry(
      `${BASE_URL}/users/${username}/repos?per_page=100&page=${page}&type=owner`,
      {},
      token
    )
    
    if (!response.ok) break
    
    const data: RawRepo[] = await response.json()
    if (data.length === 0) break
    
    repos.push(...data)
    page++
    await sleep(100)
  }
  
  return repos
}

export async function fetchUserOrgs(username: string, token?: string): Promise<RawOrg[]> {
  const response = await fetchWithRetry(
    `${BASE_URL}/users/${username}/orgs`,
    {},
    token
  )
  
  if (!response.ok) return []
  return await response.json()
}

export async function fetchOrgRepos(org: string, token?: string): Promise<RawRepo[]> {
  const repos: RawRepo[] = []
  let page = 1
  
  while (true) {
    const response = await fetchWithRetry(
      `${BASE_URL}/orgs/${org}/repos?per_page=100&page=${page}&type=all`,
      {},
      token
    )
    
    if (!response.ok) break
    
    const data: RawRepo[] = await response.json()
    if (data.length === 0) break
    
    repos.push(...data)
    page++
    await sleep(100)
  }
  
  return repos
}

export async function fetchRepoDetails(fullName: string, token?: string): Promise<RawRepo | null> {
  const response = await fetchWithRetry(`${BASE_URL}/repos/${fullName}`, {}, token)
  
  if (!response.ok) return null
  return await response.json()
}

export async function fetchCommitCount(
  owner: string, 
  repo: string, 
  branch: string, 
  token?: string
): Promise<number | null> {
  if (token) {
    const query = `
      query($owner: String!, $repo: String!, $branch: String!) {
        repository(owner: $owner, name: $repo) {
          ref(qualifiedName: $branch) {
            target {
              ... on Commit {
                history {
                  totalCount
                }
              }
            }
          }
        }
      }
    `
    
    try {
      const response = await fetchWithRetry(
        GRAPHQL_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            variables: { owner, repo, branch }
          })
        },
        token
      )
      
      if (response.ok) {
        const data = await response.json()
        const count = data?.data?.repository?.ref?.target?.history?.totalCount
        if (count !== undefined) return count
      }
    } catch {
      // Fall through to REST
    }
  }
  
  try {
    const response = await fetchWithRetry(
      `${BASE_URL}/repos/${owner}/${repo}/commits?sha=${branch}&per_page=1`,
      {},
      token
    )
    
    if (!response.ok) return null
    
    const linkHeader = response.headers.get('Link')
    if (!linkHeader) {
      const commits = await response.json()
      return Array.isArray(commits) ? commits.length : null
    }
    
    const lastMatch = linkHeader.match(/page=(\d+)>; rel="last"/)
    if (lastMatch) return parseInt(lastMatch[1])
    
    return null
  } catch {
    return null
  }
}

export async function searchUserCommits(
  username: string,
  sinceDate: Date,
  token?: string
): Promise<string[]> {
  const repos = new Set<string>()
  let page = 1
  const dateStr = sinceDate.toISOString().split('T')[0]
  
  while (page <= 10) {
    const query = `author:${username} committer-date:>=${dateStr}`
    const response = await fetchWithRetry(
      `${BASE_URL}/search/commits?q=${encodeURIComponent(query)}&per_page=100&page=${page}&sort=committer-date`,
      { headers: { 'Accept': 'application/vnd.github.cloak-preview+json' } },
      token
    )
    
    if (!response.ok) break
    
    const data = await response.json()
    if (!data.items || data.items.length === 0) break
    
    for (const item of data.items) {
      if (item.repository?.full_name) {
        repos.add(item.repository.full_name)
      }
    }
    
    if (data.items.length < 100) break
    page++
    await sleep(2000)
  }
  
  return Array.from(repos)
}

export async function checkUserCommittedToRepo(
  username: string,
  repoFullName: string,
  sinceDate: Date,
  token?: string
): Promise<boolean> {
  const [owner, repo] = repoFullName.split('/')
  const dateStr = sinceDate.toISOString().split('T')[0]
  
  const response = await fetchWithRetry(
    `${BASE_URL}/repos/${owner}/${repo}/commits?author=${username}&since=${dateStr}&per_page=1`,
    {},
    token
  )
  
  if (!response.ok) return false
  
  const commits = await response.json()
  return Array.isArray(commits) && commits.length > 0
}

export async function fetchPackageJson(
  owner: string,
  repo: string,
  branch: string,
  token?: string
): Promise<Record<string, unknown> | null> {
  const response = await fetchWithRetry(
    `${BASE_URL}/repos/${owner}/${repo}/contents/package.json?ref=${branch}`,
    {},
    token
  )
  
  if (!response.ok) return null
  
  try {
    const data = await response.json()
    if (data.content) {
      const decoded = Buffer.from(data.content, 'base64').toString('utf-8')
      return JSON.parse(decoded)
    }
  } catch {
    return null
  }
  
  return null
}
