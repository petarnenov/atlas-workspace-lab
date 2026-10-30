FROM postgres:17.11-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b
# Replace the Go privilege-drop helper with Alpine's small supported equivalent.
RUN apk upgrade --no-cache && apk add --no-cache su-exec \
    && sed -i 's/exec gosu /exec su-exec /g' /usr/local/bin/docker-entrypoint.sh \
    && rm /usr/local/bin/gosu
