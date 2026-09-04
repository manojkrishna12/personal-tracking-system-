import 'dotenv/config'

function get(name: string, fallback?: string): string {
  const v = process.env[name]
  if (v !== undefined && v !== '') return v
  if (fallback !== undefined) return fallback
  throw new Error(`Missing required environment variable: ${name}`)
}

const nodeEnv = get('NODE_ENV', 'development')
const isProd = nodeEnv === 'production'

const jwtSecret = get('JWT_SECRET', '')
if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET must be set in production')
  console.warn('⚠ JWT_SECRET not set — using an insecure dev-only secret. Set it in server/.env.')
}

// Some host environments preset PORT=0 as a "pick any port" sentinel.
// Treat it as unset and fall back to the configured dev port (3001).
const rawPort = process.env.PORT
const port = rawPort !== undefined && rawPort !== '' && rawPort !== '0' ? Number(rawPort) : 3001

export const env = {
  port,
  mongoUri: get('MONGODB_URI', 'mongodb://127.0.0.1:27017/manoj_tracking'),
  jwtSecret: jwtSecret || 'dev-only-insecure-secret',
  // Frontend origin allowed to call this API with credentials (CORS).
  // Unset in local dev (the Vite proxy needs no CORS).
  clientOrigin: get('CLIENT_ORIGIN', ''),
  nodeEnv,
  isProd,
}