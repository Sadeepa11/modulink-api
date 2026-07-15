// ============================================================
// User Routes
//   GET    /api/users/search         — Search by username/name
//   GET    /api/users/:id            — Get a user's public profile
//   PUT    /api/users/profile        — Update own profile
//   POST   /api/users/:id/follow     — Follow a user
//   DELETE /api/users/:id/follow     — Unfollow a user
// ============================================================

import { Router, Request, Response } from 'express';
import multer, { StorageEngine } from 'multer';
import path from 'path';

import prisma from '../lib/prisma';
import protect from '../middleware/auth';

const router = Router();

// ── Multer — profile picture uploads ─────────────────────────
const storage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${req.user?.id ?? 'anon'}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// ── GET /api/users/search?q=john ─────────────────────────────
router.get('/search', protect, async (req: Request, res: Response): Promise<void> => {
  const query = (req.query.q as string) || '';

  if (query.length < 1) {
    res.json([]);
    return;
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query } },
          { name:     { contains: query } },
        ],
        NOT: { id: req.user.id },
      },
      select: { id: true, username: true, name: true, avatar: true, isOnline: true },
      take: 20,
    });

    res.json(users);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ── GET /api/users — all users A-Z (except self) ─────────────
router.get('/', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where:   { NOT: { id: req.user.id } },
      select:  { id: true, username: true, name: true, avatar: true, isOnline: true, bio: true },
      orderBy: [{ name: 'asc' }, { username: 'asc' }],
    });
    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users.' });
  }
});

// ── PUT /api/users/push-token ────────────────────────────────
// Saves (or clears) the device's Expo push token so the server
// can send notifications when the user is offline.
router.put('/push-token', protect, async (req: Request, res: Response): Promise<void> => {
  const { pushToken } = req.body as { pushToken?: string };

  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { pushToken: pushToken ?? null },
    });
    res.json({ message: 'Push token saved.' });
  } catch (error) {
    console.error('Push token error:', error);
    res.status(500).json({ error: 'Failed to save push token.' });
  }
});

// ── GET /api/users/:id ───────────────────────────────────────
router.get('/:id', protect, async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id as string, 10);

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, name: true,
        avatar: true, bio: true, isOnline: true,
        lastSeen: true, createdAt: true,
        _count: { select: { posts: true, followers: true, following: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const isFollowing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: req.user.id, followingId: userId },
      },
    });

    res.json({ ...user, isFollowing: !!isFollowing });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user.' });
  }
});

// ── PUT /api/users/profile ───────────────────────────────────
router.put(
  '/profile',
  protect,
  upload.single('avatar'),
  async (req: Request, res: Response): Promise<void> => {
    const { name, bio } = req.body as { name?: string; bio?: string };

    try {
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name   = name;
      if (bio  !== undefined) updateData.bio    = bio;
      if (req.file)           updateData.avatar = `/uploads/${req.file.filename}`;

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: updateData,
        select: { id: true, username: true, name: true, avatar: true, bio: true },
      });

      res.json(user);
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  }
);

// ── POST /api/users/:id/follow ───────────────────────────────
router.post('/:id/follow', protect, async (req: Request, res: Response): Promise<void> => {
  const followingId = parseInt(req.params.id as string, 10);
  const followerId  = req.user.id;

  if (followerId === followingId) {
    res.status(400).json({ error: 'You cannot follow yourself.' });
    return;
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: followingId } });
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
    });

    res.json({ message: 'Following successfully.' });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Failed to follow user.' });
  }
});

// ── DELETE /api/users/:id/follow ─────────────────────────────
router.delete('/:id/follow', protect, async (req: Request, res: Response): Promise<void> => {
  const followingId = parseInt(req.params.id as string, 10);
  const followerId  = req.user.id;

  try {
    await prisma.follow.deleteMany({ where: { followerId, followingId } });
    res.json({ message: 'Unfollowed successfully.' });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ error: 'Failed to unfollow user.' });
  }
});

export default router;
