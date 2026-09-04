import mongoose from 'mongoose'
import { env } from './env'

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true)
  await mongoose.connect(env.mongoUri)
  console.log(`✓ Connected to MongoDB (${env.mongoUri.replace(/\/\/.*@/, '//***@')})`)
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}