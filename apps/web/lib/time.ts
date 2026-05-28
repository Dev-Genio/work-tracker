export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function startOfWeek(d: Date = new Date()): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sun
  x.setDate(x.getDate() - day);
  return x;
}

export function formatHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function parseRange(searchParams: URLSearchParams): { from: Date; to: Date } {
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const from = fromStr ? new Date(fromStr) : startOfDay();
  const to = toStr ? new Date(toStr) : endOfDay();
  return { from, to };
}

export function isoDate(d: Date): string {
  // Local date (YYYY-MM-DD), NOT UTC. Using toISOString() here shifted "today"
  // to the UTC day, which near local midnight produced the wrong day and a
  // misaligned query range.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
