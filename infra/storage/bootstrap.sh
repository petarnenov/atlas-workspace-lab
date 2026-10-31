#!/bin/sh
set -eu
rc alias set lab http://storage:9000 local_admin "$OBJECT_ADMIN_PASSWORD" >/dev/null
# Existing bucket is the only acceptable create conflict.
if ! rc stat lab/synthetic-assets >/dev/null 2>&1; then rc mb lab/synthetic-assets; fi
rc admin user add lab/ asset_store "$ASSET_OBJECT_PASSWORD" >/dev/null
rc admin user add lab/ worker_reader "$WORKER_OBJECT_PASSWORD" >/dev/null
rc admin policy create lab/ asset-objects /policies/asset.json >/dev/null
rc admin policy create lab/ worker-objects /policies/worker.json >/dev/null
rc admin policy attach lab/ asset-objects --user asset_store >/dev/null
rc admin policy attach lab/ worker-objects --user worker_reader >/dev/null
if ! rc stat lab/synthetic-derived >/dev/null 2>&1; then rc mb lab/synthetic-derived; fi
rc admin user add lab/ asset_artifacts "$ARTIFACT_OBJECT_PASSWORD" >/dev/null
rc admin policy create lab/ artifact-objects /policies/artifact.json >/dev/null
rc admin policy attach lab/ artifact-objects --user asset_artifacts >/dev/null
printf 'Synthetic storage bucket and scoped identities ready.\n'
