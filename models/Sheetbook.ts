import mongoose, { Schema, Document } from 'mongoose';

/**
 * The Sheets scratchpad: one workbook document per user.
 *
 * Deliberately schema-less inside `doc` — the grid is free-form notes, not
 * structured CRM data, so it is stored exactly as the client holds it.
 */
export interface ISheetbook extends Document {
  userId: mongoose.Types.ObjectId;
  doc: unknown;
  /** The workbook as it was before the most recent save, kept as a safety net. */
  backup?: unknown;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const sheetbookSchema = new Schema<ISheetbook>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    doc: { type: Schema.Types.Mixed, required: true },
    backup: { type: Schema.Types.Mixed },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false },
);

export default (mongoose.models.Sheetbook as mongoose.Model<ISheetbook>) ||
  mongoose.model<ISheetbook>('Sheetbook', sheetbookSchema);
