export const isTauri = (): boolean => {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
};

export type Capability =
  | "screen_capture"
  | "gh_commits"
  | "process_list"
  | "system_stats";

export const capabilitiesFor = (tauri: boolean): Capability[] =>
  tauri
    ? ["screen_capture", "gh_commits", "process_list", "system_stats"]
    : ["screen_capture"];

export interface CaptureFrame {
  takenAt: string;
  jpegBase64: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memMb: number;
}

export interface SystemStats {
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
}

export interface GhCommit {
  repo: string;
  sha: string;
  message: string;
  committedAt: string;
}

export interface CaptureBatch {
  startedAt: string;
  endedAt: string;
  frames: CaptureFrame[];
  processes?: ProcessInfo[];
  system?: SystemStats;
  commits?: GhCommit[];
}

export interface VlmSummary {
  activity: string;
  app: string | null;
  projectGuess: string | null;
  tasks: string[];
  focusScore: number;
}
