/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'artifact' for the sandboxed claude.ai build (see scripts/build-artifact.mjs). */
  readonly VITE_TARGET?: string;
}
