import { Link, useLocation } from "wouter";
import { HardDrive, Library, Settings, Download } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  // Static library — videos are CDN-hosted, no backend required
  const isHealthy = true;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row font-sans">
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border bg-card/40 flex-shrink-0 flex flex-col relative z-10 backdrop-blur-sm">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
            <HardDrive className="w-5 h-5 text-primary" />
          </div>
          <span className="font-semibold text-xl tracking-tight text-foreground/90">TubeVault</span>
        </div>
        <nav className="flex-1 px-4 pb-4 flex md:flex-col gap-2 overflow-x-auto md:overflow-visible no-scrollbar">
          <Link href="/">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer whitespace-nowrap ${location === "/" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground font-normal"}`}>
              <Library className="w-5 h-5" />
              <span>Library</span>
            </div>
          </Link>
          <Link href="/archive">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer whitespace-nowrap ${location === "/archive" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground font-normal"}`}>
              <Download className="w-5 h-5" />
              <span>Archive</span>
            </div>
          </Link>
          <Link href="/settings">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer whitespace-nowrap ${location === "/settings" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground font-normal"}`}>
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </div>
          </Link>
        </nav>
        
        <div className="p-4 mt-auto border-t border-border/50 hidden md:block">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black/20 border border-white/5">
            <div className="relative flex h-2.5 w-2.5">
              {isHealthy ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
              )}
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isHealthy ? "System Online" : "System Offline"}
            </span>
          </div>
        </div>
      </aside>
      <main className="flex-1 h-[100dvh] overflow-y-auto relative bg-gradient-to-br from-background to-background/50">
        <div className="absolute inset-0 pointer-events-none opacity-[0.015] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
        <div className="relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}
