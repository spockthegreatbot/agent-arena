# Agency HQ — Security Audit Report

**Auditor:** Cipher (QA & Security, Enjin Studio)
**Date:** 2026-03-18
**Scope:** Pre-public GitHub release audit
**Repo:** `/home/linuxuser/agent-arena`

---

## Summary

| Section | Status | Issues |
|---|---|---|
| 1. Secrets & Credentials | ✅ PASS | — |
| 2. Private Data | ✅ PASS | — |
| 3. API Route Safety | ⚠️ PASS w/ notes | M2, L1, L2, L3 |
| 4. Client Bundle Safety | ✅ PASS | — |
| 5. Dependencies (npm audit) | ⚠️ PASS w/ notes | M3 |
| 6. Build Safety (tsc) | ✅ PASS | — |
| .gitignore completeness | ⚠️ WARN | M1 |

**CRITICAL issues: 0 | HIGH issues: 0 | MEDIUM issues: 3 | LOW issues: 3**

---

## Section 1 — Secrets & Credentials

**Status: ✅ PASS**

- No hardcoded API keys, tokens, passwords, or seed phrases found in any `.ts`, `.tsx`, `.js`, `.mjs`, or `.json` file.
- No `.env` or `.env.local` file committed. Only `.env.example` is tracked (correct behavior).
- `next.config.ts` is empty/clean — no secrets exposed.

**⚠️ M1 — .gitignore missing plain `.env`**
Severity: MEDIUM

The current `.gitignore` pattern is `.env*.local`, which covers `.env.local`, `.env.development.local`, etc. However, a bare `.env` file (without the `.local` suffix) would **not** be excluded and would be committed if created.

```
# current
.env*.local

# missing
.env
```

**Fix:** Add `.env` to `.gitignore`. **→ Applied.**

---

## Section 2 — Private Data

**Status: ✅ PASS**

- No VPS IPs (45.76.x.x, 192.168.x.x, 10.x.x.x, 172.16.x.x) found in any source file.
- No Telegram bot tokens or Telegram IDs found.
- No localhost references in source code.
- No hardcoded absolute filesystem paths that would break on other systems. All paths are resolved via `OPENCLAW_HOME` env var or `path.join(process.env.HOME, '.openclaw')` — portable and correct.

---

## Section 3 — API Route Safety

**Status: ⚠️ PASS with notes**

All four API routes (`/mode`, `/stats`, `/status`, `/activity`) correctly check `isDemoMode()` first and return safe simulated data when running on Vercel or when `ARENA_MODE=demo`. The demo mode guard is solid.

### `/api/agents/mode`
Clean. Returns `{ mode: 'demo' | 'live' }`. No sensitive data.

### `/api/agents/stats`
In demo mode: returns hardcoded dummy stats. ✅
In live mode: returns real CPU load, RAM, disk, uptime, and session count via `execSync` and `fs`. All shell commands are hardcoded literals with no user-supplied input — no injection risk. Error messages are generic (`'Failed to fetch stats'`).

**L3 — Live mode exposes server resource metrics**
Severity: LOW (by design, self-hosted use)
The endpoint exposes real server metrics to anyone with network access. No authentication is required. Acceptable for self-hosted single-user deployments, but operators should be aware. Recommend documenting this in README for self-hosting instructions.

### `/api/agents/status`
In demo mode: returns `getDemoAgentStates()`. ✅

**L1 — Shell interpolation in `isAgentRunning` (status/route.ts:69)**
Severity: LOW (not currently exploitable)

```typescript
execSync(`ps aux | grep -i "agent.*${agentId}" | grep -v grep | head -1`, ...)
```

`agentId` values are all hardcoded constants from `AGENTS` in `agents.ts` (`'main'`, `'dev'`, `'trader'`, etc.) — safe alphanumerics. No external/user input reaches this function. **Not exploitable in current architecture.** However, the pattern is unsafe-by-default; if `agentId` ever came from a request parameter, it would be a command injection vector. Recommend using `spawnSync` with argument arrays as a future-proof hardening measure.

