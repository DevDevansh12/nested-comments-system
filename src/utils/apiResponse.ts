import { Response } from "express";
import { ApiResponse } from "../types/api";

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  message?: string
): void {
  const body: ApiResponse<T> = { success: true, data, message };
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  errors?: string[]
): void {
  const body: ApiResponse = { success: false, message, errors };
  res.status(statusCode).json(body);
}
