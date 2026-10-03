// Drop into your React app (e.g. src/lib/api.ts). Talks to the Express API.
const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

let accessToken: string | null = null;
let workspaceId: string | null = localStorage.getItem("cf_workspace");
let refreshing: Promise<boolean> | null = null;

export const setAccessToken = (t: string | null) => (accessToken = t);
export const setWorkspaceId = (id: string | null) => {
  workspaceId = id;
  id ? localStorage.setItem("cf_workspace", id) : localStorage.removeItem("cf_workspace");
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public fields?: Record<string, string>) {
    super(message);
  }
}

async function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${API}/auth/refresh`, { method: "POST", credentials: "include" })
    .then(async (r) => {
      if (!r.ok) return false;
      accessToken = (await r.json()).accessToken;
      return true;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, any> } = {}, retry = true): Promise<T> {
  const qs = opts.query
    ? "?" + new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)]))
    : "";
  const res = await fetch(`${API}${path}${qs}`, {
    method: opts.method ?? "GET",
    credentials: "include", // sends the httpOnly refresh cookie
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && retry && !path.startsWith("/auth/") && (await refresh())) {
    return api<T>(path, opts, false);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.message ?? "Request failed", e?.code, e?.fields);
  }
  return data as T;
}

// ---- examples ----
// const { user, accessToken } = await api("/auth/login", { method: "POST", body: { email, password } });
// setAccessToken(accessToken);
// const { stats, myTasks } = await api("/dashboard");
// await api(`/tasks/${id}/move`, { method: "PATCH", body: { status: "review", position: 1500 } });
