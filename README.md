# Atlas Workspace Lab

Public, independent proof of concept for **polyglot monorepo + OpenSpec SDD + OpenAI Codex**, using **TypeScript and Java only**.

> **Status: foundation scaffold.** Application services, event flows, and integration tests are planned, not yet implemented. Nothing here represents proprietary architecture or code from another product.

## Goals

- Demonstrate a realistic cross-service feature developed spec-first.
- Compare affected-build performance and independent build/test boundaries.
- Enforce human specification review before AI-assisted implementation.
- Validate REST/OpenAPI contracts and async event/AsyncAPI contracts in CI.
- Produce an auditable path from issue → approved spec → Codex implementation → tests → PR.

## Proposed structure

```text
apps/portal-ui/                   React + TypeScript + Vite (planned)
services/workspace-api/          Java + Spring Boot + Gradle (planned)
services/asset-service/          Java + Spring Boot + Gradle (planned)
workers/processing-worker/       Java + Spring Boot + Gradle (planned)
contracts/openapi/               API contracts (planned)
contracts/asyncapi/              Event contracts (planned)
openspec/                        Specs and change proposals
.agents/skills/                  Codex-compatible skills (as configured)
infrastructure/docker/           Local dependencies (planned)
tests/                           Cross-service contract/E2E suites (planned)
.github/workflows/               CI bootstrap
```

## Demo story

**LAB-101: Upload and Process an Asset.** Users upload a demo file, a Java service stores metadata, an async Java worker processes the file, and the React UI shows processing status. Synthetic data only.

## Proposed SDD workflow

1. Open a GitHub Issue (a Jira-style story).
2. Prepare an OpenSpec proposal, design, specs and tasks.
3. Obtain explicit human approval **before implementation**.
4. Use OpenAI Codex with [AGENTS.md](AGENTS.md) to implement approved tasks.
5. Run affected tests and contract checks, then open a PR.
6. Merge after human review and passing required checks.

## Tooling under evaluation

- Nx + pnpm: TypeScript workspace and cross-project orchestration
- Gradle: Java service builds
- OpenSpec: spec-driven development
- OpenAI Codex: coding agent
- GitHub Actions: CI

No dependency installation or application build is claimed as complete yet. A passing scaffold check is **not** a passing application integration test.
