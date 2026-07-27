import { Schema, model, Document, Types } from "mongoose";

/**
 * Full Mongoose document interface — includes the password hash.
 * This type stays inside the data layer and is NEVER sent over the wire.
 */
export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  email: string;
  password: string; // bcrypt hash
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      // Enforce uniqueness at the DB level in addition to service-layer checks
      unique: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      unique: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    // The password field is excluded from all queries by default via `select: false`.
    // Any query that needs the hash (login) must explicitly call .select("+password").
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const User = model<IUser>("User", userSchema);
