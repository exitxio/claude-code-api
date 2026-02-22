# claude-code-api

Claude Code agent as an HTTP API. \
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

### 1. Configure environment

```bash
git clone https://github.com/exitxio/claude-code-api.git
cd claude-code-api
cp .env.example .env
# Edit .env — set NEXTAUTH_SECRET (required)
```

Generate a secret:
```bash
openssl rand -base64 32
```

### 2. Run with Docker Compose

```bash
pnpm docker:up
```

| Script | Command |
|--------|---------|
| `pnpm docker:up` | Build & start containers |
| `pnpm docker:down` | Stop containers |
| `pnpm docker:logs` | Follow container logs |
| `pnpm docker:prod` | Start with pre-built GHCR image |

### 3. Health check

```bash
curl http://localhost:8080/health
```

### Docker image (standalone)

```bash
docker run -d -p 8080:8080 \
  -e NEXTAUTH_SECRET=your-secret \
  -e API_KEYS=sk-my-secret-key \
  -v claude-auth:/home/node/.claude \
  -v agent-home:/home/node/users \
  ghcr.io/exitxio/claude-code-api:latest
```

## Authentication

Two authentication methods are supported (checked in order):

### 1. API Key (`x-api-key` header)

Set `API_KEYS` env var with comma-separated keys:

```env
# Simple — userId defaults to "api"
API_KEYS=sk-my-secret-key

# Prefixed — userId derived from prefix (prefix:key)
# "myapp" and "bot" become the userId for each key
API_KEYS=myapp:sk-key1,bot:sk-key2
```

> **Note:** The `x-api-key` header takes **only the key part**, not the prefix. The prefix is only used in the env var to map keys to userIds.

```bash
# If API_KEYS=myapp:sk-key1 → send sk-key1, not myapp:sk-key1
curl -X POST http://localhost:8080/run \
  -H "x-api-key: sk-key1" \
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
| `POOL_SIZE` | `1` | Number of pre-warmed workers |
| `PORT` | `8080` | Host port mapping |
| `USE_CLAUDE_API_KEY` | — | Set to `1` to use `ANTHROPIC_API_KEY` instead of OAuth |

## Claude Authentication

By default, the server uses Claude OAuth (subscription-based). Credentials are stored in a Docker volume (`claude-auth`).

**Option A: OAuth (subscription)** — Use the `/auth/login` + `/auth/exchange` endpoints, or the claude-code-web UI.

**Option B: API key** — Set `ANTHROPIC_API_KEY` and `USE_CLAUDE_API_KEY=1` in environment.

## Networking with claude-code-web

claude-code-api and claude-code-web run as **separate** Docker Compose stacks, connected via a shared Docker network.

```
claude-code-api (port 8080)  ──┐
                                ├── exitx network
claude-code-web (port 3000)  ──┘
```

**claude-code-api** creates and owns the `exitx` network:

```yaml
# claude-code-api/docker-compose.yml
networks:
  exitx:
    name: exitx
    driver: bridge
```

**claude-code-web** joins as external:

```yaml
# claude-code-web/docker-compose.yml
services:
  web:
    environment:
      - AUTOMATION_SERVER_URL=http://claude-code-api:8080
    networks:
      - exitx

networks:
  exitx:
    external: true
```

**Start order:** api first, then web.

```bash
# 1. Start API
cd claude-code-api && pnpm docker:up

# 2. Start Web
cd claude-code-web && pnpm docker:up
```

## Standalone Usage

### curl examples

Health check (no auth required):
```bash
curl http://localhost:8080/health
```

Single-shot prompt:
```bash
curl -X POST http://localhost:8080/run \
  -H "x-api-key: sk-my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is 2+2?"}'
# {"success":true,"output":"Four.","durationMs":1116,"timedOut":false}
```

Multi-turn conversation (use the same `sessionId`):
```bash
curl -X POST http://localhost:8080/run \
  -H "x-api-key: sk-my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "My name is Alice.", "sessionId": "session-1"}'

curl -X POST http://localhost:8080/run \
  -H "x-api-key: sk-my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is my name?", "sessionId": "session-1"}'
# {"success":true,"output":"Your name is Alice.","durationMs":...}
```

Check status:
```bash
curl http://localhost:8080/status \
  -H "x-api-key: sk-my-secret-key"
```

## Production

Use `docker-compose.prod.yml` for production deployment with resource limits and log rotation:

```bash
pnpm docker:prod
```

## Development

```bash
pnpm install
# Set env vars (NEXTAUTH_SECRET, etc.)
pnpm dev
```

## License

MIT
