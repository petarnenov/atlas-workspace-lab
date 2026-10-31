CREATE TABLE IF NOT EXISTS upload_intent (
 asset_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, subject varchar(128) NOT NULL,
 idem_key varchar(128), digest varchar(64) NOT NULL, object_key text NOT NULL UNIQUE,
 correlation_id uuid NOT NULL, lock_scope text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours', committed boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS upload_idem ON upload_intent(tenant_id,subject,idem_key) WHERE idem_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS asset (
 asset_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, object_key text NOT NULL UNIQUE, correlation_id uuid NOT NULL,
 status varchar(16) NOT NULL CHECK(status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
 version bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), error_code varchar(32)
);
CREATE TABLE IF NOT EXISTS upload_outbox (
 event_id uuid PRIMARY KEY, asset_id uuid NOT NULL REFERENCES asset(asset_id), payload text NOT NULL,
 attempts int NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(), sent boolean NOT NULL DEFAULT false,
 last_error varchar(32)
);
CREATE TABLE IF NOT EXISTS outcome_seen (event_id uuid PRIMARY KEY, payload_hash varchar(64) NOT NULL);
CREATE TABLE IF NOT EXISTS asset_finding (id bigserial PRIMARY KEY, event_id uuid, reason varchar(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS derived_artifact (
 tenant_id uuid NOT NULL, artifact_id uuid NOT NULL, asset_id uuid NOT NULL REFERENCES asset(asset_id),
 input_event_id uuid NOT NULL, correlation_id uuid NOT NULL, source_sha256 varchar(64) NOT NULL,
 attempt_fence bigint NOT NULL CHECK(attempt_fence>0), idem_key uuid NOT NULL,
 payload_hash varchar(64) NOT NULL, markdown_hash varchar(64) NOT NULL, native_hash varchar(64),
 converter_revision varchar(128) NOT NULL, pipeline_revision varchar(128) NOT NULL,
 page_count int NOT NULL CHECK(page_count BETWEEN 1 AND 20),
 state varchar(16) NOT NULL CHECK(state IN ('WRITING','STAGED','COMMITTED')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,artifact_id), UNIQUE(tenant_id,idem_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS derived_committed ON derived_artifact(tenant_id,asset_id) WHERE state='COMMITTED';
