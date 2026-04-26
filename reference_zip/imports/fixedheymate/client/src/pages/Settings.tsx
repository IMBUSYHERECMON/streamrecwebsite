import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HardDrive, Film, Clock, Trash2, Loader2, CheckCircle2, Cookie } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";

export default function Settings() {
  const { data: videos, isLoading, refetch } = trpc.videos.list.useQuery();
  const purge = trpc.videos.purgeExpired.useMutation({
    onSuccess: (data) => {
      toast.success(`Purged ${data.deleted} expired video${data.deleted !== 1 ? "s" : ""}`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const utils = trpc.useUtils();

  const totalSize = videos?.reduce((acc, v) => acc + (v.fileSize ?? 0), 0) ?? 0;
  const expiringSoon = videos?.filter(v => differenceInDays(new Date(v.expiresAt), new Date()) <= 7).length ?? 0;
  const channels = videos ? Array.from(new Set(videos.map(v => v.channel))) : [];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Vault overview and management</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card/60 border-border/50">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Film className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{isLoading ? "—" : videos?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Archived Videos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{isLoading ? "—" : formatBytes(totalSize)}</p>
              <p className="text-xs text-muted-foreground">Total Storage</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{isLoading ? "—" : expiringSoon}</p>
              <p className="text-xs text-muted-foreground">Expiring in 7 Days</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Channels */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Archived Channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channels archived yet.</p>
          ) : (
            channels.map(ch => {
              const count = videos?.filter(v => v.channel === ch).length ?? 0;
              return (
                <div key={ch} className="flex items-center justify-between p-3 rounded-lg bg-background/30 border border-border/40">
                  <span className="font-medium text-sm text-foreground">{ch}</span>
                  <Badge variant="secondary">{count} video{count !== 1 ? "s" : ""}</Badge>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Cookies status */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cookie className="w-4 h-4" />
            YouTube Cookies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-foreground">Cookies configured — age-restricted and unlisted videos supported</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Cookies are stored server-side and used automatically when archiving videos.
          </p>
        </CardContent>
      </Card>

      {/* Auto-delete policy */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Auto-Delete Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Archived videos automatically expire <strong className="text-foreground">30 days</strong> after they are archived. You can manually purge expired videos below.
          </p>
          <Button
            variant="outline"
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => purge.mutate()}
            disabled={purge.isPending}
          >
            {purge.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Purge Expired Videos
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
