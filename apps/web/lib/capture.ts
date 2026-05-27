"use client";

import type { CaptureBatch, CaptureFrame } from "@work-tracker/shared";

export interface CaptureLoopOptions {
  captureIntervalSec: number;
  batchIntervalSec: number;
  maxWidth?: number; // downscale longest side; default 1024
  jpegQuality?: number; // 0..1; default 0.7
  onFrame?: (frame: CaptureFrame, bufferSize: number) => void;
  onBatchReady: (batch: CaptureBatch) => Promise<void> | void;
  onError?: (err: unknown) => void;
}

export class CaptureLoop {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private buffer: CaptureFrame[] = [];
  private batchStart: Date = new Date();
  running = false;
  paused = false;

  constructor(private opts: CaptureLoopOptions) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 4 },
      audio: false,
    });

    // If the user stops sharing via the browser chrome, stop the loop.
    this.stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      void this.stop();
    });

    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play();

    this.canvas = document.createElement("canvas");
    this.batchStart = new Date();
    this.running = true;

    this.frameTimer = setInterval(
      () => void this.captureOne(),
      this.opts.captureIntervalSec * 1000,
    );
    this.batchTimer = setInterval(
      () => void this.flush(),
      this.opts.batchIntervalSec * 1000,
    );

    // Take one frame immediately so feedback is instant.
    void this.captureOne();
  }

  pause(): void {
    if (!this.running) return;
    this.paused = true;
  }

  resume(): void {
    if (!this.running) return;
    this.paused = false;
  }

  toggle(): boolean {
    this.paused = !this.paused;
    return this.paused;
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.frameTimer) clearInterval(this.frameTimer);
    if (this.batchTimer) clearInterval(this.batchTimer);
    this.frameTimer = this.batchTimer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
    this.canvas = null;
    if (this.buffer.length > 0) await this.flush();
  }

  private async captureOne(): Promise<void> {
    if (!this.video || !this.canvas || !this.running || this.paused) return;
    try {
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      if (!vw || !vh) return;

      const maxW = this.opts.maxWidth ?? 1024;
      const scale = Math.min(1, maxW / Math.max(vw, vh));
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      this.canvas.width = w;
      this.canvas.height = h;
      const ctx = this.canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(this.video, 0, 0, w, h);

      const dataUrl = this.canvas.toDataURL("image/jpeg", this.opts.jpegQuality ?? 0.7);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const frame: CaptureFrame = {
        takenAt: new Date().toISOString(),
        jpegBase64: base64,
      };
      this.buffer.push(frame);
      this.opts.onFrame?.(frame, this.buffer.length);
    } catch (e) {
      this.opts.onError?.(e);
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const frames = this.buffer;
    this.buffer = [];
    const startedAt = this.batchStart.toISOString();
    const endedAt = new Date().toISOString();
    this.batchStart = new Date();

    const batch: CaptureBatch = { startedAt, endedAt, frames };
    try {
      await this.opts.onBatchReady(batch);
    } catch (e) {
      this.opts.onError?.(e);
    }
  }
}
