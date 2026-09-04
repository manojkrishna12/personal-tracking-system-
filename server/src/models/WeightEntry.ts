import { Schema, model } from 'mongoose'

const weightEntrySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    weightKg: { type: Number, required: true, min: 20, max: 300 },
    note: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true },
)

// One entry per user per date — re-recording a date updates the existing entry.
weightEntrySchema.index({ userId: 1, date: 1 }, { unique: true })

export const WeightEntry = model('WeightEntry', weightEntrySchema)