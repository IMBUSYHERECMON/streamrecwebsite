import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Library from "./pages/Library";
import VideoPlayer from "./pages/VideoPlayer";
import Archive from "./pages/Archive";
import Settings from "./pages/Settings";
import { Layout } from "./components/layout";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Library} />
        <Route path="/library" component={Library} />
        <Route path="/video/:id" component={VideoPlayer} />
        <Route path="/archive" component={Archive} />
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
