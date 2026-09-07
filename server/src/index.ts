import { env } from './config/env'
import { connectDb, disconnectDb } from './config/db'
import { createApp } from './app'

async function main(): Promise<void> {
  await connectDb()
  const app = createApp()
  const server = app.listen(env.port, () => {
    console.log(`✓ SelfTrack API listening on http://localhost:${env.port}`)
  })

  // Graceful shutdown — Render sends SIGTERM on redeploys (plan §22).
  let shuttingDown = false
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`\n${signal} received — shutting down gracefully…`)
    server.close(async () => {
      await disconnectDb().catch(() => undefined)
      process.exit(0)
    })
    // Hard exit if connections do not drain in time.
    setTimeout(() => process.exit(0), 10_000).unref()
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
