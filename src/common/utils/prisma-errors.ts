import { Prisma } from '@prisma/client';

const hasCode = (e: unknown, code: string) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;

export const isUniqueViolation = (e: unknown) => hasCode(e, 'P2002');
export const isRecordNotFound = (e: unknown) => hasCode(e, 'P2025');
