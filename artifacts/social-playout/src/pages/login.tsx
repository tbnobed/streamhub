import { useState } from "react";
import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Signal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const { user, login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Redirect to="/dashboard" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    try {
      await login(username, password);
      setLocation("/dashboard");
    } catch (err) {
      toast({ variant: "destructive", title: "Login failed", description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Signal className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Social Playout Manager</h1>
          <p className="text-muted-foreground text-sm">Streaming Operations Center</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your credentials to access the control plane</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Default: <code className="bg-muted px-1 rounded">admin</code> /&nbsp;
          <code className="bg-muted px-1 rounded">admin123</code>
        </p>
      </div>
    </div>
  );
}
