import { Router, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { User } from '../models/User'
import { seedUserDefaults } from '../seed/defaults'
import { loginSchema, registerSchema } from '../validation/schemas'
import { validate } from '../middleware/validate'
import { authRequired, clearAuthCookie, setAuthCookie, type AuthRequest } from '../middleware/auth'

const router = Router()

function publicUser(u: {
  _id: unknown
  email: string
  name: string
  settings?: unknown
}) {
  return { id: String(u._id), email: u.email, name: u.name, settings: u.settings }
}

router.post('/register', validate(registerSchema), async (req, res) => {
  const { email, password, name } = req.body
  const existing = await User.findOne({ email })
  if (existing) {
    res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' } })
    return
  }
  const passwordHash = await bcrypt.hash(password, 10)
  const user = await User.create({ email, passwordHash, name })
  await seedUserDefaults(user._id)
  setAuthCookie(res, String(user._id), user.email)
  res.status(201).json({ data: { user: publicUser(user) } })
})

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body
  const user = await User.findOne({ email })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } })
    return
  }
  setAuthCookie(res, String(user._id), user.email)
  res.json({ data: { user: publicUser(user) } })
})

router.post('/logout', (req, res: Response) => {
  clearAuthCookie(res)
  res.status(204).end()
})

router.get('/me', authRequired, async (req: AuthRequest, res) => {
  const user = await User.findById(req.user!.id)
  if (!user) {
    res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } })
    return
  }
  res.json({ data: { user: publicUser(user) } })
})

export default router