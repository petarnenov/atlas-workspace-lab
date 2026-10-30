#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=asset_password="$ASSET_DB_PASSWORD" --set=worker_password="$WORKER_DB_PASSWORD" <<'SQL'
CREATE ROLE asset_owner LOGIN PASSWORD :'asset_password';
CREATE ROLE worker_owner LOGIN PASSWORD :'worker_password';
CREATE DATABASE assets OWNER asset_owner;
CREATE DATABASE worker_checkpoint OWNER worker_owner;
REVOKE CONNECT ON DATABASE assets FROM PUBLIC;
REVOKE CONNECT ON DATABASE worker_checkpoint FROM PUBLIC;
GRANT CONNECT ON DATABASE assets TO asset_owner;
GRANT CONNECT ON DATABASE worker_checkpoint TO worker_owner;
SQL
