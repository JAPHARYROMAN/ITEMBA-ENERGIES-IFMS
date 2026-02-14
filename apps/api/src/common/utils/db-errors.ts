import { ConflictException } from '@nestjs/common';

const PG_UNIQUE_VIOLATION = '23505';

export interface PgError extends Error {
  code?: string;
  detail?: string;
  constraint?: string;
}

/**
 * If the error is a PostgreSQL unique constraint violation, throw ConflictException with a friendly message.
 * Otherwise rethrow the original error.
 */
export function throwConflictIfUniqueViolation(err: unknown, friendlyMessage: string): never {
  const pg = err as PgError;
  if (pg?.code === PG_UNIQUE_VIOLATION) {
    throw new ConflictException(friendlyMessage);
  }
  throw err;
}
