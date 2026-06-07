// Replaces @qvac/translation-nmtcpp/binding.js inside the Docker image.
//
// The package's linux-arm64 prebuild is compiled with ARM SVE instructions,
// which SIGILL on CPUs without SVE (Raspberry Pi 4/5, Apple Silicon). The QVAC
// worker dlopen()s the addon eagerly at startup even though this app never
// loads a translation model, crashing the whole worker before any model loads.
//
// This stub keeps the import chain alive: the logger hooks become no-ops and
// any real translation call fails loudly instead of killing the process.
module.exports = new Proxy(
  {
    setLogger() {},
    releaseLogger() {},
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => {
        throw new Error(
          `translation-nmtcpp is disabled in this build (prebuild requires an SVE-capable CPU); '${String(prop)}' is unavailable`
        )
      }
    },
  }
)
