// Starts an in-process, wire-protocol-compatible Postgres server backed by
// PGlite (WASM Postgres) so this sandbox — which has no Docker daemon and
// therefore no real `postgres` service available — can still run real
// Prisma migrations and integration/E2E tests against genuine SQL semantics
// instead of mocking the database away. Not used in production; production
// targets real PostgreSQL per prisma/schema.prisma and docker-compose.yml.

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.PGLITE_PORT ?? 5432);
const dataDir = process.env.PGLITE_DATA_DIR; // undefined => in-memory

async function main() {
  const db = new PGlite(dataDir);
  await db.waitReady;

  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();

  console.log(`PGlite wire-protocol server listening on 127.0.0.1:${port} (data: ${dataDir ?? 'in-memory'})`);

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
