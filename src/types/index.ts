// ============================================================
// Shared TypeScript types for the ModuLink backend
// ============================================================

// -------------------------------------------------------
// JWT Payload
// The data stored inside every JWT token.
// We attach this to req.user after verifying the token.
// -------------------------------------------------------
export interface JwtPayload {
  id: number;     // User's database ID
  email: string;  // User's email address
  iat?: number;   // Issued At (added automatically by jsonwebtoken)
  exp?: number;   // Expiry (added automatically by jsonwebtoken)
}

// -------------------------------------------------------
// Express Request augmentation
// Adds req.user so every route handler gets type-safe access
// to the logged-in user's ID and email without casting.
// -------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
    }
  }
}
