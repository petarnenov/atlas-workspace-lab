# Engineering instructions for Codex

This is a **public, independent demonstration repository**. Never introduce proprietary source, company names, internal URLs, tokens, or customer data.

## Architecture
- Polyglot monorepo: TypeScript/React plus Java; **no Python**.
- Respect service ownership. No direct imports from another service's internals and no shared database tables across service boundaries.
- Design versioned OpenAPI/AsyncAPI contracts before changing implementations.
- Build and release deployable services independently.
- Favor minimal infrastructure and maintainable code.

## Spec-driven workflow
1. Link work to a GitHub Issue (or a synthetic Jira-style story).
2. Create an OpenSpec change with proposal, specification, design, and tasks.
3. Require human review of scope, contracts, security, and acceptance criteria **before writing implementation code**.
4. Implement only the approved scope. If requirements change, update the spec and request review again.
5. Add unit, integration, contract, and relevant E2E tests; aim for at least 75% automated source coverage, plus E2E happy paths.
6. Run affected checks and include evidence in a Pull Request. Do not merge or archive an unverified change.
7. Never bypass quality gates, modify CI protections, or publish secrets.

## Coding guidelines
- Prefer SOLID, Clean Code, strict TypeScript, explicit validation, least-privilege access, and bounded retries.
- For the future Java services, use Gradle and an officially supported LTS JDK.
- Keep README and examples in English.
- The sample domain is generic asset processing, not the source enterprise platform.
