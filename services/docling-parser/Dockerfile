FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337 AS build
RUN pip install --no-cache-dir uv==0.11.11
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY models.json download_models.py ./
RUN .venv/bin/python download_models.py

FROM python:3.12-slim-trixie@sha256:aa943ce411423c7582288f18707ff66eddcbaeb510502d747a72aeb34f30d159 AS runtime-deps
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
# Only conversion runtime libraries are shipped, with their package inventory.
# Terminal, login, mount and package-manager tools are not part of this service.
RUN mkdir /runtime-libs /package-status && \
    for package in libbz2-1.0 libexpat1 libffi8 libgomp1 liblzma5 libsqlite3-0 libssl3t64 libzstd1 zlib1g; do \
      dpkg-query -s "$package" > "/package-status/atlas-$package"; \
      dpkg-query -L "$package" | while read file; do case "$file" in /usr/lib/*/*.so*|/lib/*/*.so*) cp -L "$file" /runtime-libs/ ;; esac; done; \
    done && \
    rm -f /usr/local/lib/python3.12/lib-dynload/_uuid* /usr/local/lib/python3.12/lib-dynload/_curses* /usr/local/lib/python3.12/lib-dynload/readline* /usr/local/lib/python3.12/lib-dynload/_dbm* /usr/local/lib/python3.12/lib-dynload/_gdbm* /usr/local/lib/python3.12/lib-dynload/_crypt* /usr/local/lib/python3.12/lib-dynload/nis* && \
    rm -rf /usr/local/lib/python3.12/site-packages/pip* /usr/local/bin/pip*

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:3ee00291cf386ec52a552e6a858d555debd74776eb4bfa53fa3df2cd6677515e AS runtime
COPY --from=runtime-deps /usr/local /usr/local
COPY --from=runtime-deps /runtime-libs /usr/local/lib
COPY --from=runtime-deps /package-status /var/lib/dpkg/status.d
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY --from=build /models /models
COPY parser_service.py convert.py models.json ./
ENV PATH=/app/.venv/bin:/usr/local/bin LD_LIBRARY_PATH=/usr/local/lib PYTHONDONTWRITEBYTECODE=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HOME=/tmp OMP_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false
USER 10001:10001
EXPOSE 8083
ENTRYPOINT ["/app/.venv/bin/python", "parser_service.py"]

FROM build AS test-deps
RUN uv sync --frozen --no-install-project
FROM runtime AS test
COPY --from=test-deps /app/.venv /app/.venv
COPY pyproject.toml ./
COPY tests ./tests
ENV COVERAGE_FILE=/tmp/.coverage
ENTRYPOINT ["/app/.venv/bin/python", "-m", "pytest", "-p", "no:cacheprovider"]

FROM runtime AS final
