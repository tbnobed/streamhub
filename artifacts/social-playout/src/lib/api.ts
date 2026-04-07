import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

const base = import.meta.env.BASE_URL ?? "/";
const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
const API_BASE = `${normalized}/api`;

setBaseUrl(normalized || undefined);

let storedToken: string | null = localStorage.getItem("auth_token");

export function getToken(): string | null {
  return storedToken;
}

export function saveToken(token: string): void {
  storedToken = token;
  localStorage.setItem("auth_token", token);
}

export function clearToken(): void {
  storedToken = null;
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
}

setAuthTokenGetter(() => storedToken);

export function apiBase(): string {
  return API_BASE;
}
