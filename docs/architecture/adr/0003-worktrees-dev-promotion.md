# ADR-0003 — Worktrees, dev integration and promotion-only hosted CI

Status: ACCEPTED — revision 1, LAB-108, approved commit `6bcb255` on
2026-10-31; see LAB-108 approval.md. Implementation evidence is tracked separately.
Applies P02/P05/P15/P18–P20. Owner: repository owner.

## Context and decision

Develop in a dedicated Git worktree and a task branch created from `dev`.
Do not implement on `main` or directly on `dev`. Preserve other worktrees,
uncommitted changes and running user environments. Reviewed task branches merge
into `dev`; reviewed promotion goes only from `dev` to `main`.

Development runs exclusively in dev mode (`ENV=dev` for environment-aware Make
commands). Do not use demo-prod or production credentials/data for development.
The existing prod-demo configuration remains a release-validation target, not
the development environment. No new production readiness is implied.

Run all applicable CI-equivalent checks locally through Make before integration
into `dev`. Evidence records the tested commit/tree, commands, results, coverage
and environment. Local execution does not waive architecture, contracts,
security, coverage, E2E, review or exact OpenSpec approval.

GitHub Actions do not run on task-branch pushes or PRs targeting `dev`. Hosted
workflows run only for promotion from `dev` to `main`. The pre-merge promotion PR
must run all required workflows; do not defer validation until after merging.
Filter PR targets to `main` and require same-repository head `dev` at every
workflow entry job. Reject other promotion sources rather than silently treating
a skipped check as successful review. No generic push, manual, scheduled or
`pull_request_target` execution is introduced. A post-merge push run is unnecessary
for this policy; the approved promotion PR supplies the hosted evidence.

Before merge, checks must cover the exact candidate against current `main`.
If `main` or `dev` changes, refresh the candidate, local evidence and hosted checks.
Configure branch protection to require the real promotion checks and human review;
do not bypass existing protection to accommodate a trigger change. Repository
settings require a separate reviewed change if current protections conflict.

## Adoption and alternatives

Existing workflows currently run on all PRs and on pushes to `main`; this ADR
records a target, not a claim that the triggers or branch protections changed.
LAB-108 will update all five workflows, add trigger/source regression tests and
provide a single documented local Make entrypoint for their applicable checks.
Check actual `dev` existence and ancestry first. Bootstrap `dev` from reviewed
`main` if absent; integrate pending governance through review before feature work.
The LAB-107/LAB-108 specification worktrees predate this policy and are not runtime
implementation approval or an excuse to merge them directly to `main`.

Running hosted CI on every feature PR gives earlier remote feedback but conflicts
with the owner's requested local development model. Promotion-only CI saves remote
runs but can discover environment differences later; local parity and mandatory
pre-merge promotion checks address this limitation without claiming equivalence.

## Verification and rollback

Test the event matrix: task push, dev push, PR to dev, unrelated PR to main,
same-repository dev-to-main PR, fork named dev, and manual/scheduled events.
Only the same-repository promotion PR executes build/test jobs. An invalid source
to main fails the promotion source check. No secrets reach untrusted fork code.
Preserve workflow check names where practical and verify required checks are
actually reported. No automatic merge or branch-protection relaxation.

Rollback is a separately reviewed restoration of the previous trigger policy;
never disable quality checks as a rollback. Exact revision approval evidence is
recorded in LAB-108 approval.md.
