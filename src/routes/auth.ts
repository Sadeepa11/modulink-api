// ============================================================
// Authentication Routes
//   POST /api/auth/register  — Create a new account
//   POST /api/auth/login     — Log in and receive a JWT token
//   GET  /api/auth/me        — Get current user's profile (protected)
// ============================================================

import bcrypt from 'bcryptjs';
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import prisma from '../lib/prisma';
import protect from '../middleware/auth';

const router = Router();

const JWT_SECRET =
  process.env.JWT_SECRET || 'modulink_super_secret_key_change_in_production';

// Helper — create a JWT token valid for 7 days
const generateToken = (userId: number, email: string): string =>
  jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });

// ── POST /api/auth/register ──────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, username, password, name } = req.body as {
    email?: string;
    username?: string;
    password?: string;
    name?: string;
  };

  if (!email || !username || !password) {
    res.status(400).json({ error: 'Email, username, and password are required.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }

  try {
    // Reject if email or username is already taken
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      res.status(409).json({ error: 'Email or username already taken.' });
      return;
    }

    // Hash the password — never store plain text
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        name: name || username,
      },
    });

    const token = generateToken(user.id, user.email);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Use a generic message so attackers can't tell which field is wrong
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // Mark user as online on login
    await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: true, lastSeen: new Date() },
    });

    const token = generateToken(user.id, user.email);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
        bio: user.bio,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        avatar: true,
        bio: true,
        isOnline: true,
        createdAt: true,
        _count: {
          select: { followers: true, following: true, posts: true },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

export default router;
