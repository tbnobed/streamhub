import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

function apiBase() {
  return import.meta.env.VITE_API_URL || `${window.location.origin}${import.meta.env.BASE_URL}api`;
}

export default function SetupAccountPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [token, setToken] = useState("");
  const [inviteInfo, setInviteInfo] = useState<{ email: string; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setError("No invitation token provided. Please use the link from your invitation email.");
      setLoading(false);
      return;
    }
    setToken(t);

    fetch(`${apiBase()}/invites/verify/${t}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Invalid invitation");
        } else {
          setInviteInfo(data);
        }
      })
      .catch(() => setError("Failed to verify invitation. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.length < 3) {
      toast({ variant: "destructive", title: "Username too short", description: "Username must be at least 3 characters." });
      return;
    }
    if (password.length < 6) {
      toast({ variant: "destructive", title: "Password too short", description: "Password must be at least 6 characters." });
      return;
    }
    if (password !== confirmPassword) {
      toast({ variant: "destructive", title: "Passwords don't match", description: "Please make sure both passwords match." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase()}/invites/setup-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Setup failed", description: data.error || "Something went wrong" });
      } else {
        setDone(true);
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to set up account. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-[800px] h-[800px] rounded-full bg-orange-500/[0.04] blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/[0.04] blur-3xl" />
      </div>

      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="text-center space-y-2">
          <img src="/logo.png" alt="OBR" className="w-24 h-24 rounded-2xl mx-auto object-contain" />
          <h1 className="text-2xl font-bold">Media Playout Manager</h1>
          <p className="text-muted-foreground text-sm">Account Setup</p>
        </div>

        {loading && (
          <Card className="backdrop-blur-sm bg-card/80 border-border/50">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Verifying invitation...</span>
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card className="backdrop-blur-sm bg-card/80 border-border/50">
            <CardContent className="py-8 text-center space-y-4">
              <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => setLocation("/login")}>Go to Sign In</Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && done && (
          <Card className="backdrop-blur-sm bg-card/80 border-border/50">
            <CardContent className="py-8 text-center space-y-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <div>
                <p className="font-semibold text-lg">Account Created</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your account is ready. You can now sign in with your username and password.
                </p>
              </div>
              <Button onClick={() => setLocation("/login")} className="w-full">Go to Sign In</Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && !done && inviteInfo && (
          <Card className="backdrop-blur-sm bg-card/80 border-border/50">
            <CardHeader>
              <CardTitle>Set Up Your Account</CardTitle>
              <CardDescription>
                Choose a username and password to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 p-3 rounded-md bg-accent/30 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{inviteInfo.email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Role</span>
                  <span className="font-medium capitalize">{inviteInfo.role}</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    required
                    minLength={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Setting up..." : "Create Account"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
