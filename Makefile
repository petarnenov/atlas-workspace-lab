.DEFAULT_GOAL := help
.NOTPARALLEL:
TENANT ?= a
export TENANT
.PHONY: help doctor setup prepare up stop status apps dev ui token build build-ui test test-tools test-java test-frontend test-integration test-e2e check check-scaffold check-architecture check-contracts graph affected-build affected-test measure-builds install-trivy security
help:
	@awk 'BEGIN {FS = ":.*## "} /^[a-z0-9-]+:.*## / {printf "  %-22s %s\n", $$1, $$2}' Makefile
doctor: ## Validate host tool versions and Docker daemon
	node scripts/local/make-tools.mjs doctor
setup: ## Validate host, install locked dependencies, prepare credentials and Chromium
	node scripts/local/make-tools.mjs setup
prepare: ## Safely prepare or reuse local credentials
	node scripts/local/make-tools.mjs prepare
up: ## Build and start Compose dependencies
	pnpm local:up
stop: ## Stop Compose dependencies, preserving volumes
	docker compose stop
status: ## Show Compose service status
	docker compose ps
apps: ## Start Java application harness (requires build and up)
	node scripts/local/apps.mjs
dev: ## Build and run dependencies, Java apps and UI; Ctrl+C stops apps
	node scripts/local/make-tools.mjs dev
ui: ## Start Vite on loopback
	pnpm --filter @atlas/portal-ui dev --host 127.0.0.1
token: ## Generate synthetic token (TENANT=a or b)
	@node -e 'const t=process.env.TENANT;if(!["a","b"].includes(t)){console.error("TENANT must be a or b");process.exit(1)}const r=require("node:child_process").spawnSync(process.execPath,["scripts/local/token.mjs",t],{stdio:"inherit"});process.exit(r.status??1)'
build: ## Assemble Java artifacts and build UI
	./gradlew assemble --no-daemon
	$(MAKE) build-ui
build-ui: ## Typecheck and build UI
	pnpm --filter @atlas/portal-ui build
test: ## Run tooling, Java, frontend, integration and E2E sequentially
	$(MAKE) test-tools
	$(MAKE) test-java
	$(MAKE) test-frontend
	$(MAKE) test-integration
	$(MAKE) test-e2e
test-tools: ## Test Make helpers with measured coverage gates
	node --test --experimental-test-coverage --test-coverage-include='scripts/local/make-tools.mjs' --test-coverage-lines=75 --test-coverage-branches=75 --test-coverage-functions=75 scripts/local/make-tools.test.mjs
test-java: ## Run Java unit tests
	pnpm test:java
test-frontend: ## Run frontend tests with coverage
	pnpm test:frontend
test-integration: ## Build and run Java integration suite (requires up)
	pnpm test:integration
test-e2e: ## Run E2E suite (requires up and Java artifacts; no running apps)
	pnpm test:e2e
check: ## Run scaffold, architecture and contract checks
	$(MAKE) check-scaffold
	$(MAKE) check-architecture
	$(MAKE) check-contracts
check-scaffold: ## Validate repository scaffold
	pnpm check:scaffold
check-architecture: ## Validate architecture boundaries
	pnpm check:architecture
check-contracts: ## Validate versioned contracts
	pnpm check:contracts
graph: ## Open Nx project graph
	pnpm graph
affected-build: ## Build affected Nx projects
	pnpm affected:build
affected-test: ## Test affected Nx projects
	pnpm affected:test
measure-builds: ## Measure existing independent build scenarios
	node scripts/local/measure-builds.mjs
install-trivy: ## Install checksum-verified local Trivy
	node scripts/local/install-trivy.mjs
security: ## Scan repository and images (requires install-trivy and up)
	node scripts/security.mjs
