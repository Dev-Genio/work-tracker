export type StorageMode = "cloud" | "local";

export const STORAGE_MODE_COOKIE = "wt-storage-mode";
const LS_KEY = "wt.storageMode";

/** Client-side read. Cookie is the source of truth (server can read it too);
 *  localStorage is a mirror for fast sync access. */
export function getStorageMode(): StorageMode {
  if (typeof document !== "undefined") {
    const m = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${STORAGE_MODE_COOKIE}=`))
      ?.split("=")[1];
    if (m === "local" || m === "cloud") return m;
  }
  if (typeof window !== "undefined") {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "local" || v === "cloud") return v;
  }
  return "cloud";
}

export function isLocalMode(): boolean {
  return getStorageMode() === "local";
}

/** Persist to both cookie (1 year) and localStorage. */
export function setStorageMode(mode: StorageMode): void {
  if (typeof document !== "undefined") {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${STORAGE_MODE_COOKIE}=${mode}; path=/; max-age=${maxAge}; samesite=lax`;
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LS_KEY, mode);
  }
}

/** Parse the mode from a raw Cookie header value (server-side). */
export function storageModeFromCookieHeader(
  cookieHeader: string | null | undefined,
): StorageMode {
  if (!cookieHeader) return "cloud";
  const m = cookieHeader
    .split("; ")
    .find((c) => c.startsWith(`${STORAGE_MODE_COOKIE}=`))
    ?.split("=")[1];
  return m === "local" ? "local" : "cloud";
}
