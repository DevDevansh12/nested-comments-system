import { Request } from "express";
import { IUserPublic } from "./auth";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      /**
       * Populated by the auth middleware after a valid JWT is verified.
       * Contains the public user shape — never the password hash.
       */
      user?: IUserPublic;
    }
  }
}

export type TypedRequest<
  TBody = Record<string, unknown>,
  TQuery = Record<string, string>,
  TParams = Record<string, string>,
> = Request<TParams, unknown, TBody, TQuery>;
