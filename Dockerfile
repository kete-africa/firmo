# syntax=docker/dockerfile:1.10
# Firmo — one image, two roles: the web server (default) and the worker (phase 3).
# Vite builds; srvx serves SSR and static files; Typst composes the PDFs.

FROM debian:bookworm-slim AS typst
ARG TARGETARCH
ARG TYPST_VERSION=0.15.1
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl xz-utils \
    && case "$TARGETARCH" in \
         amd64|"") arch="x86_64"; sha256="a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c" ;; \
         arm64) arch="aarch64"; sha256="5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee" ;; \
         *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
       esac \
    && archive="typst-${arch}-unknown-linux-musl.tar.xz" \
    && curl --fail --location --silent --show-error \
         "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/${archive}" --output "/tmp/${archive}" \
    && echo "${sha256}  /tmp/${archive}" | sha256sum --check --strict \
    && tar --extract --xz --file "/tmp/${archive}" --directory /tmp \
    && install --mode 0755 "/tmp/typst-${arch}-unknown-linux-musl/typst" /usr/local/bin/typst \
    && typst --version | grep --fixed-strings "typst ${TYPST_VERSION}"

FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app
# pnpm is installed explicitly: corepack signature checks have broken builds before.
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# @kete-africa/* come from GitHub Packages: the read token is a build secret, present for this
# step only. The user-level config names the variable, never the token, and is removed at once.
RUN --mount=type=secret,id=KETE_PACKAGES_TOKEN,env=KETE_PACKAGES_TOKEN \
    echo '//npm.pkg.github.com/:_authToken=${KETE_PACKAGES_TOKEN}' > /root/.npmrc \
    && pnpm install --frozen-lockfile \
    && rm /root/.npmrc
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22.14.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production TYPST_BIN=/usr/local/bin/typst FIRMO_DOCUMENT_ROOT=/app/document
RUN groupadd --system firmo && useradd --system --gid firmo --home-dir /app firmo
COPY --from=typst /usr/local/bin/typst /usr/local/bin/typst
COPY --from=build --chown=firmo:firmo /app/node_modules ./node_modules
COPY --from=build --chown=firmo:firmo /app/package.json ./package.json
COPY --from=build --chown=firmo:firmo /app/dist ./dist
COPY --from=build --chown=firmo:firmo /app/db ./db
# The document template bundle (template, fonts, assets), checked against its manifest at render.
COPY --from=build --chown=firmo:firmo /app/document/templates ./document/templates
USER firmo
EXPOSE 3000

# Coolify's own probe needs curl or wget, absent from the slim image: the image probes itself.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

# The static directory is an absolute path: srvx does not always resolve a relative one.
CMD ["node_modules/.bin/srvx", "serve", "--entry", "dist/server/server.js", "--static", "/app/dist/client", "--prod", "--host", "0.0.0.0", "--port", "3000"]
