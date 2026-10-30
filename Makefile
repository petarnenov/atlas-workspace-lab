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

.PHONY: k8s-tools k8s-doctor k8s-setup k8s-build k8s-up k8s-dev k8s-forward k8s-status k8s-logs k8s-stop k8s-token k8s-test k8s-security
k8s-tools: ## Install checksum-verified kind/kubectl under .local/tools (explicit opt-in)
	node scripts/k8s/install-kind.mjs
k8s-doctor: ## Validate Kubernetes host prerequisites and dedicated context
	node scripts/k8s/runtime.mjs doctor
k8s-setup: ## Create isolated local kind cluster and scoped credentials
	node scripts/k8s/runtime.mjs setup
k8s-build: ## Build immutable application/dependency images and load kind
	node scripts/k8s/runtime.mjs build
k8s-up: ## Reconcile Kubernetes workloads with bounded readiness waits
	node scripts/k8s/runtime.mjs up
k8s-dev: ## Setup/build/start complete Kubernetes demo and forward UI
	node scripts/k8s/runtime.mjs dev
k8s-forward: ## Forward Kubernetes UI to loopback port 5173
	node scripts/k8s/runtime.mjs forward
k8s-status: ## Inspect dedicated Kubernetes workload status
	node scripts/k8s/runtime.mjs status
k8s-logs: ## Show recent Kubernetes application logs
	node scripts/k8s/runtime.mjs logs
k8s-stop: ## Scale local Kubernetes workloads to zero, retaining PVCs
	node scripts/k8s/runtime.mjs stop
k8s-token: ## Generate Kubernetes synthetic token (TENANT=a or b)
	@node scripts/k8s/runtime.mjs token
k8s-test: ## Run Kubernetes tooling checks and real cluster E2E/failure tests
	./gradlew :processing-worker:k8sProbeCheck --no-daemon
	node --test --experimental-test-coverage --test-coverage-include='scripts/k8s/*.mjs' --test-coverage-exclude='scripts/k8s/*.test.mjs' --test-coverage-lines=75 --test-coverage-branches=75 --test-coverage-functions=75 scripts/k8s/runtime.test.mjs
	pnpm exec playwright test --config playwright.k8s.config.ts
k8s-security: ## Scan Kubernetes manifests and all loaded workload images
	node scripts/k8s/security.mjs
