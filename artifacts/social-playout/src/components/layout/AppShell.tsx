import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Tv2,
  Film,
  ListVideo,
  Radio,
  Share2,
  ServerCog,
  ScrollText,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/channels", label: "Channels", icon: Tv2 },
  { href: "/assets", label: "Assets", icon: Film },
  { href: "/playlists", label: "Playlists", icon: ListVideo },
  { href: "/live-inputs", label: "Live Inputs", icon: Radio },
  { href: "/destinations", label: "Destinations", icon: Share2 },
  { href: "/workers", label: "Workers", icon: ServerCog },
  { href: "/logs", label: "Audit Logs", icon: ScrollText },
];

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:static lg:z-auto"
        )}
      >
        {/* Logo */}
        <div className="h-16 px-6 flex items-center gap-3 border-b border-border">
          <img src="/logo.png" alt="OBR" className="w-8 h-8 rounded-lg object-contain" />
          <div>
            <div className="font-bold text-sm leading-none">Social Playout</div>
            <div className="text-xs text-muted-foreground leading-none mt-1">Operations Center</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href !== "/dashboard" && location.startsWith(href));
            return (
              <Link key={href} href={href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md mb-1 cursor-pointer text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
              {(user?.displayName ?? user?.username ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.displayName ?? user?.username}</div>
              <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card/80 backdrop-blur flex items-center px-6 gap-4 sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground hidden sm:inline">API Connected</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
