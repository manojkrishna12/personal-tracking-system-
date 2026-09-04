import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createApp } from '../src/app'
import type { Express } from 'express'

let mongod: MongoMemoryServer
let app: Express

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  app = createApp()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

const DATE = '2026-08-10'

async function registerAgent(email: string, password = 'password123') {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/register').send({ email, password, name: 'Test User' })
  expect(res.status).toBe(201)
  return agent
}

describe('auth', () => {
  it('registers, seeds defaults, logs out and back in', async () => {
    const agent = request.agent(app)
    const reg = await agent.post('/api/auth/register').send({ email: 'a@example.com', password: 'password123', name: 'A' })
    expect(reg.status).toBe(201)
    expect(reg.body.data.user.email).toBe('a@example.com')

    const habits = await agent.get('/api/habits')
    expect(habits.body.data.habits).toHaveLength(7)
    expect(habits.body.data.habits.map((h: { key: string }) => h.key)).toEqual(
      expect.arrayContaining(['protein', 'study', 'gym', 'junkFood', 'eatOutside', 'maggie', 'thingsBought']),
    )
    expect(habits.body.data.habits.find((h: { key: string }) => h.key === 'gym').weeklyGoal).toEqual({ min: 5, max: null })
    expect(habits.body.data.habits.find((h: { key: string }) => h.key === 'junkFood').weeklyGoal).toEqual({ min: null, max: 2 })

    const scoring = await agent.get('/api/settings/scoring')
    expect(scoring.body.data.baseline).toBe(60)

    await agent.post('/api/auth/logout')
    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(401)

    const login = await agent.post('/api/auth/login').send({ email: 'a@example.com', password: 'password123' })
    expect(login.status).toBe(200)
    const me2 = await agent.get('/api/auth/me')
    expect(me2.body.data.user.name).toBe('A')
  })

  it('rejects duplicate emails and bad passwords', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/register').send({ email: 'dup@example.com', password: 'password123', name: 'D' })
    const dup = await agent.post('/api/auth/register').send({ email: 'dup@example.com', password: 'password123', name: 'D' })
    expect(dup.status).toBe(409)
    const weak = await agent.post('/api/auth/register').send({ email: 'weak@example.com', password: 'short', name: 'W' })
    expect(weak.status).toBe(400)
  })
})

