# Repo Map

Interactive 3D visualization of a GitHub user's public work.

## What it shows

Enter a GitHub username to see their contribution map:

- **Owned repos** — public repositories they own
- **Org repos** — repositories in organizations they belong to (only repos they've committed to)
- **Contributions** — external public repos they've committed to

All filtered by activity since a configurable year (default: 2024).

## Visual encoding

### Temperature (color)

Color represents recency of last push, relative to the `sinceYear` window:

| Color | Label | Meaning |
|-------|-------|---------|
| `#FF4A2A` | Hot | This week |
| `#FF8F3A` | Warm | This month |
| `#E6B35A` | Cooling | This quarter |
| `#4F8CA8` | Cool | This year |
| `#3A4F8C` | Cold | Stale (oldest in window) |

Cold means "oldest in the live set," not pre-2024 graveyard. Pre-window repos are excluded.

### Size (activity weight)

```
weight = ln(1 + commits) + 1.2 × ln(1 + stars) + ln(1 + forks)
radius ∝ √weight
```

Commits, stars, and forks are fetched from GitHub — never invented.

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

### Pre-generate default graph (optional)

```bash
# Uses GITHUB_TOKEN env var for higher rate limits
GITHUB_TOKEN=your_token npm run generate
```

## Configuration

Edit `config/graph.yaml`:

```yaml
sinceYear: 2024           # Include repos with activity on or after Jan 1 of this year
defaultUsername: JulioMCruz  # Default username shown on load
```

Or use environment variables:

- `SINCE_YEAR` — Override sinceYear
- `GITHUB_TOKEN` — GitHub personal access token (optional, increases rate limits)

## Adding sources

The app dynamically fetches data for any GitHub username. Orgs appear automatically based on the user's membership and contributions.

## Stack

- Next.js 14 (App Router)
- TypeScript
- react-force-graph-3d / Three.js
- Tailwind CSS
- IBM Plex Sans / Mono

## Cloudflare deployment (future)

Configuration files are in place for Cloudflare Workers deployment via OpenNext:

```bash
# Build for Cloudflare
npx opennextjs-cloudflare

# Deploy (requires wrangler auth)
npx wrangler deploy
```

Set `GITHUB_TOKEN` as a secret in Cloudflare dashboard for higher API rate limits.

## GitHub Action

The included workflow regenerates the default user's graph cache weekly and on manual trigger:

- **Schedule**: Sundays at 6 AM UTC
- **Manual**: Workflow dispatch with optional username/year inputs

---

Built for quick visual assessment of active work — not a vanity star chart.
