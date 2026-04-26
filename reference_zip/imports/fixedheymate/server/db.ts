import { eq, desc, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import { InsertUser, users, videos, InsertVideo, Video } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance with connection pooling.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = createPool(process.env.DATABASE_URL);
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ── Video helpers ────────────────────────────────────────────────────────────

export async function listVideos(offset = 0, limit = 50): Promise<Video[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(videos)
    .where(eq(videos.status, "done"))
    .orderBy(desc(videos.archivedAt))
    .limit(limit)
    .offset(offset);
}

export async function getVideoById(id: number): Promise<Video | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  return result[0];
}

export async function getVideoByYoutubeId(youtubeId: string): Promise<Video | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(videos).where(eq(videos.youtubeId, youtubeId)).limit(1);
  return result[0];
}

export async function createVideo(data: InsertVideo): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(videos).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateVideo(id: number, data: Partial<InsertVideo>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(videos).set(data).where(eq(videos.id, id));
}

export async function deleteVideo(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(videos).where(eq(videos.id, id));
}

export async function deleteExpiredVideos(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();
  const expired = await db.select().from(videos).where(lt(videos.expiresAt, now));
  if (expired.length === 0) return 0;
  await db.delete(videos).where(lt(videos.expiresAt, now));
  return expired.length;
}
