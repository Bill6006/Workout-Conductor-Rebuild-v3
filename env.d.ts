/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUILD_MARKER: string
  readonly VITE_BUILD_PHASE: string
  readonly VITE_BUILD_COMMIT: string
  readonly VITE_BUILD_TIME: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
