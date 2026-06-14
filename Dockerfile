# AI Notes — multi-arch image (build with --platform linux/arm64 for Raspberry Pi / umbrelOS)
FROM node:22-bookworm-slim

# Runtime libs needed by the QVAC native addons (worker runs on Bare):
#   libgomp1   — llama.cpp prebuilds (OpenMP)
#   libatomic1 — rocksdb-native
#   libssl3    — Bare runtime TLS (model downloads)
#   libvulkan1 — llama.cpp Vulkan GPU backend (loadable even if unused)
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 libatomic1 libssl3 libvulkan1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Docker auto-populates TARGETARCH (arm64 / amd64) per build platform. QVAC's
# native prebuild dirs use Node's arch naming, where amd64 is spelled "x64".
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      arm64) echo "linux-arm64" > /tmp/keep-arch ;; \
      amd64) echo "linux-x64"   > /tmp/keep-arch ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac

COPY package.json package-lock.json ./
COPY docker/nmtcpp-binding-stub.js /tmp/nmtcpp-binding-stub.js
RUN KEEP="$(cat /tmp/keep-arch)" \
  && npm ci --omit=dev \
  # @qvac/translation-nmtcpp's arm64 prebuild is compiled with ARM SVE
  # instructions and SIGILLs on CPUs without SVE (Raspberry Pi, Apple Silicon),
  # killing the QVAC worker at startup. This app never uses translation, so
  # swap the native binding for a JS stub on every arch (see the stub file).
  && cp /tmp/nmtcpp-binding-stub.js node_modules/@qvac/translation-nmtcpp/binding.js \
  && rm -rf node_modules/@qvac/translation-nmtcpp/prebuilds \
  # Strip native prebuilds for every platform except the one this image
  # targets — they account for ~3 GB of dead weight — plus the Android/iOS
  # payloads of react-native-bare-kit (server never loads them).
  && find node_modules -type d -name prebuilds -prune | while read -r p; do \
       for d in "$p"/*/; do \
         case "$d" in */"$KEEP"/) ;; *) rm -rf "$d" ;; esac; \
       done; \
     done \
  && rm -rf node_modules/react-native-bare-kit/android node_modules/react-native-bare-kit/ios

COPY index.js server.js ./
COPY lib ./lib
COPY public ./public

# Notes/uploads + downloaded model weights live here — mount both as volumes
# so they survive container upgrades (server.js writes qvac.config.json
# pointing the QVAC cache at /app/models on startup).
VOLUME ["/app/data", "/app/models"]

ENV PORT=5173
EXPOSE 5173

CMD ["node", "server.js"]
