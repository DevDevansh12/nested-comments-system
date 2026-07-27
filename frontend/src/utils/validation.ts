import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please provide a valid email address'),
  password: z
    .string()
    .min(5, 'Password must be at least 5 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please provide a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export const commentSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(1000, 'Message cannot exceed 1000 characters'),
});

export type RegisterFormData = z.infer<typeof registerSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type CommentFormData = z.infer<typeof commentSchema>;
