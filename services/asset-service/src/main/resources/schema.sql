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
