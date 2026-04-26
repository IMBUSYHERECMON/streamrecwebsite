/**
 * Update all seeded videos to use YouTube thumbnail URLs.
 * Run: node scripts/update-thumbnails.mjs
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
dotenv.config();

// YouTube video IDs mapped to their thumbnail URLs
const YOUTUBE_THUMBNAILS = [
  { youtubeId: "dbaX16joLZY" },
  { youtubeId: "6zUu-bppvTA" },
  { youtubeId: "nVuq5WAAPlg" },
  { youtubeId: "Rh_LgTVxDT4" },
  { youtubeId: "oRzUko3zZXQ" },
  { youtubeId: "OQVx90FRFTw" },
  { youtubeId: "Ja_1sPnuZ5g" },
  { youtubeId: "KV-oxuZ_III" },
  { youtubeId: "lIQ6c2xW2jA" },
  { youtubeId: "gJGLiMiLpEo" },
  { youtubeId: "Y5FVrpkuuQE" },
  { youtubeId: "HWEHsNcqGOE" },
  { youtubeId: "3Bm5LGvZzpg" },
  { youtubeId: "VmcYMnBJmkE" },
  { youtubeId: "5sSRhHYWjos" },
  { youtubeId: "xvFZjo5PgG0" },
  { youtubeId: "abc123defgh" },
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

// Dynamically import schema
const { videos } = await import("../drizzle/schema.ts").catch(async () => {
  // fallback: use raw SQL
  return { videos: null };
});

if (!videos) {
  // Use raw SQL
  for (const v of YOUTUBE_THUMBNAILS) {
    const thumbUrl = `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`;
    await conn.execute(
      "UPDATE videos SET thumbnailUrl = ? WHERE youtubeId = ? AND (thumbnailUrl IS NULL OR thumbnailUrl = '')",
      [thumbUrl, v.youtubeId]
    );
    console.log(`Updated ${v.youtubeId}`);
  }
} else {
  for (const v of YOUTUBE_THUMBNAILS) {
    const thumbUrl = `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`;
    await db.update(videos)
      .set({ thumbnailUrl: thumbUrl })
      .where(eq(videos.youtubeId, v.youtubeId));
    console.log(`Updated ${v.youtubeId}`);
  }
}

// Also update ALL videos that have no thumbnail using their youtubeId
await conn.execute(
  "UPDATE videos SET thumbnailUrl = CONCAT('https://i.ytimg.com/vi/', youtubeId, '/hqdefault.jpg') WHERE thumbnailUrl IS NULL OR thumbnailUrl = ''"
);
console.log("Updated all remaining videos with YouTube thumbnails");

await conn.end();
console.log("Done!");
