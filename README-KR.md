# claude-code-api

Claude Code 에이전트 HTTP API. \
Agent SDK를 통해 Claude Code CLI 에이전트를 워커 풀, 큐, 멀티턴 세션으로 운영합니다.

## 아키텍처

```
curl / 봇 / claude-code-web
    ↓ HTTP (x-api-key 또는 Bearer 토큰)
claude-code-api (워커 풀 + 큐)
    ↓ Agent SDK
Claude Code CLI (에이전트 실행)
```

## 빠른 시작

### 1. 환경 설정

```bash
git clone https://github.com/exitxio/claude-code-api.git
cd claude-code-api
cp .env.example .env
# .env 편집 — NEXTAUTH_SECRET 설정 (필수)
```

시크릿 생성:
```bash
openssl rand -base64 32
```

### 2. Docker Compose로 실행

```bash
pnpm docker:up
```

| 스크립트 | 동작 |
|----------|------|
| `pnpm docker:up` | 빌드 & 컨테이너 시작 |
| `pnpm docker:down` | 컨테이너 중지 |
| `pnpm docker:logs` | 컨테이너 로그 추적 |
| `pnpm docker:prod` | GHCR 이미지로 시작 |

### 3. 헬스체크

```bash
curl http://localhost:8080/health
```

### Docker 이미지 (단독 실행)

```bash
docker run -d -p 8080:8080 \
  -e NEXTAUTH_SECRET=your-secret \
  -e API_KEYS=sk-my-secret-key \
  -v claude-auth:/home/node/.claude \
  -v agent-home:/home/node/users \
  ghcr.io/exitxio/claude-code-api:latest
```

## 인증

두 가지 인증 방식을 지원합니다 (순서대로 확인):

### 1. API Key (`x-api-key` 헤더)

`API_KEYS` 환경변수에 쉼표로 구분된 키 설정:

```env
# 단순 키 — userId는 "api"로 기본 설정
API_KEYS=sk-my-secret-key

# 접두사 키 — userId가 접두사에서 파생
API_KEYS=myapp:sk-key1,bot:sk-key2
```

```bash
curl -X POST http://localhost:8080/run \
  -H "x-api-key: sk-my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "2+2는?"}'
```

### 2. HMAC Bearer 토큰

[claude-code-web](https://github.com/exitxio/claude-code-web)과의 내부 통신에 사용. api와 web 간 `NEXTAUTH_SECRET`이 동일해야 합니다.

## API 엔드포인트

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| `GET` | `/health` | 불필요 | 헬스체크 — 워커 풀 상태 |
| `POST` | `/run` | 필요 | 프롬프트 실행 |
| `GET` | `/status` | 필요 | 큐 및 세션 상세 상태 |
| `DELETE` | `/session` | 필요 | 이름 지정 세션 종료 |
| `GET` | `/user-claude` | 필요 | 사용자 CLAUDE.md 읽기 |
| `PUT` | `/user-claude` | 필요 | 사용자 CLAUDE.md 저장 |
| `GET` | `/auth/status` | 필요 | Claude OAuth 상태 |
| `POST` | `/auth/login` | 필요 | Claude OAuth 플로우 시작 |
| `POST` | `/auth/exchange` | 필요 | Claude OAuth 플로우 완료 |

### POST /run

```json
{
  "prompt": "이 코드를 설명해줘",
  "sessionId": "optional-session-id",
  "timeoutMs": 120000
}
```

응답:
```json
{
  "success": true,
  "output": "이 코드는...",
  "durationMs": 5432,
  "timedOut": false
}
```

- `sessionId` 없이: 워커 풀에서 stateless 워커 사용 (단발성)
- `sessionId` 포함: 대화 히스토리가 유지되는 영구 세션 생성/재사용

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `NEXTAUTH_SECRET` | **필수** | HMAC 토큰 검증 시크릿 |
| `API_KEYS` | — | 쉼표로 구분된 API 키 (인증 섹션 참고) |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | 사용할 Claude 모델 |
| `POOL_SIZE` | `1` | 사전 워밍 워커 수 |
| `PORT` | `8080` | 호스트 포트 매핑 |
| `USE_CLAUDE_API_KEY` | — | `1`로 설정 시 OAuth 대신 `ANTHROPIC_API_KEY` 사용 |

## Claude 인증

기본적으로 Claude OAuth(구독 기반)를 사용합니다. 자격증명은 Docker 볼륨(`claude-auth`)에 저장됩니다.

**방법 A: OAuth (구독)** — `/auth/login` + `/auth/exchange` 엔드포인트 또는 claude-code-web UI 사용.

**방법 B: API 키** — 환경변수에 `ANTHROPIC_API_KEY`와 `USE_CLAUDE_API_KEY=1` 설정.

## claude-code-web과 네트워크 연결

claude-code-api와 claude-code-web은 **별도의** Docker Compose 스택으로 실행되며, 공유 Docker 네트워크로 연결됩니다.

```
claude-code-api (포트 8080)  ──┐
                                ├── exitx 네트워크
claude-code-web (포트 3000)  ──┘
```

**claude-code-api**가 `exitx` 네트워크를 생성하고 소유합니다:

```yaml
# claude-code-api/docker-compose.yml
networks:
  exitx:
    name: exitx
    driver: bridge
```

**claude-code-web**은 external로 참조합니다:

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

**실행 순서:** api 먼저, web 나중.

```bash
# 1. API 시작
cd claude-code-api && pnpm docker:up

# 2. Web 시작
cd claude-code-web && pnpm docker:up
```

## 단독 사용

### curl 사용법

헬스체크 (인증 불필요):
```bash
curl http://localhost:8080/health
```

단발성 프롬프트:
```bash
curl -X POST http://localhost:8080/run \
  -H "x-api-key: sk-my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "2+2는?"}'
# {"success":true,"output":"4입니다.","durationMs":1116,"timedOut":false}
```

멀티턴 대화 (동일 `sessionId` 사용):
```bash
curl -X POST http://localhost:8080/run \
  -H "x-api-key: sk-my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "내 이름은 Alice야.", "sessionId": "session-1"}'

curl -X POST http://localhost:8080/run \
  -H "x-api-key: sk-my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "내 이름이 뭐야?", "sessionId": "session-1"}'
# {"success":true,"output":"이름은 Alice입니다.","durationMs":...}
```

상태 확인:
```bash
curl http://localhost:8080/status \
  -H "x-api-key: sk-my-secret-key"
```

## 프로덕션

`docker-compose.prod.yml`로 리소스 제한 및 로그 로테이션 적용:

```bash
pnpm docker:prod
```

## 개발 환경

```bash
pnpm install
# 환경변수 설정 (NEXTAUTH_SECRET 등)
pnpm dev
```

## 라이선스

MIT
