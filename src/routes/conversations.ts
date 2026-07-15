// ============================================================
// Conversation Routes
//   GET  /api/conversations       — List user's conversations (with unread count)
//   POST /api/conversations       — Create a DM or group chat
//   GET  /api/conversations/:id   — Get one conversation
// ============================================================

import { Router, Request, Response } from 'express';

import prisma from '../lib/prisma';
import protect from '../middleware/auth';

const router = Router();

// ── GET /api/conversations ───────────────────────────────────
router.get('/', protect, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user.id;

  try {
    // Fetch conversations with last message preview
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, name: true, avatar: true, isOnline: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (conversations.length === 0) {
      res.json([]);
      return;
    }

    // Batch-fetch unread counts for all conversations in ONE query
    // groupBy gives { conversationId, _count: { id: N } } for unread messages
    const conversationIds = conversations.map((c) => c.id);

    const unreadGroups = await prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: conversationIds },
        senderId:       { not: userId },   // Not sent by the current user
        status:         { not: 'read' },   // Not yet read
      },
      _count: { id: true },
    });

    // Build a lookup map: conversationId → unread count
    const unreadMap: Record<number, number> = {};
    unreadGroups.forEach((g) => {
      unreadMap[g.conversationId] = g._count.id;
    });

    // Merge unreadCount into each conversation object
    const result = conversations.map((c) => ({
      ...c,
      unreadCount: unreadMap[c.id] ?? 0,
    }));

    res.json(result);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations.' });
  }
});

// ── POST /api/conversations ──────────────────────────────────
router.post('/', protect, async (req: Request, res: Response): Promise<void> => {
  const { participantIds, isGroup = false, name } = req.body as {
    participantIds?: number[];
    isGroup?: boolean;
    name?: string;
  };

  if (!participantIds || participantIds.length === 0) {
    res.status(400).json({ error: 'At least one participant is required.' });
    return;
  }

  const allIds = [...new Set([req.user.id, ...participantIds])];

  // For DMs, return existing conversation instead of creating a duplicate
  if (!isGroup && allIds.length === 2) {
    const existing = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: allIds[0] } } },
          { participants: { some: { userId: allIds[1] } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, name: true, avatar: true, isOnline: true },
            },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (existing) {
      res.json({ ...existing, unreadCount: 0 });
      return;
    }
  }

  try {
    const conversation = await prisma.conversation.create({
      data: {
        isGroup,
        name: isGroup ? name : null,
        participants: {
          create: allIds.map((userId) => ({ userId })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, name: true, avatar: true, isOnline: true },
            },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    res.status(201).json({ ...conversation, unreadCount: 0 });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation.' });
  }
});

// ── GET /api/conversations/:id ───────────────────────────────
router.get('/:id', protect, async (req: Request, res: Response): Promise<void> => {
  const conversationId = parseInt(req.params.id as string, 10);

  try {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId: req.user.id } },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true, username: true, name: true,
                avatar: true, isOnline: true, lastSeen: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation.' });
  }
});

export default router;
