import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { saveToken, clearToken, getToken } from "@/lib/api";
import { apiBase } from "@/lib/api";

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  timezone: string;
  displayName?: string | null;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateTimezone: (timezone: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getToken());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("auth_user");
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        /* ignore */
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    const res = await fetch(`${apiBase()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message ?? "Invalid credentials");
    }

    const data = await res.json();
    saveToken(data.token);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("auth_user", JSON.stringify(data.user));
  };

  const updateTimezone = async (timezone: string) => {
    const currentToken = getToken();
    if (!currentToken) return;
    const res = await fetch(`${apiBase()}/auth/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ timezone }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUser(updated);
      localStorage.setItem("auth_user", JSON.stringify(updated));
    }
  };

  const logout = () => {
    clearToken();
    setToken(null);
    setUser(null);
    localStorage.removeItem("auth_user");
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateTimezone }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
