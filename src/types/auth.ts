import { Types } from "mongoose";

/** Safe public representation of a user — password is never included. */
export interface IUserPublic {
  _id: Types.ObjectId;
  username: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload encoded inside a JWT. Keeps the token small. */
export interface JwtPayload {
  sub: string; // user _id as string
  username: string;
  email: string;
}

export interface RegisterDto {
  username: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthTokenResponse {
  user: IUserPublic;
  token: string;
}
