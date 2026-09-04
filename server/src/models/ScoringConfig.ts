import { Schema, model } from 'mongoose'

const scoringHabitSchema = new Schema(
  {
    habitKey: { type: String, required: true, maxlength: 40 },
    enabled: { type: Boolean, default: true },
    direction: { type: String, enum: ['positive', 'negative'], default: 'positive' },
    points: { type: Number, default: 10, min: 0, max: 100 },
    cap: { type: Number, default: 10, min: 0, max: 100 },
  },
  { _id: false },
)

const scoringConfigSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    baseline: { type: Number, default: 60, min: 0, max: 100 },
    habits: { type: [scoringHabitSchema], default: [] },
    qualityThresholds: {
      excellent: { type: Number, default: 75, min: 0, max: 100 },
      average: { type: Number, default: 50, min: 0, max: 100 },
    },
  },
  { timestamps: true },
)

export const ScoringConfig = model('ScoringConfig', scoringConfigSchema)