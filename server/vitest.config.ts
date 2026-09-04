// Use the locally installed mongod instead of downloading a binary.
process.env.MONGOMS_SYSTEM_BINARY = 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe'
process.env.MONGOMS_VERSION = '8.2.1'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
})