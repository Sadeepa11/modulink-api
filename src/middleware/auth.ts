// ============================================================
// Authentication Middleware
// Verifies the JWT in the Authorization header and attaches
// the decoded payload to req.user for use in route handlers.
// ============================================================

import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { JwtPayload } from '../types';

const JWT_SECRET =
  process.env.JWT_SECRET || 'modulink_super_secret_key_change_in_production';

/**
 * protect — middleware that guards private routes.
 *
 * How to use:
 *   router.get('/private', protect, (req, res) => {
 *     // req.user.id is available here
 *   });
 */
const protect = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided. Please log in.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify and decode — throws if expired or tampered with
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
};

export default protect;
