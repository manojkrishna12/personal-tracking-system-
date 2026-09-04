import { Schema, model, Types } from 'mongoose'

const habitDefinitionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true, maxlength: 40 },
    label: { type: String, required: true, maxlength: 40 },
    order: { type: Number, default: 0 },
    type: { type: String, enum: ['boolean', 'purchase'], default: 'boolean' },
    weeklyGoal: {
      min: { type: Number, default: null, min: 0, max: 7 },
      max: { type: Number, default: null, min: 0, max: 7 },
    },
  },
  { timestamps: true },
)

habitDefinitionSchema.index({ userId: 1, key: 1 }, { unique: true })

export interface HabitDefinitionDoc {
  _id?: Types.ObjectId
  userId: Types.ObjectId
  key: string
  label: string
  order: number
  type: 'boolean' | 'purchase'
  weeklyGoal: { min: number | null; max: number | null }
}

export const HabitDefinition = model('HabitDefinition', habitDefinitionSchema)