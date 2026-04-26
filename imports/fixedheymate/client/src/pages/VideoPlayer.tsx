import { trpc } from "@/lib/trpc";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Clock, Calendar, Loader2, AlertCircle, Youtube } from "lucide-react";
import { formatDuration, formatBytes } from "@/lib/format";
import { differenceInDays, differenceInHours, format } from "date-fns";

function ExpiryInfo({ expiresAt }: { expiresAt: Date }) {
  const now = new Date();
  const daysLeft = differenceInDays(expiresAt, now);
  const hoursLeft = differenceInHours(expiresAt, now);
  if (hoursLeft <= 0) return <Badge variant="destructive" className="gap-1.5"><Clock className="w-3.5 h-3.5" />Expired</Badge>;
  if (daysLeft <= 3) return <Badge variant="destructive" className="gap-1.5"><Clock className="w-3.5 h-3.5" />Expires in {daysLeft}d</Badge>;
  if (daysLeft <= 7) return <Badge className="gap-1.5 bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3.5 h-3.5" />Expires in {daysLeft}d</Badge>;
  return <Badge variant="secondary" className="gap-1.5"><Clock className="w-3.5 h-3.5" />Expires {format(expiresAt, "MMM d, yyyy")}</Badge>;
}

export default function VideoPlayer() {
  const [, params] = useRoute("/video/:id");
  const id = parseInt(params?.id ?? "0", 10);

  const { data: video, isLoading, error } = trpc.videos.get.useQuery({ id }, { enabled: !!id });
  const { data: allVideos } = trpc.videos.list.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto h-full flex flex-col items-center justify-center">
        <div className="bg-destructive/10 text-destructive p-6 rounded-xl border border-destructive/20 text-center max-w-md">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" />
          <h2 className="text-xl font-semibold mb-2">Video not found</h2>
          <p className="opacity-80">This video might have been deleted or expired.</p>
        </div>
        <div className="mt-8">
          <Link href="/">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Library
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const related = (allVideos ?? []).filter(v => v.channel === video.channel && v.id !== video.id).slice(0, 6);

  const uploadDateFormatted = video.uploadDate
    ? `${video.uploadDate.slice(0, 4)}-${video.uploadDate.slice(4, 6)}-${video.uploadDate.slice(6, 8)}`
    : null;

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8">
      <Link href="/">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 cursor-pointer transition-colors font-medium">
          <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center border border-border hover:border-primary hover:text-primary transition-all">
            <ArrowLeft className="w-4 h-4" />
          </div>
          <span>Back to Library</span>
        </div>
      </Link>

      {/* Video Player */}
      <div className="bg-black rounded-2xl overflow-hidden shadow-2xl mb-8 border border-border/40 relative z-20 ring-1 ring-white/5">
        <video
          controls
          className="w-full aspect-video focus:outline-none bg-black"
          src={video.cdnUrl}
          playsInline
        />
      </div>

      {/* Title & Actions */}
      <div className="px-2 md:px-4 max-w-5xl mb-10 space-y-4">
        <h1 className="text-2xl md:text-4xl font-semibold tracking-tight text-foreground leading-tight">
          {video.title}
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Youtube className="w-4 h-4" />
            <span className="font-medium text-foreground">{video.channel}</span>
          </div>
          {uploadDateFormatted && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              {format(new Date(uploadDateFormatted), "MMM d, yyyy")}
            </div>
          )}
          {video.duration && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              {formatDuration(video.duration)}
            </div>
          )}
          <ExpiryInfo expiresAt={new Date(video.expiresAt)} />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <a href={video.cdnUrl} download target="_blank" rel="noopener noreferrer">
            <Button className="gap-2">
              <Download className="w-4 h-4" />
              Download {video.fileSize ? `(${formatBytes(video.fileSize)})` : ""}
            </Button>
          </a>
          <a href={`https://www.youtube.com/watch?v=${video.youtubeId}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2">
              <Youtube className="w-4 h-4" />
              View on YouTube
            </Button>
          </a>
        </div>

        {/* Description */}
        {video.description && (
          <div className="mt-4 p-4 rounded-xl bg-card/40 border border-border/50">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-6">
              {video.description}
            </p>
          </div>
        )}
      </div>

      {/* Related Videos */}
      {related.length > 0 && (
        <div className="px-2 md:px-4">
          <h2 className="text-xl font-semibold mb-6 text-foreground">More from {video.channel}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map(v => (
              <Link key={v.id} href={`/video/${v.id}`}>
                <div className="group flex flex-col gap-3 cursor-pointer">
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-card border border-border/50 shadow-sm transition-all duration-300 group-hover:shadow-lg group-hover:border-primary/30 group-hover:-translate-y-0.5">
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt={v.title} loading="lazy" decoding="async" className="object-cover w-full h-full group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-full h-full bg-card/60 flex items-center justify-center">
                        <svg className="w-8 h-8 text-muted-foreground/30" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm font-medium line-clamp-2 text-foreground/90 group-hover:text-primary transition-colors px-1">
                    {v.title}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
