// numeric components of the oldest Git version supported by the CLI
export const MINIMUM_GIT_VERSION_COMPONENTS = Object.freeze({
  major: 2,
  minor: 30,
  patch: 0,
});

// oldest Git version supported by the CLI
export const MINIMUM_GIT_VERSION = `${MINIMUM_GIT_VERSION_COMPONENTS.major}.${MINIMUM_GIT_VERSION_COMPONENTS.minor}.${MINIMUM_GIT_VERSION_COMPONENTS.patch}`;

// maximum bytes accepted from each Git version output stream
export const MAX_GIT_VERSION_OUTPUT_BYTES = 4096;