describe('days', () => {
  it('saves a day and the server computes the authoritative score', async () => {
    const agent = await registerAgent('days@example.com')
    const res = await agent.put(`/api/days/${DATE}`).send({
      habits: [
        { habitKey: 'protein', status: 'completed', details: '6 eggs + paneer' },
        { habitKey: 'study', status: 'completed', details: 'DSA - 2 hours' },
        { habitKey: 'gym', status: 'completed', details: 'Chest + shoulders' },
        { habitKey: 'junkFood', status: 'not_completed', reason: 'Had chips while watching TV' },
      ],
      purchases: [{ item: 'Headphones', amount: 2499, category: 'Electronics', necessary: true }],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.score).toBe(100)
    expect(res.body.data.quality).toBe('excellent')
    const effects = Object.fromEntries(res.body.data.scoreBreakdown.map((b: { habitKey: string; effect: number }) => [b.habitKey, b.effect]))
    expect(effects['protein']).toBe(10)
    expect(effects['study']).toBe(20)
    expect(effects['gym']).toBe(20)
    expect(effects['junkFood']).toBe(15) // ✗ negative = resistance credit
    expect(effects['baseline']).toBe(60)
  })

  it('rejects any client-supplied score', async () => {
    const agent = await registerAgent('scorespy@example.com')
    const res = await agent.put(`/api/days/${DATE}`).send({
      habits: [{ habitKey: 'study', status: 'completed' }],
      score: 99,
      quality: 'excellent',
    })
    expect(res.status).toBe(400)
  })

  it('keeps a single record per user/date (upsert, no duplicates)', async () => {
    const agent = await registerAgent('unique@example.com')
    await agent.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'study', status: 'completed' }] })
    await agent.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'study', status: 'completed' }, { habitKey: 'gym', status: 'completed' }] })
    const month = await agent.get(`/api/days?month=${DATE.slice(0, 7)}`)
    expect(month.body.data.days).toHaveLength(1)
    expect(month.body.data.days[0].score).toBe(100)
  })

  it('treats an omitted habit as Not Recorded (clears it back)', async () => {
    const agent = await registerAgent('clear@example.com')
    await agent.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'study', status: 'completed' }] })
    await agent.put(`/api/days/${DATE}`).send({ habits: [] })
    const day = await agent.get(`/api/days/${DATE}`)
    expect(day.body.data.habits).toHaveLength(0)
    expect(day.body.data.score).toBeNull()
  })

  it('rejects future dates and unknown habit keys', async () => {
    const agent = await registerAgent('guard@example.com')
    const future = await agent.put('/api/days/2099-01-01').send({ habits: [{ habitKey: 'study', status: 'completed' }] })
    expect(future.status).toBe(400)
    expect(future.body.error.code).toBe('FUTURE_DATE')
    const unknown = await agent.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'notARealHabit', status: 'completed' }] })
    expect(unknown.status).toBe(400)
  })

  it('never creates weight entries automatically', async () => {
    const agent = await registerAgent('noweight@example.com')
    const before = await agent.get('/api/weight')
    expect(before.body.data.entries).toEqual([])
    await agent.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'study', status: 'completed' }] })
    const after = await agent.get('/api/weight')
    expect(after.body.data.entries).toEqual([])
  })

  it('upserts explicit weight entries by date', async () => {
    const agent = await registerAgent('weight@example.com')
    const first = await agent.put('/api/weight/2026-08-01').send({ weightKg: 90 })
    expect(first.status).toBe(200)
    expect(first.body.data.entry.weightKg).toBe(90)
    const second = await agent.put('/api/weight/2026-08-01').send({ weightKg: 89.4, note: 'gym' })
    expect(second.body.data.entry.weightKg).toBe(89.4)
    const list = await agent.get('/api/weight')
    expect(list.body.data.entries).toHaveLength(1)
  })

  it('isolates users — nobody can read another users data', async () => {
    const alice = await registerAgent('alice@example.com')
    await alice.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'study', status: 'completed', details: 'secret' }] })
    await alice.put('/api/weight/2026-08-01').send({ weightKg: 90 })

    const bob = await registerAgent('bob@example.com')
    const bobDay = await bob.get(`/api/days/${DATE}`)
    expect(bobDay.body.data.habits).toHaveLength(0)
    expect(bobDay.body.data.score).toBeNull()
    const bobWeight = await bob.get('/api/weight')
    expect(bobWeight.body.data.entries).toEqual([])
    const bobMonth = await bob.get(`/api/days?month=${DATE.slice(0, 7)}`)
    expect(bobMonth.body.data.days).toEqual([])
  })

  it('recomputes all historical scores after a config change', async () => {
    const agent = await registerAgent('recompute@example.com')
    await agent.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'study', status: 'completed' }] })
    expect((await agent.get(`/api/days/${DATE}`)).body.data.score).toBe(80)
    const updated = await agent.put('/api/settings/scoring').send({
      baseline: 70,
      habits: [
        { habitKey: 'protein', enabled: true, direction: 'positive', points: 10, cap: 10 },
        { habitKey: 'eatOutside', enabled: true, direction: 'negative', points: 10, cap: 10 },
        { habitKey: 'junkFood', enabled: true, direction: 'negative', points: 15, cap: 15 },
        { habitKey: 'maggie', enabled: true, direction: 'negative', points: 5, cap: 5 },
        { habitKey: 'study', enabled: true, direction: 'positive', points: 20, cap: 20 },
        { habitKey: 'gym', enabled: true, direction: 'positive', points: 20, cap: 20 },
        { habitKey: 'thingsBought', enabled: true, direction: 'negative', points: 8, cap: 20 },
      ],
      qualityThresholds: { excellent: 75, average: 50 },
    })
    expect(updated.status).toBe(200)
    const recompute = await agent.post('/api/settings/scores/recompute')
    expect(recompute.body.data.recomputed).toBeGreaterThanOrEqual(1)
    expect((await agent.get(`/api/days/${DATE}`)).body.data.score).toBe(90)
  })

  it('exports all personal data', async () => {
    const agent = await registerAgent('export@example.com')
    await agent.put(`/api/days/${DATE}`).send({ habits: [{ habitKey: 'gym', status: 'completed' }] })
    const res = await agent.get('/api/export')
    expect(res.status).toBe(200)
    expect(res.body.data.records).toHaveLength(1)
    expect(res.body.data.habits).toHaveLength(7)
  })
})