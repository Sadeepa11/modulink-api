// ============================================================
// Story Routes — Instagram-style ephemeral content (24 h)
//   GET  /api/stories  — Active stories from followed users
//   POST /api/stories  — Create a new story
// ============================================================

import { Router, Request, Response } from 'express';
import multer, { StorageEngine } from 'multer';
import path from 'path';

import prisma from '../lib/prisma';
import protect from '../middleware/auth';

const router = Router();

const storage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `story_${req.user?.id ?? 'anon'}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Images only'));
      return;
    }
    cb(null, true);
  },
});

// ── GET /api/stories ─────────────────────────────────────────
router.get('/', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    const following = await prisma.follow.findMany({
      where:  { followerId: req.user.id },
      select: { followingId: true },
    });

    const authorIds = [req.user.id, ...following.map((f) => f.followingId)];

    const stories = await prisma.story.findMany({
      where: {
        authorId:  { in: authorIds },
        expiresAt: { gt: new Date() }, // Only non-expired stories
      },
      include: {
        author: { select: { id: true, username: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by author so the frontend shows one circle per user
    const grouped: Record<number, { user: typeof stories[0]['author']; stories: typeof stories }> = {};

    stories.forEach((story) => {
      const uid = story.author.id;
      if (!grouped[uid]) grouped[uid] = { user: story.author, stories: [] };
      grouped[uid].stories.push(story);
    });

    res.json(Object.values(grouped));
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ error: 'Failed to get stories.' });
  }
});

// ── POST /api/stories ────────────────────────────────────────
router.post('/', protect, upload.single('media'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'A story requires an image.' });
    return;
  }

  const { caption } = req.body as { caption?: string };
  const expiresAt   = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24 hours

  try {
    const story = await prisma.story.create({
      data: {
        mediaUrl:  `/uploads/${req.file.filename}`,
        caption:   caption ?? null,
        authorId:  req.user.id,
        expiresAt,
      },
      include: {
        author: { select: { id: true, username: true, name: true, avatar: true } },
      },
    });

    res.status(201).json(story);
  } catch (error) {
    console.error('Create story error:', error);
    res.status(500).json({ error: 'Failed to create story.' });
  }
});

export default router;
