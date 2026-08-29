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
FROM rust:1.85-alpine AS pq-builder

RUN apk add --no-cache musl-dev && \
    cargo install --root /install age-plugin-simplepq

# ------------------------------------------------------------------------------
# 2. Runtime Stage
# ------------------------------------------------------------------------------
FROM alpine:3.21

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

# Install Infisical CLI for dynamic in-memory runtime secret injection
RUN wget -qO- https://github.com/Infisical/cli/releases/download/v0.43.84/cli_0.43.84_linux_amd64.tar.gz | tar -xz -C /usr/local/bin infisical && \
    chmod +x /usr/local/bin/infisical /usr/local/bin/age-plugin-simplepq

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
