// ============================================================
// Post Routes — Instagram-style feed
//   GET    /api/posts              — Home feed
//   GET    /api/posts/user/:userId — User's posts
//   POST   /api/posts              — Create post
//   DELETE /api/posts/:id          — Delete own post
//   POST   /api/posts/:id/like     — Toggle like
//   GET    /api/posts/:id/comments — Get comments
//   POST   /api/posts/:id/comments — Add comment
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
    cb(null, `post_${req.user?.id ?? 'anon'}_${Date.now()}${ext}`);
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

// ── GET /api/posts — home feed ───────────────────────────────
router.get('/', protect, async (req: Request, res: Response): Promise<void> => {
  const page     = parseInt((req.query.page as string) || '1', 10);
  const pageSize = 10;

  try {
    const followingRecords = await prisma.follow.findMany({
      where:  { followerId: req.user.id },
      select: { followingId: true },
    });

    const authorIds = [req.user.id, ...followingRecords.map((f) => f.followingId)];

    const posts = await prisma.post.findMany({
      where:   { authorId: { in: authorIds } },
      include: {
        author: { select: { id: true, username: true, name: true, avatar: true } },
        likes:  { select: { userId: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    });

    res.json(
      posts.map((post) => ({
        ...post,
        isLiked: post.likes.some((l) => l.userId === req.user.id),
        likes:   undefined,
      }))
    );
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed.' });
  }
});

// ── GET /api/posts/user/:userId ──────────────────────────────
router.get('/user/:userId', protect, async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.userId as string, 10);

  try {
    const posts = await prisma.post.findMany({
      where:   { authorId: userId },
      include: {
        author: { select: { id: true, username: true, name: true, avatar: true } },
        likes:  { select: { userId: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      posts.map((post) => ({
        ...post,
        isLiked: post.likes.some((l) => l.userId === req.user.id),
        likes:   undefined,
      }))
    );
  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ error: 'Failed to get posts.' });
  }
});

// ── POST /api/posts ──────────────────────────────────────────
router.post('/', protect, async (req: Request, res: Response): Promise<void> => {
  const { caption, image } = req.body as { caption?: string; image?: string };

  if (!image && !caption) {
    res.status(400).json({ error: 'A post needs at least an image or caption.' });
    return;
  }

  try {
    const post = await prisma.post.create({
      data: {
        caption:  caption ?? null,
        mediaUrl: image ?? null, // Store base64 image data directly
        authorId: req.user.id,
      },
      include: {
        author: { select: { id: true, username: true, name: true, avatar: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    res.status(201).json({ ...post, isLiked: false });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// ── DELETE /api/posts/:id ────────────────────────────────────
router.delete('/:id', protect, async (req: Request, res: Response): Promise<void> => {
  const postId = parseInt(req.params.id as string, 10);

  try {
    const post = await prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }

    if (post.authorId !== req.user.id) {
      res.status(403).json({ error: 'You can only delete your own posts.' });
      return;
    }

    await prisma.post.delete({ where: { id: postId } });
    res.json({ message: 'Post deleted.' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post.' });
  }
});

// ── POST /api/posts/:id/like — toggle ────────────────────────
router.post('/:id/like', protect, async (req: Request, res: Response): Promise<void> => {
  const postId = parseInt(req.params.id as string, 10);

  try {
    const existing = await prisma.like.findUnique({
      where: { userId_postId: { userId: req.user.id, postId } },
    });

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      const likeCount = await prisma.like.count({ where: { postId } });
      res.json({ isLiked: false, likeCount });
    } else {
      await prisma.like.create({ data: { userId: req.user.id, postId } });
      const likeCount = await prisma.like.count({ where: { postId } });
      res.json({ isLiked: true, likeCount });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to toggle like.' });
  }
});

// ── GET /api/posts/:id/comments ──────────────────────────────
router.get('/:id/comments', protect, async (req: Request, res: Response): Promise<void> => {
  const postId = parseInt(req.params.id as string, 10);

  try {
    const comments = await prisma.comment.findMany({
      where:   { postId },
      include: { user: { select: { id: true, username: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    });

    res.json(comments);
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments.' });
  }
});

// ── POST /api/posts/:id/comments ─────────────────────────────
router.post('/:id/comments', protect, async (req: Request, res: Response): Promise<void> => {
  const postId  = parseInt(req.params.id as string, 10);
  const { content } = req.body as { content?: string };

  if (!content?.trim()) {
    res.status(400).json({ error: 'Comment cannot be empty.' });
    return;
  }

  try {
    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        userId:  req.user.id,
        postId,
      },
      include: { user: { select: { id: true, username: true, name: true, avatar: true } } },
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment.' });
  }
});

export default router;
