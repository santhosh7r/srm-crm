import mongoose, { Schema, Document } from 'mongoose';

export interface IPlan extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  planType: 'weekly' | 'monthly';
  interestType: 'fixed' | 'percentage';
  duration?: number; // only for weekly plans
  createdAt: Date;
  updatedAt: Date;
}

const planSchema = new Schema<IPlan>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: [true, 'Plan name is required'] },
    description: { type: String, required: [true, 'Description is required'] },
    planType: {
      type: String,
      enum: ['weekly', 'monthly'],
      required: true,
      default: 'monthly',
    },
    interestType: {
      type: String,
      enum: ['fixed', 'percentage'],
      required: true,
      default: 'fixed',
    },
    duration: {
      type: Number,
      min: 1,
    },
  },
  { timestamps: true }
);

const Plan: mongoose.Model<IPlan> =
  (mongoose.models['Plan'] as mongoose.Model<IPlan>) ||
  mongoose.model<IPlan>('Plan', planSchema);

export default Plan;
