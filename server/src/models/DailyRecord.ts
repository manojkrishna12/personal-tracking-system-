import { Schema, model } from 'mongoose'

const habitEntrySchema = new Schema(
  {
    habitKey: { type: String, required: true, maxlength: 40 },
    // Absence of a habit entry in the array = Not Recorded (neutral, never penalized).
    status: { type: String, enum: ['completed', 'not_completed'] },
    details: { type: String, default: null, maxlength: 500 },
    reason: { type: String, default: null, maxlength: 500 },
  },
  { _id: false },
)

const purchaseSchema = new Schema(
  {
    item: { type: String, required: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 0, max: 10_000_000 },
    category: { type: String, required: true, maxlength: 40 },
    necessary: { type: Boolean, default: true },
    notes: { type: String, default: null, maxlength: 500 },
  },
  { _id: false },
)

const dailyRecordSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    habits: { type: [habitEntrySchema], default: [] },
    purchases: { type: [purchaseSchema], default: [] },
    score: { type: Number, min: 0, max: 100 },
    quality: { type: String, enum: ['excellent', 'average', 'poor'] },
    scoreBreakdown: {
      type: [
        {
          habitKey: String,
          label: String,
          effect: Number,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
)

// One record per user per date — duplicate day records are impossible (principle 10).
dailyRecordSchema.index({ userId: 1, date: 1 }, { unique: true })

export const DailyRecord = model('DailyRecord', dailyRecordSchema)