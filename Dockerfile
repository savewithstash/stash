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

COPY package.json package-lock.json ./
COPY docker/nmtcpp-binding-stub.js /tmp/nmtcpp-binding-stub.js
RUN npm ci --omit=dev \
  # @qvac/translation-nmtcpp's linux-arm64 prebuild is compiled with ARM SVE
  # instructions and SIGILLs on CPUs without SVE (Raspberry Pi, Apple Silicon),
  # killing the QVAC worker at startup. This app never uses translation, so
  # swap the native binding for a JS stub (see the stub file for details).
  && cp /tmp/nmtcpp-binding-stub.js node_modules/@qvac/translation-nmtcpp/binding.js \
  && rm -rf node_modules/@qvac/translation-nmtcpp/prebuilds \
  # Strip native prebuilds for every platform except the one this image
  # targets (linux-arm64) — they account for ~3 GB of dead weight — plus the
  # Android/iOS payloads of react-native-bare-kit (server never loads them).
  && find node_modules -type d -name prebuilds -prune | while read -r p; do \
       for d in "$p"/*/; do \
         case "$d" in */linux-arm64/) ;; *) rm -rf "$d" ;; esac; \
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
