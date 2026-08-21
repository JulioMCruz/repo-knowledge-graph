# Repo Map

Interactive 3D visualization of a GitHub user's public work.

## What it shows

Enter a GitHub username to see their contribution map:

- **Owned repos** — public repositories they own
- **Org repos** — repositories in organizations they belong to (only repos they've committed to)
- **Contributions** — external public repos they've committed to

All filtered by `sinceYear` — repos with activity on or after January 1 of that year.

## sinceYear Configuration

The time window is controlled by `sinceYear` (integer, inclusive). A repo is included if its last public activity (`pushed_at` or last default-branch commit) is on or after January 1 of that year.

**Default: 2024** (covers calendar 2024–2026 as of today)

### Config sources (priority order)

1. **Environment variable**: `SINCE_YEAR=2024`
2. **Config file**: `config/graph.yaml`
3. **Query parameter**: `/api/graph/username?sinceYear=2024`

```yaml
# config/graph.yaml
sinceYear: 2024
defaultUsername: JulioMCruz
```

## Visual encoding

### Temperature (color by last push)

Color represents recency of last push **within the sinceYear window**:

| Color | Label | Meaning |
|-------|-------|---------|
| `#FF4A2A` | Hot | This week |
| `#FF8F3A` | Warm | This month |
| `#E6B35A` | Cooling | This quarter |
| `#4F8CA8` | Cool | This year |
| `#3A4F8C` | Cold | Stale (oldest in window) |

Cold = oldest in the live set, not pre-window. Repos before `sinceYear` are excluded entirely.

### Size (activity weight)

```
weight = ln(1 + commits) + 1.2 × ln(1 + stars) + ln(1 + forks)
radius ∝ √weight
```

Commits, stars, and forks are fetched from GitHub — never invented.

## Development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

### Precompute graph JSON (for build)

```bash
# Uses GITHUB_TOKEN env var for higher rate limits
GITHUB_TOKEN=your_token npm run generate

# Or full build with precompute
GITHUB_TOKEN=your_token npm run build:with-data
```

This generates `public/data/juliomcruz-2024.json` which the app loads directly without hitting the API.

## Stack

- Next.js 14 (App Router) + TypeScript
- react-force-graph-3d / Three.js
- Tailwind CSS + IBM Plex Sans/Mono

## Cloudflare deployment (future)

Configuration files are in place for Cloudflare Workers deployment via OpenNext:

- `wrangler.toml` — Workers config
- `open-next.config.ts` — OpenNext adapter

```bash
# Build for Cloudflare
npx opennextjs-cloudflare

# Deploy (requires wrangler auth)
npx wrangler deploy
```

Set `GITHUB_TOKEN` and optionally `SINCE_YEAR` as secrets in Cloudflare dashboard.

## GitHub Action

The included workflow regenerates the default user's graph cache weekly:

- **Schedule**: Sundays at 6 AM UTC
- **Manual**: Workflow dispatch with optional username/sinceYear inputs

---

Built for quick visual assessment of active work — not a vanity star chart.
