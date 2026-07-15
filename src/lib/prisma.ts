// ============================================================
// Shared Prisma Client
// One PrismaClient instance is reused across all route files.
// Creating a new instance per-file wastes DB connections.
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
