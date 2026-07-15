// ============================================================
// Message Routes
//   GET /api/messages/:conversationId          — Message history
//   POST /api/messages                         — Send a message
//   PUT /api/messages/:conversationId/read     — Mark as read
// ============================================================

import { Router, Request, Response } from 'express';
import multer, { StorageEngine } from 'multer';
import path from 'path';

import prisma from '../lib/prisma';
import protect from '../middleware/auth';

const router = Router();

const storage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `msg_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Images only'));
      return;
    }
    cb(null, true);
  },
});

// ── GET /api/messages/:conversationId ────────────────────────
router.get('/:conversationId', protect, async (req: Request, res: Response): Promise<void> => {
  const conversationId = parseInt(req.params.conversationId as string, 10);
  const page      = parseInt((req.query.page as string) || '1', 10);
  const pageSize  = 30;

  try {
    // Verify the user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        userId_conversationId: { userId: req.user.id, conversationId },
      },
    });

    if (!participant) {
      res.status(403).json({ error: 'Access denied to this conversation.' });
      return;
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: { select: { id: true, username: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Reverse so oldest message is at the top of the chat screen
    res.json(messages.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages.' });
  }
});

// ── POST /api/messages ───────────────────────────────────────
router.post('/', protect, upload.single('media'), async (req: Request, res: Response): Promise<void> => {
  const { conversationId, content, messageType = 'text' } = req.body as {
    conversationId?: string;
    content?: string;
    messageType?: string;
  };

  if (!conversationId) {
    res.status(400).json({ error: 'conversationId is required.' });
    return;
  }

  if (!content && !req.file) {
    res.status(400).json({ error: 'Message must have content or media.' });
    return;
  }

  const convId = parseInt(conversationId, 10);

  try {
    // Security check — must be a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        userId_conversationId: { userId: req.user.id, conversationId: convId },
      },
    });

    if (!participant) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const message = await prisma.message.create({
      data: {
        content:         content ?? null,
        mediaUrl,
        messageType:     req.file ? 'image' : messageType,
        senderId:        req.user.id,
        conversationId:  convId,
        status:          'sent',
      },
      include: {
        sender: { select: { id: true, username: true, name: true, avatar: true } },
      },
    });

    await prisma.conversation.update({
      where: { id: convId },
      data:  { updatedAt: new Date() },
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// ── PUT /api/messages/:conversationId/read ───────────────────
router.put('/:conversationId/read', protect, async (req: Request, res: Response): Promise<void> => {
  const conversationId = parseInt(req.params.conversationId as string, 10);

  try {
    await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: req.user.id },
        status:   { not: 'read' },
      },
      data: { status: 'read' },
    });

    res.json({ message: 'Messages marked as read.' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read.' });
  }
});

export default router;
