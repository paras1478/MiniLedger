import { PrismaPg } from '@prisma/adapter-pg';

import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// Prisma 7 connects through a driver adapter; this one uses node-postgres (`pg`).
// Force UTC sessions: the adapter sends timestamps without an offset, so on a server whose
// TimeZone is e.g. Asia/Calcutta every stored time would be shifted by the server's offset
// (and raw-SQL comparisons with now() would be off by hours).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, options: '-c TimeZone=UTC' });

export const prisma = new PrismaClient({ adapter });
