/**
 * Seed the 17 existing CDN-hosted videos into the database.
 * Run once: node scripts/seed-videos.mjs
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663539801223/24GUs4oxcqJjQnMUCXSU6r";

const VIDEOS = [
  { youtubeId: "dbaX16joLZY", title: "I Got CANCELLED From Subway!!!", channel: "Jumanne Alt", uploadDate: "20260407", cdnUrl: `${CDN}/I_Got_CANCELLED_From_Subway_8703ec51.mp4` },
  { youtubeId: "6zUu-bppvTA", title: "Insecurities & Anti Social Behavior", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/Insecurities_Anti_Social_Behavior_81505702.mp4` },
  { youtubeId: "nVuq5WAAPlg", title: "I Got CANCELLED From Subway (Part 2)", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/I_Got_CANCELLED_From_Subway_Part2_e784e6c5.mp4` },
  { youtubeId: "Rh_LgTVxDT4", title: "It's My Job To Expose Myself?!", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/Its_My_Job_To_Expose_Myself_e2f02df8.mp4` },
  { youtubeId: "oRzUko3zZXQ", title: "I Don't Know Where To Go From Here?", channel: "Jumanne", uploadDate: "20260402", cdnUrl: `${CDN}/I_Dont_Know_Where_To_Go_003be41f.mp4` },
  { youtubeId: "OQVx90FRFTw", title: "What It's Like Being Infamous: CVS, Pop Smoke, Subway Controversy", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/What_Its_Like_Being_Infamous_96548762.mp4` },
  { youtubeId: "Ja_1sPnuZ5g", title: "The Reason I Stalk Women", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/The_Reason_I_Stalk_Women_494e5021.mp4` },
  { youtubeId: "KV-oxuZ_III", title: "I'm Crazier Then What You Think I Am!", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/Im_Crazier_Then_What_You_Think_885bb400.mp4` },
  { youtubeId: "L1C6iF3NEr8", title: "I Feel Like I Lost!!!", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/I_Feel_Like_I_Lost_66ee6b67.mp4` },
  { youtubeId: "rOUQKrvdfMk", title: "I Hate Who I'm Becoming!", channel: "Jumanne", uploadDate: "20260408", cdnUrl: `${CDN}/I_Hate_Who_Im_Becoming_4e79e639.mp4` },
  { youtubeId: "UvgdruNXrNw", title: "I'm Not Sorry Natalie!", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/Im_Not_Sorry_Natalie_c3766c97.mp4` },
  { youtubeId: "ijQc1P7cEqg", title: "Feel How You Want About Me!", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/Feel_How_You_Want_About_Me_8aeca907.mp4` },
  { youtubeId: "a-20o36Pvx4", title: "It's Not About Me, But It Is!", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/Its_Not_About_Me_But_It_Is_22a65804.mp4` },
  { youtubeId: "P5ZgX8KLGmY", title: "Is Offset Really A Gambling Addict?", channel: "Jumanne", uploadDate: "20260407", cdnUrl: `${CDN}/Is_Offset_Really_A_Gambling_Addict_7084110f.mp4` },
  { youtubeId: "utaKujZhaOE", title: "If I Make You Feel Better About Yourself, Your Welcome!", channel: "Jumanne Alt", uploadDate: "20260407", cdnUrl: `${CDN}/If_I_Make_You_Feel_Better_5d13f793.mp4` },
  { youtubeId: "s-ORn82XMAY", title: "Jumanne: YouTube Revenue", channel: "Jumanne", uploadDate: "20260408", cdnUrl: `${CDN}/Jumanne_YouTube_Revenue_3ff577ac.mp4` },
  { youtubeId: "g3xnlxJ5l0c", title: "Deleting………", channel: "Jumanne", uploadDate: "20260404", cdnUrl: `${CDN}/Deleting_ae6af94f.mp4` },
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

const now = new Date();
const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

let inserted = 0;
let skipped = 0;

for (const v of VIDEOS) {
  try {
    await conn.execute(
      `INSERT IGNORE INTO videos (youtubeId, title, channel, uploadDate, cdnUrl, status, archivedAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, 'done', NOW(), ?)`,
      [v.youtubeId, v.title, v.channel, v.uploadDate, v.cdnUrl, expiresAt]
    );
    const [rows] = await conn.execute("SELECT ROW_COUNT() as cnt");
    if (rows[0].cnt > 0) { inserted++; console.log(`✅ ${v.title}`); }
    else { skipped++; console.log(`⏭  Skipped (already exists): ${v.title}`); }
  } catch (e) {
    console.error(`❌ ${v.title}:`, e.message);
  }
}

console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}`);
await conn.end();
