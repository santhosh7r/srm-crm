import mongoose, { Schema, Document } from 'mongoose';

export interface ILoan extends Document {
  userId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  disposeAmount: number;
  interestAmount: number;
  totalAmount: number;
  startDate: Date;
  endDate?: Date;
  status: 'active' | 'completed' | 'overdue';
  balance: number;
  totalPaid: number;
  createdAt: Date;
  updatedAt: Date;
}

const loanSchema = new Schema<ILoan>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    disposeAmount: { type: Number, required: true, min: 0 },
    interestAmount: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true, default: () => new Date() },
    endDate: { type: Date },
    status: {
      type: String,
      enum: ['active', 'completed', 'overdue'],
      default: 'active',
    },
    balance: { type: Number, required: true, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

const Loan: mongoose.Model<ILoan> =
  (mongoose.models['Loan'] as mongoose.Model<ILoan>) ||
  mongoose.model<ILoan>('Loan', loanSchema);

export default Loan;
