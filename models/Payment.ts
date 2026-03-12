import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId;
  loanId: mongoose.Types.ObjectId;
  amount: number;
  type: 'given' | 'interest';
  date: Date;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    loanId: { type: Schema.Types.ObjectId, ref: 'Loan', required: true },
    amount: {
      type: Number,
      required: [true, 'Please provide a payment amount'],
      min: 0,
    },
    type: {
      type: String,
      enum: ['given', 'interest'],
      default: 'given',
    },
    date: { type: Date, required: true, default: () => new Date() },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

if (mongoose.models.Payment) {
  delete (mongoose.models as any).Payment;
}

export default mongoose.model<IPayment>('Payment', paymentSchema);
