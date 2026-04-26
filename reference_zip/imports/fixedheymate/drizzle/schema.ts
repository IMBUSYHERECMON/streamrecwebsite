import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Archived videos table
export const videos = mysqlTable("videos", {
  id: int("id").autoincrement().primaryKey(),
  youtubeId: varchar("youtubeId", { length: 32 }).notNull().unique(),
  title: text("title").notNull(),
  channel: varchar("channel", { length: 255 }).notNull(),
  channelId: varchar("channelId", { length: 64 }),
  description: text("description"),
  uploadDate: varchar("uploadDate", { length: 16 }), // YYYYMMDD from yt-dlp
  duration: int("duration"), // seconds
  fileSize: bigint("fileSize", { mode: "number" }),
  cdnUrl: text("cdnUrl").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  status: mysqlEnum("status", ["pending", "downloading", "done", "error"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  archivedAt: timestamp("archivedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(), // 30 days after archivedAt
});

export type Video = typeof videos.$inferSelect;
export type InsertVideo = typeof videos.$inferInsert;