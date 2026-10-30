# LAB-105 — Worker console logging (revision 1)

Synthetic story LAB-105: make the demo worker's processing visible in container
console logs during upload, retry and independent deployment tests.

Scope: add SLF4J INFO/WARN lifecycle messages in WorkerEvents, with meaningful
unit tests and console verification. Use Spring Boot's existing console logging;
no logging infrastructure, dependencies, API/event/schema changes or new settings.
Existing Spring logging-level configuration remains available.

Applicable principles: P02 (worker ownership), P03 (unchanged contracts), P05
(existing logging only), P06–P10 (bounded safe fields, synthetic data, no secrets),
P15/P19 (exact approval, tests and review), P16/P18 (accurate retry/fencing/publication
messages), P20 (unchanged dependencies). Other P01–P21 remain binding guardrails;
no AI capability is introduced.

Implementation requires explicit owner approval of this exact revision.
