import { Schema, model, Document } from "mongoose";

/**
 * A generic counter document used for generating monotonically increasing
 * integer sequences. One document per named counter (e.g. "eventId").
 *
 * Why a dedicated collection instead of MAX(eventId) + 1?
 *   MAX(eventId) + 1 requires a full index scan and is not atomic —
 *   two concurrent inserts could read the same MAX and both try to use it.
 *   findOneAndUpdate + $inc is a single atomic operation in MongoDB,
 *   guaranteed to hand out each integer exactly once even under high concurrency.
 */
export interface ICounter extends Document {
  /** Identifier for this sequence, e.g. "eventId" */
  name: string;
  /** Current value — the last integer that was handed out */
  seq: number;
}

const counterSchema = new Schema<ICounter>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    seq: {
      type: Number,
      default: 0,
    },
  },
  { versionKey: false }
);

export const Counter = model<ICounter>("Counter", counterSchema);
