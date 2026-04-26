import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] w-full flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center max-w-md text-center p-8 bg-card/30 rounded-2xl border border-border/50 backdrop-blur-sm">
        <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-3">404 - Not Found</h1>
        <p className="text-muted-foreground mb-8 text-lg">
          The video or page you're looking for doesn't exist in your archive.
        </p>
        <Link href="/">
          <span className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-11 px-8 cursor-pointer">
            Return to Library
          </span>
        </Link>
      </div>
    </div>
  );
}
