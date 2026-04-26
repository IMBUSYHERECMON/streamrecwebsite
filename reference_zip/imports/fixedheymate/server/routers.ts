import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  listVideos,
  getVideoById,
  deleteVideo,
  deleteExpiredVideos,
} from "./db";
import { startArchiveBackground, fetchVideoMeta } from "./archiver";

// Simple in-memory rate limiter — max 5 calls per IP per 60 seconds
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string, maxCalls = 5, windowMs = 60_000): void {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count++;
  if (entry.count > maxCalls) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded. Please wait a minute before archiving again." });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  videos: router({
    /** List all archived (done) videos with optional pagination */
    list: publicProcedure
      .input(z.object({ offset: z.number().default(0), limit: z.number().default(50) }).optional())
      .query(async ({ input }) => {
        return listVideos(input?.offset ?? 0, input?.limit ?? 50);
      }),

    /** Get a single video by DB id — used for polling archive status */
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const video = await getVideoById(input.id);
        if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
        return video;
      }),

    /** Fetch metadata for a YouTube URL (no download) — rate limited */
    fetchMeta: publicProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ input, ctx }) => {
        const ip = ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown";
        checkRateLimit(ip, 10, 60_000); // 10 meta fetches per minute
        try {
          const meta = await fetchVideoMeta(input.url);
          return { success: true as const, meta };
        } catch (err: unknown) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Failed to fetch video info" });
        }
      }),

    /** Start archive in background — returns videoId immediately, frontend polls status */
    archive: publicProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ input, ctx }) => {
        const ip = ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown";
        checkRateLimit(ip, 5, 60_000); // 5 archives per minute
        try {
          const videoId = await startArchiveBackground(input.url);
          return { success: true as const, videoId };
        } catch (err: unknown) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "Archive failed" });
        }
      }),

    /** Delete a video from DB */
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteVideo(input.id);
        return { success: true as const };
      }),

    /** Manually trigger expired video cleanup */
    purgeExpired: publicProcedure.mutation(async () => {
      const count = await deleteExpiredVideos();
      return { deleted: count };
    }),
  }),
});

export type AppRouter = typeof appRouter;
