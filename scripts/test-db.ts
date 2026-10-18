// A throwaway MongoDB on this PC (port 27999) for checking accounts and chat in the browser, without the owner's Atlas data.
//   bun scripts/test-db.ts            (keep it running; Ctrl+C stops it and everything in it is gone)
// Then start the "server-test-db" preview (.claude/launch.json), which uses scripts/test-db.env.
import { MongoMemoryServer } from 'mongodb-memory-server';

const db = await MongoMemoryServer.create({ instance: { port: 27999 } });
console.log(`Test MongoDB running at ${db.getUri()} - press Ctrl+C to stop it (its data is thrown away).`);
process.on('SIGINT', async () => { await db.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30); // keep running
