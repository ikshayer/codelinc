import { Db, MongoClient } from "mongodb";

const DEFAULT_DATABASE = "carewindow";

declare global {
  var __carewindowMongoClient: MongoClient | undefined;
}

function connectionUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required. Copy backend/.env.example to backend/.env.local and configure it.");
  }
  return uri;
}

/** One process-wide pool, including during development module reloads. */
export function getMongoClient(): MongoClient {
  globalThis.__carewindowMongoClient ??= new MongoClient(connectionUri(), {
    appName: "carewindow",
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15_000,
  });
  return globalThis.__carewindowMongoClient;
}

export function getDatabase(): Db {
  return getMongoClient().db(process.env.MONGODB_DB || DEFAULT_DATABASE);
}

export async function closeDatabase(): Promise<void> {
  if (!globalThis.__carewindowMongoClient) return;
  await globalThis.__carewindowMongoClient.close();
  globalThis.__carewindowMongoClient = undefined;
}
