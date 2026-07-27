import bcrypt from "bcrypt";
import { User } from "../models/user.model";
import { AppError } from "../utils/AppError";
import { signToken } from "../utils/jwt";
import { RegisterDto, LoginDto, AuthTokenResponse, IUserPublic } from "../types/auth";
import { Types } from "mongoose";

/** Number of bcrypt salt rounds. 12 is a solid production default. */
const SALT_ROUNDS = 12;

/**
 * Strips the password hash from a Mongoose document and returns the
 * plain public-safe object. Using a helper keeps the stripping logic
 * in one place and prevents accidental leaks in new endpoints.
 */
function toPublicUser(doc: {
  _id: Types.ObjectId;
  username: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}): IUserPublic {
  return {
    _id: doc._id,
    username: doc.username,
    email: doc.email,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Registers a new user.
 * - Checks for duplicate email / username before hashing to give
 *   a clear error rather than a Mongoose duplicate-key crash.
 * - Password is hashed here in the service; the model never stores plaintext.
 */
export async function register(dto: RegisterDto): Promise<AuthTokenResponse> {
  // Check for conflicts first so we surface a readable 409 error
  const existingEmail = await User.findOne({ email: dto.email.toLowerCase() });
  if (existingEmail) {
    throw new AppError("Email is already registered", 409);
  }

  const existingUsername = await User.findOne({ username: dto.username });
  if (existingUsername) {
    throw new AppError("Username is already taken", 409);
  }

  const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

  const user = await User.create({
    username: dto.username,
    email: dto.email.toLowerCase(),
    password: hashedPassword,
  });

  const publicUser = toPublicUser(user);
  const token = signToken({
    sub: user._id.toString(),
    username: user.username,
    email: user.email,
  });

  return { user: publicUser, token };
}

/**
 * Logs in a user.
 * - Uses .select("+password") to fetch the hash (excluded by default on the model).
 * - Uses bcrypt.compare — timing-safe comparison that prevents timing attacks.
 * - Returns a generic "Invalid credentials" error for both bad email AND bad
 *   password so we don't leak whether an email exists in the system.
 */
export async function login(dto: LoginDto): Promise<AuthTokenResponse> {
  // Explicitly request the password field that is hidden by default
  const user = await User.findOne({ email: dto.email.toLowerCase() }).select("+password");

  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  const passwordMatch = await bcrypt.compare(dto.password, user.password);
  if (!passwordMatch) {
    throw new AppError("Invalid credentials", 401);
  }

  const publicUser = toPublicUser(user);
  const token = signToken({
    sub: user._id.toString(),
    username: user.username,
    email: user.email,
  });

  return { user: publicUser, token };
}

/**
 * Fetches the current authenticated user by their ID (taken from the JWT payload).
 * The password field is excluded by the model's `select: false` setting.
 */
export async function getMe(userId: string): Promise<IUserPublic> {
  const user = await User.findById(userId).lean();

  if (!user) {
    // Should not happen in normal flow — token payload references a valid user
    throw new AppError("User not found", 404);
  }

  return toPublicUser(user);
}