**L2 — Live mode surfaces real agent session content**
Severity: LOW (by design)
`currentTask` in the status response is extracted from the last assistant message in real OpenClaw session JSONL files (first 80 chars). In live deployments, real agent prompts/task descriptions are visible to anyone who can reach the endpoint. This is expected for a personal dashboard, but self-hosters should understand the data exposure model.

### `/api/agents/activity`
In demo mode: returns `getDemoActivities()`. ✅

**L2 (cont.) — Live mode surfaces agent session prompts**
The activity extractor reads the last 50 lines from the 3 most recent JSONL session files per agent, extracts `role === 'user'` messages (15–200 chars), and returns up to 120 chars each. In live mode this exposes real task prompts sent to agents. Same note as above — by design, user should understand exposure.

**M2 — No API authentication on any route**
Severity: MEDIUM
All API routes are publicly accessible — no auth, no rate limiting, no CORS restriction. For demo/Vercel deployments this is fine (demo data only). For live self-hosted deployments, operators are exposing real system metrics and session summaries to the public internet with no access control.

**Recommendation:** Add a note in `README.md` / `SKILL.md` warning that live mode should be deployed behind a reverse proxy with authentication (e.g., basic auth via nginx, Cloudflare Access) or restricted to a private network.

---

## Section 4 — Client Bundle Safety

**Status: ✅ PASS**

- `OPENCLAW_HOME` is only referenced in server-side API route files (`route.ts`). Never imported by client components.
- `isDemoMode()` uses `process.env` — server-side only, not sent to browser.
- `ActivityPanel.tsx` and `PixelOffice.tsx` are client components (`'use client'`) but only import from `@/lib/agents` (type definitions and static config) and `@/lib/agent-chat` (pure string generation) — no server-only modules imported.
- No `NEXT_PUBLIC_` env vars defined that could expose secrets.

---

## Section 5 — Dependencies

**Status: ⚠️ PASS with notes**

```
npm audit: 1 moderate severity vulnerability
```

**M3 — next@16.1.6 — 5 moderate CVEs**
Severity: MEDIUM

| Advisory | Description |
|---|---|
| GHSA-mq59-m269-xvcx | Null origin can bypass Server Actions CSRF checks |
| GHSA-jcc7-9wpm-mj36 | Null origin can bypass dev HMR WebSocket CSRF checks |
| GHSA-ggv3-7p47-pfv8 | HTTP request smuggling via malformed rewrites |
| GHSA-3x4c-7xq6-9pq8 | Unbounded `next/image` disk cache growth |
| GHSA-h27x-g6w4-24gq | Unbounded postponed resume buffering (DoS) |

**Fix:** Upgrade to `next@16.1.7`.

```bash
npm install next@16.1.7
```

Note: `next@16.1.7` is outside the stated `"16.1.6"` version range in `package.json`. Update `package.json` dependency to `"^16.1.7"` or `">=16.1.7"` after upgrading.

**→ Applied: `package.json` pinned to `next@16.1.7`.**

---

## Section 6 — Build Safety

**Status: ✅ PASS**

```
npx tsc --noEmit → 0 errors
```

No TypeScript type errors. Build is clean.

---

## Fixes Applied

| ID | Severity | Issue | Fix |
|---|---|---|---|
| M1 | MEDIUM | `.gitignore` missing plain `.env` | Added `.env` to `.gitignore` |
| M3 | MEDIUM | next@16.1.6 moderate CVEs | Upgraded to next@16.1.7 in `package.json` |

---

## Recommendations (Not Auto-Fixed)

| ID | Severity | Recommendation |
|---|---|---|
| M2 | MEDIUM | Document that live mode requires auth/network restriction in README |
| L1 | LOW | Replace `execSync` shell interpolation in `isAgentRunning` with `spawnSync` arg array |
| L2 | LOW | Document session content exposure in live mode self-hosting notes |
| L3 | LOW | Document server metrics exposure in live mode self-hosting notes |

---

## Verdict

**SAFE FOR PUBLIC RELEASE.** No critical or high severity issues found. Two medium issues fixed (`.gitignore` gap and next.js CVE patch). Remaining items are informational/low severity, by-design behaviors for self-hosted deployments.
