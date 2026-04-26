import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Loader2, CheckCircle2, XCircle, Link2, Clock, HardDrive, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { formatDuration } from "@/lib/format";

type ArchivePhase = "idle" | "fetching-meta" | "queued" | "downloading" | "done" | "error";

const PHASE_LABELS: Record<ArchivePhase, string> = {
  idle: "",
  "fetching-meta": "Fetching video info...",
  queued: "Download queued — starting...",
  downloading: "Downloading & uploading to CDN...",
  done: "Archived successfully!",
  error: "Archive failed",
};

export default function Archive() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<ArchivePhase>("idle");
  const [pollingId, setPollingId] = useState<number | null>(null);
  const [, setLocation] = useLocation();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMeta = trpc.videos.fetchMeta.useMutation();
  const archiveMutation = trpc.videos.archive.useMutation();
  const pollQuery = trpc.videos.get.useQuery(
    { id: pollingId! },
    {
      enabled: pollingId !== null && (phase === "queued" || phase === "downloading"),
      refetchInterval: 3000, // poll every 3 seconds
      staleTime: 0,
    }
  );
  const utils = trpc.useUtils();

  // React to poll results
  useEffect(() => {
    if (!pollQuery.data) return;
    const status = pollQuery.data.status;
    if (status === "done") {
      setPhase("done");
      utils.videos.list.invalidate();
      toast.success("Video archived successfully!");
      setTimeout(() => setLocation(`/video/${pollingId}`), 1200);
    } else if (status === "error") {
      setPhase("error");
      toast.error(pollQuery.data.errorMessage || "Archive failed");
    } else if (status === "downloading") {
      setPhase("downloading");
    }
  }, [pollQuery.data]);

  const handleFetchMeta = async () => {
    if (!url.trim()) return;
    setPhase("fetching-meta");
    try {
      await fetchMeta.mutateAsync({ url: url.trim() });
      setPhase("idle");
    } catch (e: unknown) {
      setPhase("error");
      toast.error(e instanceof Error ? e.message : "Failed to fetch video info");
    }
  };

  const handleArchive = async () => {
    const targetUrl = url.trim();
    if (!targetUrl) return;
    setPhase("queued");
    try {
      const result = await archiveMutation.mutateAsync({ url: targetUrl });
      setPollingId(result.videoId);
      setPhase("downloading");
    } catch (e: unknown) {
      setPhase("error");
      toast.error(e instanceof Error ? e.message : "Archive failed");
    }
  };

  const handleReset = () => {
    setUrl("");
    setPhase("idle");
    setPollingId(null);
    fetchMeta.reset();
    archiveMutation.reset();
  };

  const meta = fetchMeta.data?.meta;
  const isActive = phase === "fetching-meta" || phase === "queued" || phase === "downloading";
  const isDone = phase === "done";
  const isError = phase === "error";

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Archive Video</h1>
        <p className="text-muted-foreground mt-1">Paste a YouTube URL to download and archive it permanently.</p>
      </div>

      {/* URL Input */}
      <Card className="bg-card/60 border-border/50 backdrop-blur-sm">
        <CardContent className="pt-6 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 bg-background/50 border-border/50 font-mono text-sm"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (!isActive) {
                    fetchMeta.reset();
                    archiveMutation.reset();
                    setPhase("idle");
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && !isActive && handleFetchMeta()}
                disabled={isActive || isDone}
              />
            </div>
            <Button
              onClick={handleFetchMeta}
              disabled={!url.trim() || isActive || isDone}
              variant="outline"
              className="shrink-0"
            >
              {phase === "fetching-meta" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Preview"}
            </Button>
          </div>

          {/* Meta preview skeleton while fetching */}
          {phase === "fetching-meta" && (
            <div className="rounded-xl border border-border/50 bg-background/30 p-4 flex gap-4">
              <Skeleton className="w-32 h-20 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          )}

          {/* Meta preview */}
          {meta && phase !== "fetching-meta" && (
            <div className="rounded-xl border border-border/50 bg-background/30 p-4 space-y-3">
              <div className="flex gap-4">
                {meta.thumbnail && (
                  <img
                    src={meta.thumbnail}
                    alt={meta.title}
                    width={128}
                    height={80}
                    className="w-32 h-20 object-cover rounded-lg shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold text-foreground leading-tight line-clamp-2">{meta.title}</p>
                  <p className="text-sm text-muted-foreground">{meta.channel}</p>
                  <div className="flex gap-2 flex-wrap">
                    {meta.duration && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(meta.duration)}
                      </Badge>
                    )}
                    {meta.upload_date && (
                      <Badge variant="secondary" className="text-xs">
                        {meta.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Archive button */}
          {!isDone && !isError && (meta || url.trim()) && (
            <Button
              onClick={handleArchive}
              disabled={!url.trim() || isActive}
              className="w-full gap-2 bg-primary hover:bg-primary/90"
              size="lg"
            >
              {isActive ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {PHASE_LABELS[phase]}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Archive Video
                </>
              )}
            </Button>
          )}

          {/* Progress steps */}
          {(isActive || isDone) && (
            <div className="space-y-2 text-sm">
              {(["fetching-meta", "queued", "downloading", "done"] as ArchivePhase[]).map((step) => {
                const stepIndex = ["fetching-meta", "queued", "downloading", "done"].indexOf(step);
                const currentIndex = ["fetching-meta", "queued", "downloading", "done"].indexOf(phase);
                const isComplete = stepIndex < currentIndex || phase === "done";
                const isCurrent = step === phase;
                const stepLabels: Record<string, string> = {
                  "fetching-meta": "Fetch video info",
                  queued: "Queue download",
                  downloading: "Download & upload to CDN",
                  done: "Save to library",
                };
                return (
                  <div key={step} className={`flex items-center gap-2 ${isComplete ? "text-emerald-400" : isCurrent ? "text-foreground" : "text-muted-foreground/40"}`}>
                    {isComplete ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-current shrink-0" />
                    )}
                    {stepLabels[step]}
                  </div>
                );
              })}
            </div>
          )}

          {/* Success */}
          {isDone && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Archived! Redirecting to player...
              </div>
              <Button size="sm" variant="outline" onClick={handleReset} className="gap-1">
                <RefreshCw className="w-3 h-3" /> Archive another
              </Button>
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-destructive text-sm">
                <XCircle className="w-4 h-4" />
                {archiveMutation.error?.message || "Archive failed"}
              </div>
              <Button size="sm" variant="outline" onClick={handleReset} className="gap-1">
                <RefreshCw className="w-3 h-3" /> Try again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="bg-card/40 border-border/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-primary" />
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Paste any YouTube video URL above and click <strong className="text-foreground">Preview</strong> to check the video info.</p>
          <p>2. Click <strong className="text-foreground">Archive Video</strong> — the download starts in the background immediately.</p>
          <p>3. Watch the progress steps update in real time. You'll be redirected to the player when done.</p>
          <p>4. Archived videos expire after <strong className="text-foreground">30 days</strong>. YouTube cookies are pre-configured for restricted videos.</p>
        </CardContent>
      </Card>
    </div>
  );
}
