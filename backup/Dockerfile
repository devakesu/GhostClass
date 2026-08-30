# ==============================================================================
# GhostClass - Database Backup Container (Post-Quantum & Classical Support)
#
# Minimal, hardened Alpine-based container for executing automated PostgreSQL
# backups, zstd compression, age encryption (with age-plugin-simplepq support),
# and Cloudflare R2 uploads.
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Builder Stage: Compile age-plugin-simplepq (Post-Quantum Hybrid ML-KEM/Kyber)
# ------------------------------------------------------------------------------
FROM rust:1.85-alpine@sha256:4333721398de61f53ccbe53b0b855bcc4bb49e55828e8f652d7a8ac33dd0c118 AS pq-builder

RUN apk add --no-cache musl-dev && \
    cargo install --root /install age-plugin-simplepq

# ------------------------------------------------------------------------------
# 2. Runtime Stage
# ------------------------------------------------------------------------------
FROM alpine:3.21@sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d

ARG APP_COMMIT_SHA=HEAD
ENV APP_COMMIT_SHA=${APP_COMMIT_SHA}

# Install required tools
RUN apk add --no-cache \
    bash \
    curl \
    wget \
    tar \
    jq \
    ca-certificates \
    postgresql17-client \
    zstd \
    age \
    aws-cli \
    && rm -rf /var/cache/apk/*

# Copy compiled Post-Quantum plugin to PATH
COPY --from=pq-builder /install/bin/age-plugin-simplepq /usr/local/bin/age-plugin-simplepq

# Install Infisical CLI & Supercronic cron daemon
RUN wget -qO- https://github.com/Infisical/cli/releases/download/v0.43.84/cli_0.43.84_linux_amd64.tar.gz | tar -xz -C /usr/local/bin infisical && \
    wget -q https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 -O /usr/local/bin/supercronic && \
    chmod +x /usr/local/bin/infisical /usr/local/bin/supercronic /usr/local/bin/age-plugin-simplepq

# Create non-root backup user
RUN addgroup -g 10001 backupgroup && \
    adduser -u 10001 -G backupgroup -s /bin/bash -D backupuser && \
    mkdir -p /home/backupuser /tmp && \
    chown -R backupuser:backupgroup /home/backupuser /tmp

# Copy backup and restore scripts
COPY backup/backup-db.sh /usr/local/bin/backup-db.sh
COPY backup/restore-db.sh /usr/local/bin/restore-db.sh
COPY backup/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/backup-db.sh \
             /usr/local/bin/restore-db.sh \
             /usr/local/bin/entrypoint.sh

USER backupuser
WORKDIR /home/backupuser

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
