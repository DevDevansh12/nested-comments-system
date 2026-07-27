import { Router } from "express";
import { body } from "express-validator";
import * as authController from "../controllers/auth.controller";
import { validate } from "../middleware/validate.middleware";
import { protect } from "../middleware/auth.middleware";

const router = Router();

/**
 * Validation chains are defined inline here so the route file is the
 * single source of truth for what each endpoint accepts. Complex or
 * reusable rules could be extracted to a separate validators/ file.
 */

const registerValidation = [
  body("username")
    .trim()
    .notEmpty().withMessage("Username is required")
    .isLength({ min: 3, max: 30 }).withMessage("Username must be 3–30 characters")
    .matches(/^[a-zA-Z0-9_]+$/).withMessage("Username can only contain letters, numbers, and underscores"),

  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("password")
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 5 }).withMessage("Password must be at least 5 characters")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/).withMessage("Password must contain at least one number"),
];

const loginValidation = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Please provide a valid email address"),

  body("password")
    .notEmpty().withMessage("Password is required"),
];

// Public routes
router.post("/register", registerValidation, validate, authController.register);
router.post("/login", loginValidation, validate, authController.login);

// Protected routes — `protect` middleware verifies the JWT before the handler runs
router.get("/me", protect, authController.getMe);

export default router;
