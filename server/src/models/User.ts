import { Schema, model } from 'mongoose'

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    settings: {
      weightGoalKg: { type: Number, default: 85, min: 20, max: 300 },
      weekStartsOn: { type: Number, default: 1 }, // 0 = Sunday, 1 = Monday
      timezone: { type: String, default: 'Asia/Kolkata', maxlength: 60 },
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    },
  },
  { timestamps: true },
)

export const User = model('User', userSchema)