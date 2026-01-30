import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: [
    '@proj-airi/server-sdk',
    '@xsai/shared-chat',
    '@xsai/stream-text',
  ],
})
