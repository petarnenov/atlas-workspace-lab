.DEFAULT_GOAL := help
.NOTPARALLEL:
.PHONY: ci ci-policy-test contracts-validate helm-test-dev helm-security-dev
ci: ## Run applicable CI checks locally in dev mode; fail fast and record evidence
	node scripts/ci/local.mjs
ci-policy-test: ## Verify hosted workflows accept only dev-to-main promotion
	node --test scripts/ci/promotion.test.mjs scripts/ci/contracts.test.mjs
	node --test --experimental-test-coverage --test-coverage-include='scripts/ci/local.mjs' --test-coverage-lines=75 --test-coverage-branches=75 scripts/ci/local.test.mjs
contracts-validate: ## Validate all OpenAPI/AsyncAPI versions with authoritative validators
	pnpm exec node scripts/validate-asyncapi.mjs
	npx --yes @redocly/cli@2.72.1 lint contracts/openapi/*.json --extends=spec
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
build: ## Assemble Java artifacts, UI and parser image
	./gradlew assemble --no-daemon
	$(MAKE) build-ui
	$(MAKE) parser-build
build-ui: ## Typecheck and build UI
	pnpm --filter @atlas/portal-ui build
test: ## Run parser, tooling, Java, frontend, integration and E2E sequentially
	$(MAKE) parser-test
	$(MAKE) test-tools
	$(MAKE) test-java
	$(MAKE) test-frontend
	$(MAKE) test-integration
	$(MAKE) test-e2e
test-tools: ## Test Make helpers with measured coverage gates
	node --test --experimental-test-coverage --test-coverage-include='scripts/local/artifact-maintenance.mjs' --test-coverage-lines=75 --test-coverage-branches=75 scripts/local/artifact-maintenance.test.mjs
	node --test --experimental-test-coverage --test-coverage-include='scripts/local/artifact-credentials.mjs' --test-coverage-lines=75 --test-coverage-branches=75 scripts/local/artifact-credentials.test.mjs
	node --test --experimental-test-coverage --test-coverage-include='scripts/local/parsed-copy.mjs' --test-coverage-include='scripts/local/parser-credentials.mjs' --test-coverage-include='scripts/local/parser-forward.mjs' --test-coverage-lines=75 --test-coverage-branches=75 scripts/local/parsed-copy.test.mjs scripts/local/parser-forward.test.mjs
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
.PHONY: architecture-check architecture-audit architecture-inventory architecture-test
architecture-check: ## Reject new architectural debt; report reviewed existing debt
	node scripts/check-architecture.mjs
architecture-audit: ## Strict audit, fails on ALL remaining debt
	node scripts/architecture-guardrails.mjs audit
architecture-inventory: ## Print read-only findings (never accepts a baseline)
	node scripts/architecture-guardrails.mjs inventory
architecture-test: ## Test guardrails offline with source/branch coverage gates
	node --test --experimental-test-coverage --test-coverage-include='scripts/architecture-guardrails.mjs' --test-coverage-lines=75 --test-coverage-branches=75 scripts/architecture-guardrails.test.mjs
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

ENV ?= dev
export ENV SERVICE REVISION
.PHONY: helm-tools helm-doctor helm-setup helm-build helm-lint helm-template helm-up helm-deploy helm-dev helm-prod helm-status helm-logs helm-forward helm-token helm-stop helm-rollback helm-test helm-security
helm-tools: ## Explicitly install checksum-verified kind, kubectl and Helm
	node scripts/k8s/install-kind.mjs
	node scripts/helm/install.mjs
helm-doctor: ## Check selected Helm demo environment (ENV=dev|prod)
	node scripts/helm/runtime.mjs doctor
helm-setup: ## Prepare isolated Helm namespace and credentials (ENV=dev|prod)
	node scripts/helm/runtime.mjs setup
helm-build: ## Build/load immutable images and record selected environment inventory
	node scripts/helm/runtime.mjs build
helm-lint: ## Validate both charts and selected environment values
	node scripts/helm/runtime.mjs lint
helm-template: ## Render selected environment charts without cluster mutation
	node scripts/helm/runtime.mjs template
helm-up: ## Start platform then independent application releases (ENV=dev|prod)
	node scripts/helm/runtime.mjs up
helm-deploy: ## Deploy exactly one app (ENV=dev|prod SERVICE=asset-service)
	node scripts/helm/runtime.mjs deploy
helm-dev: ## Prepare/build/start dev demo and forward UI on loopback 5173
	node scripts/helm/runtime.mjs dev
helm-prod: ## Prepare/build/start synthetic prod demo and forward UI on loopback 5174
	node scripts/helm/runtime.mjs prod
helm-status: ## Show selected Helm demo releases and Kubernetes resources
	node scripts/helm/runtime.mjs status
helm-logs: ## Show selected environment application logs
	node scripts/helm/runtime.mjs logs
helm-forward: ## Forward selected demo UI to loopback (dev 5173, prod 5174)
	node scripts/helm/runtime.mjs forward
helm-token: ## Generate selected environment synthetic token (TENANT=a|b)
	@node scripts/helm/runtime.mjs token
helm-stop: ## Stop selected environment, preserving releases, Secrets and PVCs
	node scripts/helm/runtime.mjs stop
helm-rollback: ## Roll back one compatible app release (SERVICE=... REVISION=...)
	node scripts/helm/runtime.mjs rollback
helm-test: ## Run Helm helper coverage, chart checks and real two-environment E2E
	node --test --experimental-test-coverage --test-coverage-include='scripts/helm/*.mjs' --test-coverage-exclude='scripts/helm/*.test.mjs' --test-coverage-lines=75 --test-coverage-branches=75 --test-coverage-functions=75 scripts/helm/runtime.test.mjs
	pnpm exec playwright test --config playwright.helm.config.ts
helm-test-dev: ## Run local Helm helper and dev-only runtime tests
	node --test --experimental-test-coverage --test-coverage-include='scripts/helm/*.mjs' --test-coverage-exclude='scripts/helm/*.test.mjs' --test-coverage-lines=75 --test-coverage-branches=75 --test-coverage-functions=75 scripts/helm/runtime.test.mjs
	ATLAS_HELM_TEST_ENV=dev pnpm exec playwright test --config playwright.helm.config.ts
helm-security: ## Scan charts, rendered profiles and their deployed images
	node scripts/helm/security.mjs
helm-security-dev: ## Scan only the local dev profile, images and repository
	ATLAS_HELM_TEST_ENV=dev node scripts/helm/security.mjs

FORMAT ?= markdown
export ASSET_ID FORMAT
.PHONY: parsed-copy parsed-copy-legacy parser-build parser-test
parsed-copy-legacy: ## Show legacy native parsed JSON (same authorization)
	@PARSED_API_VERSION=1 FORMAT=json node scripts/local/parsed-copy.mjs
parsed-copy: ## Show authorized neutral saved parsed PDF (ENV=dev ASSET_ID=uuid FORMAT=markdown|json TENANT=a|b)
	@node scripts/local/parsed-copy.mjs
parser-build: ## Build independently deployable locked offline Docling image
	docker build --provenance=false -t atlas/docling-parser:candidate services/docling-parser
parser-test: ## Run parser unit/quality checks and measured Python coverage in container
	docker build --target test -t atlas/docling-parser:test services/docling-parser
	docker run --rm --network=none atlas/docling-parser:test

.PHONY: artifacts-pause artifacts-snapshot artifacts-migrate artifacts-verify artifacts-rollback-copy artifacts-reconcile artifacts-resume
artifacts-pause: ## Dev maintenance: pause uploads, drain publications and stop writers
	node scripts/local/artifact-maintenance.mjs pause
artifacts-snapshot: ## Save private restorable DB/object snapshots and owner exports
	node scripts/local/artifact-maintenance.mjs snapshot
artifacts-migrate: ## Import verified legacy copies through the asset owner (idempotent)
	node scripts/local/artifact-maintenance.mjs migrate
artifacts-verify: ## Verify historical per-tenant counts/checksums through owner exports
	node scripts/local/artifact-maintenance.mjs verify
artifacts-rollback-copy: ## Restore and verify old worker reader copies including new writes
	node scripts/local/artifact-maintenance.mjs rollback-copy
artifacts-reconcile: ## Bounded reference reconciliation, dry-run only; never deletes
	node scripts/local/artifact-maintenance.mjs reconcile
artifacts-resume: ## Restore recorded dev replicas after reviewed maintenance
	node scripts/local/artifact-maintenance.mjs resume
