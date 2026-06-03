/**
 * Lightweight Drizzle query-builder mock for unit tests.
 *
 * The real services build chains like:
 *   db.select({...}).from(t).where(w).orderBy(o).limit(l).offset(off)
 *   db.select({...}).from(t).where(w)               // awaited directly
 *   db.insert(t).values({...}).returning({...})
 *   db.update(t).set({...}).where(w).returning({...})
 *   db.update(t).set({...}).where(w)                // awaited directly
 *
 * Every chain method returns the same thenable chain object. Terminal results
 * are served from a FIFO queue: each time a chain is awaited (or `.returning()`
 * is awaited) it shifts the next programmed result off the queue. This lets a
 * test script the exact sequence of DB reads/writes a service performs.
 *
 * NOTE: the injected `db` object itself is intentionally NOT thenable — only
 * the chain returned by its entry methods is. If `db` were thenable, the NestJS
 * DI container would await the `useValue` provider and resolve it to a result.
 */
export interface DrizzleMock {
  /** The object injected as the DRIZZLE provider. */
  db: any;
  /** Push results (in call order) that awaited chains will resolve to. */
  queue: (rows: unknown) => void;
  /** Reset the queue. */
  reset: () => void;
}

export function createDrizzleMock(): DrizzleMock {
  const results: unknown[] = [];
  const next = (): unknown => (results.length > 0 ? results.shift() : []);

  const chain: any = {};
  const ret = (): any => chain;

  chain.from = jest.fn(ret);
  chain.where = jest.fn(ret);
  chain.orderBy = jest.fn(ret);
  chain.limit = jest.fn(ret);
  chain.offset = jest.fn(ret);
  chain.values = jest.fn(ret);
  chain.set = jest.fn(ret);
  chain.leftJoin = jest.fn(ret);
  chain.innerJoin = jest.fn(ret);
  chain.groupBy = jest.fn(ret);
  chain.having = jest.fn(ret);
  chain.returning = jest.fn(() => Promise.resolve(next()));
  chain.execute = jest.fn(() => Promise.resolve(next()));
  // Make the chain a thenable so `await chain` resolves to the next result.
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(next()).then(resolve, reject);

  const db: any = {
    select: jest.fn(ret),
    insert: jest.fn(ret),
    update: jest.fn(ret),
    delete: jest.fn(ret),
    execute: jest.fn(() => Promise.resolve(next())),
    transaction: jest.fn(async (cb: (tx: any) => unknown) => cb(db)),
  };
  // The transaction callback receives a tx that supports the same chain entry
  // points plus the chain methods (some services call tx.select(...).where()).
  Object.assign(db, {
    from: chain.from,
    where: chain.where,
    values: chain.values,
    set: chain.set,
    returning: chain.returning,
  });

  return {
    db,
    queue: (rows: unknown) => {
      results.push(rows);
    },
    reset: () => {
      results.length = 0;
    },
  };
}
