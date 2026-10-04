import { MongoClient } from '../backend/node_modules/mongodb/lib/index.js';
import { writeFileSync } from 'node:fs';

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 5000 });
const result = {};
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'carewindow');
  result.ping = await db.command({ ping: 1 });
  result.collections = await db.listCollections({}, { nameOnly: true }).toArray();
  result.counts = {};
  for (const collection of result.collections) result.counts[collection.name] = await db.collection(collection.name).countDocuments();
} catch (error) {
  result.error = { name: error.name, code: error.code, message: error.message };
  result.servers = [...(error.reason?.servers?.values() ?? [])].map(server => ({
    type: server.type,
    error: server.error ? { name: server.error.name, code: server.error.code, message: server.error.message, cause: server.error.cause ? { name: server.error.cause.name, code: server.error.cause.code, message: server.error.cause.message } : undefined } : null,
  }));
} finally {
  await client.close();
}
// No credentials or URI are logged. This script only reads the database.
console.log(JSON.stringify(result, null, 2));
writeFileSync(new URL('mongo-readonly.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
