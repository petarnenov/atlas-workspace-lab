CREATE TABLE IF NOT EXISTS checkpoint (
 event_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, asset_id uuid NOT NULL, correlation_id uuid NOT NULL,
 input_payload text NOT NULL, input_hash varchar(64) NOT NULL, attempts int NOT NULL DEFAULT 0,
 fence bigint NOT NULL DEFAULT 0, lease_until timestamptz, next_at timestamptz NOT NULL DEFAULT now(),
 outcome text, publication_attempts int NOT NULL DEFAULT 0, publish_after timestamptz NOT NULL DEFAULT now(),
 sent boolean NOT NULL DEFAULT false, last_error varchar(32), UNIQUE(tenant_id,asset_id,correlation_id), UNIQUE(tenant_id,asset_id)
);
CREATE TABLE IF NOT EXISTS worker_finding (id bigserial PRIMARY KEY,event_id uuid,reason varchar(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
