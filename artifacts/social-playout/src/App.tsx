import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/context/auth";
import { queryClient } from "@/lib/query-client";
import "@/lib/api";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import ChannelsPage from "@/pages/channels";
import ChannelDetailPage from "@/pages/channel-detail";
import AssetsPage from "@/pages/assets";
import PlaylistsPage from "@/pages/playlists";
import PlaylistEditorPage from "@/pages/playlist-editor";
import LiveInputsPage from "@/pages/live-inputs";
import DestinationsPage from "@/pages/destinations";
import YouTubePage from "@/pages/youtube";
import WorkersPage from "@/pages/workers";
import LogsPage from "@/pages/logs";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        {() => <Redirect to="/dashboard" />}
      </Route>
      <Route path="/dashboard">
        {() => <ProtectedRoute><DashboardPage /></ProtectedRoute>}
      </Route>
      <Route path="/channels">
        {() => <ProtectedRoute><ChannelsPage /></ProtectedRoute>}
      </Route>
      <Route path="/channels/:id">
        {() => <ProtectedRoute><ChannelDetailPage /></ProtectedRoute>}
      </Route>
      <Route path="/assets">
        {() => <ProtectedRoute><AssetsPage /></ProtectedRoute>}
      </Route>
      <Route path="/playlists">
        {() => <ProtectedRoute><PlaylistsPage /></ProtectedRoute>}
      </Route>
      <Route path="/playlists/:id">
        {() => <ProtectedRoute><PlaylistEditorPage /></ProtectedRoute>}
      </Route>
      <Route path="/live-inputs">
        {() => <ProtectedRoute><LiveInputsPage /></ProtectedRoute>}
      </Route>
      <Route path="/destinations">
        {() => <ProtectedRoute><DestinationsPage /></ProtectedRoute>}
      </Route>
      <Route path="/youtube">
        {() => <ProtectedRoute><YouTubePage /></ProtectedRoute>}
      </Route>
      <Route path="/workers">
        {() => <ProtectedRoute><WorkersPage /></ProtectedRoute>}
      </Route>
      <Route path="/logs">
        {() => <ProtectedRoute><LogsPage /></ProtectedRoute>}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppInner() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <AppInner />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
