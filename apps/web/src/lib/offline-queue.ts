"use client";

// Offline-first check-in queue (§7): IndexedDB queue -> sync on reconnect.
// The check-in UI writes here FIRST and completes instantly; flushing to
// Supabase happens opportunistically. Her phone being offline never blocks
// or loses a check-in.

import type { SupabaseClient } from "@supabase/supabase-js";

const DB_NAME = "strainx";
const STORE = "queue";

type QueueItem = {
  id: string;
  table: string;
  payload: Record<string, unknown>;
  queued_at: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function enqueue(table: string, payload: Record<string, unknown>): Promise<void> {
  const db = await openDb();
  const item: QueueItem = {
    id: crypto.randomUUID(),
    table,
    payload,
    queued_at: new Date().toISOString(),
  };
  await tx(db, "readwrite", (s) => s.put(item));
}

export async function flushQueue(supabase: SupabaseClient): Promise<number> {
  const db = await openDb();
  const items = (await tx<QueueItem[]>(db, "readonly", (s) => s.getAll() as IDBRequest<QueueItem[]>)) ?? [];
  let flushed = 0;
  for (const item of items) {
    const { error } = await supabase.from(item.table).insert(item.payload);
    // 23505 = already inserted (e.g. duplicate day) — safe to drop from queue.
    if (!error || error.code === "23505") {
      await tx(db, "readwrite", (s) => s.delete(item.id));
      flushed++;
    }
  }
  return flushed;
}

export function startAutoFlush(supabase: SupabaseClient): () => void {
  const onOnline = () => { void flushQueue(supabase); };
  window.addEventListener("online", onOnline);
  void flushQueue(supabase); // flush anything left over from last session
  return () => window.removeEventListener("online", onOnline);
}
