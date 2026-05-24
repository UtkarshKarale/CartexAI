/// <reference types="vite/client" />

import type { RuntimeApi } from './shared/contracts'

declare global {
  interface Window {
    desktopApi: RuntimeApi
  }
}

export {}

