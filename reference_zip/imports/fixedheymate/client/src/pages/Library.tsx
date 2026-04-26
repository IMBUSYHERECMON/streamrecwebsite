import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Play, Download, Clock, Film, Archive, Youtube } from "lucide-react";
import { formatDuration, formatBytes } from "@/lib/format";
import { differenceInDays, differenceInHours } from "date-fns";

function ExpiryBadge({ expiresAt }: { expiresAt: Date }) {
  const now = new Date();
  const daysLeft = differenceInDays(expiresAt, now);
  const hoursLeft = differenceInHours(expiresAt, now);
  if (hoursLeft <= 0) return <Badge variant="destructive" className="text-xs">Expired</Badge>;
  if (daysLeft <= 3) return <Badge variant="destructive" className="text-xs gap-1"><Clock className="w-3 h-3" />{daysLeft}d left</Badge>;
  if (daysLeft <= 7) return <Badge className="text-xs gap-1 bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3" />{daysLeft}d left</Badge>;
  return <Badge variant="secondary" className="text-xs gap-1"><Clock className="w-3 h-3" />{daysLeft}d left</Badge>;
}

export default function Library() {
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const { data: videos, isLoading } = trpc.videos.list.useQuery();

  const channels = videos ? Array.from(new Set(videos.map(v => v.channel))) : [];

  const filtered = (videos ?? []).filter(v => {
    const matchesQuery = query === "" || v.title.toLowerCase().includes(query.toLowerCase()) || v.channel.toLowerCase().includes(query.toLowerCase());
    const matchesChannel = channelFilter === "all" || v.channel === channelFilter;
    return matchesQuery && matchesChannel;
  });

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto min-h-full">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground">Archive</h1>
          <p className="text-muted-foreground mt-3 font-medium text-lg">
            {isLoading ? "Loading..." : `${videos?.length ?? 0} items securely stored`}
          </p>
        </div>
        <Link href="/archive">
          <Button className="gap-2">
            <Archive className="w-4 h-4" />
            Archive New Video
          </Button>
        </Link>
      </header>

      {/* Search */}
      <div className="relative mb-6 max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search videos..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-9 bg-card/40 border-border/60"
        />
      </div>

      {/* Channel Tabs */}
      {channels.length > 0 && (
        <div className="mb-8 overflow-x-auto pb-2">
          <Tabs value={channelFilter} onValueChange={setChannelFilter}>
            <TabsList className="bg-card/40 border border-border/60 h-12 p-1">
              <TabsTrigger value="all" className="px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all">
                All Videos
              </TabsTrigger>
              {channels.map(c => (
                <TabsTrigger key={c} value={c} className="px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all">
                  {c}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Skeleton loading grid */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-6 gap-y-10">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="aspect-video rounded-xl w-full" />
              <div className="px-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 bg-card/10 rounded-2xl border border-dashed border-border/40">
          <Film className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-medium text-muted-foreground">
            {query || channelFilter !== "all" ? "No videos found" : "No archived videos yet"}
          </h3>
          <p className="text-muted-foreground/70 mt-2">
            {query || channelFilter !== "all" ? "Try a different search term or channel." : "Archive your first video to get started."}
          </p>
          {!query && channelFilter === "all" && (
            <Link href="/archive">
              <Button className="mt-4 gap-2">
                <Archive className="w-4 h-4" />
                Archive a Video
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-6 gap-y-10">
          {filtered.map(video => (
            <div key={video.id} className="group flex flex-col gap-3">
              {/* Thumbnail */}
              <Link href={`/video/${video.id}`}>
                <div className="relative aspect-video rounded-xl overflow-hidden bg-card border border-border/50 shadow-sm transition-all duration-300 group-hover:shadow-xl group-hover:shadow-black/50 group-hover:border-primary/30 group-hover:-translate-y-1 cursor-pointer">
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      width={320}
                      height={180}
                      loading="lazy"
                      decoding="async"
                      className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full bg-card/60 flex items-center justify-center">
                      <Play className="w-10 h-10 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                    <div className="w-14 h-14 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-2xl transform scale-75 group-hover:scale-100 transition-transform duration-300 ease-out">
                      <Play className="w-6 h-6 ml-1.5" />
                    </div>
                  </div>
                  {video.duration && (
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                      {formatDuration(video.duration)}
                    </div>
                  )}
                </div>
              </Link>

              {/* Info */}
              <div className="flex flex-col px-1 gap-1.5">
                <Link href={`/video/${video.id}`}>
                  <h3 className="font-medium text-base leading-snug line-clamp-2 text-foreground/90 group-hover:text-primary transition-colors cursor-pointer" title={video.title}>
                    {video.title}
                  </h3>
                </Link>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <Youtube className="w-3.5 h-3.5" />
                    {video.channel}
                  </span>
                  <ExpiryBadge expiresAt={new Date(video.expiresAt)} />
                </div>
                <a
                  href={video.cdnUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors w-fit"
                  onClick={e => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" />
                  {video.fileSize ? formatBytes(video.fileSize) : "Download"}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
