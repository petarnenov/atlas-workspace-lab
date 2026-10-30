# LAB-106 — Independently deployed Docling parser (revision 1)

Synthetic story LAB-106: after existing worker validation succeeds, parse a
synthetic PDF using Docling, persist its structured copy, and display that copy
through Make. Deploy the parser independently, with three replicas in both Helm
dev and prod demo profiles. Worker replica count stays one.

Owner requests: separate parser service; validation before parsing; durable parsed
copy; Make inspection command; three parser replicas. Python exception approved
in conversation: “Разрешаваме Python за този тук”. This approves only Python in
the Docling service, not an unreviewed implementation or specification revision.

Scope: PDF conversion to Markdown and Docling JSON; worker-owned artifacts;
authenticated retrieval; independent image and deployment; bounded failure and
retry handling; local synthetic tests and security/coverage gates. No embeddings,
RAG, chat, external inference, UI feature, worker scaling or Kafka repartitioning.

Applicable guardrails: P01/P02 ownership; P03 versioned HTTP contracts; P05 smallest
credible service; P06–P10 authorization, network boundaries, safe synthetic data;
P12 versioned parsing; P15 exact review; P16–P18 bounded durable execution and
verified failure recovery; P19 tests and SDD; P20 locked dependencies/models.
P11/P13/P14/P21 apply to local model-backed document conversion as relevant:
source-derived output, quality regression checks, no autonomous actions, no remote
providers or probabilistic authorization. P04 introduces no AI protocol dependency.
All P01–P21 remain binding; this is a local demo, not production readiness.

Affected contracts: new parser-internal.v1 and worker-internal.v1 OpenAPI;
additive parsed-copy operation in asset-api.v1; existing upload and processed
AsyncAPI envelopes unchanged. Draft operation definitions live in design.md;
machine-readable OpenAPI must be added and validated before implementation.

Status: proposed. Exact revision 1 approval is still required before feature code.
