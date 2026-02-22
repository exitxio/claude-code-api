# claude-code-api

Claude Code automation engine as an HTTP API. \
Runs the Claude Code CLI agent via the Agent SDK with a worker pool, queue, and multi-turn sessions.

## Architecture

```
curl / bot / claude-code-web
    ↓ HTTP (x-api-key or Bearer token)
claude-code-api (worker pool + queue)
    ↓ Agent SDK
Claude Code CLI (agent execution)
```

## Quick Start

```bash
git clone https://github.com/exitxio/claude-code-api.git
cd claude-code-api
cp .env.example .env
# Edit .env — set NEXTAUTH_SECRET and API_KEYS

docker compose up --build
```

Health check:
```bash
curl http://localhost:8080/health
```

## Authentication

Two authentication methods are supported (checked in order):

### 1. API Key (`x-api-key` header)

Set `API_KEYS` env var with comma-separated keys:

```env
# Simple — userId defaults to "api"
API_KEYS=sk-my-secret-key

# Prefixed — userId derived from prefix
API_KEYS=myapp:sk-key1,bot:sk-key2
```

```bash
curl -X POST http://localhost:8080/run \
  -H "x-api-key: sk-my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is 2+2?"}'
```

### 2. HMAC Bearer Token

Used by [claude-code-web](https://github.com/exitxio/claude-code-web) for internal communication. Requires `NEXTAUTH_SECRET` to be shared between api and web.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Health check — worker pool status |
| `POST` | `/run` | Yes | Execute a prompt |
| `GET` | `/status` | Yes | Detailed queue and session status |
| `DELETE` | `/session` | Yes | Close a named session |
| `GET` | `/user-claude` | Yes | Read user's CLAUDE.md |
| `PUT` | `/user-claude` | Yes | Save user's CLAUDE.md |
| `GET` | `/auth/status` | Yes | Claude OAuth status |
| `POST` | `/auth/login` | Yes | Start Claude OAuth flow |
| `POST` | `/auth/exchange` | Yes | Complete Claude OAuth flow |

### POST /run

```json
{
  "prompt": "Explain this code",
  "sessionId": "optional-session-id",
  "timeoutMs": 120000
}
```

Response:
```json
{
  "success": true,
  "output": "This code does...",
  "durationMs": 5432,
  "timedOut": false
}
```

- Without `sessionId`: uses a stateless worker from the pool (one-shot)
- With `sessionId`: creates/reuses a persistent session with conversation history

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXTAUTH_SECRET` | **required** | Secret for HMAC token verification |
| `API_KEYS` | — | Comma-separated API keys (see Authentication) |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Claude model to use |
| `AUTOMATION_POOL_SIZE` | `1` | Number of pre-warmed workers |
| `AUTOMATION_PORT` | `8080` | Server port |
| `USE_CLAUDE_API_KEY` | — | Set to `1` to use `ANTHROPIC_API_KEY` instead of OAuth |

## Claude Authentication

By default, the server uses Claude OAuth (subscription-based). Credentials are stored in a Docker volume (`claude-auth`).

**Option A: OAuth (subscription)** — Use the `/auth/login` + `/auth/exchange` endpoints, or the claude-code-web UI.

**Option B: API key** — Set `ANTHROPIC_API_KEY` and `USE_CLAUDE_API_KEY=1` in environment.

## Use with claude-code-web

In your `claude-code-web` `docker-compose.yml`, the `api` service uses this image:

```yaml
services:
  api:
    image: ghcr.io/exitxio/claude-code-api:latest
    # ...
```

See the [claude-code-web README](https://github.com/exitxio/claude-code-web) for the full setup.

## Development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

## License

MIT
