import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";

type Owner = { pid: number; at: number; token: string };

const errCode = (e: unknown) => (e as { code?: string } | null)?.code;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return errCode(e) === "EPERM";
  }
}

function readOwner(dir: string): Owner | null {
  try {
    return JSON.parse(readFileSync(join(dir, "owner"), "utf8"));
  } catch {
    return null;
  }
}

function mtimeMs(dir: string): number | null {
  try {
    return statSync(dir).mtimeMs;
  } catch (e) {
    if (errCode(e) === "ENOENT") return null;
    throw e;
  }
}

// Atomically moves `dir` aside; only the process whose rename succeeds gets true.
function renameAside(dir: string): boolean {
  const grave = `${dir}.dead.${process.pid}.${crypto.randomUUID()}`;
  try {
    renameSync(dir, grave);
  } catch (e) {
    if (["ENOENT", "ENOTEMPTY", "EEXIST"].includes(errCode(e) ?? "")) return false;
    throw e;
  }
  rmSync(grave, { recursive: true, force: true });
  return true;
}

export type LockOpts = {
  // A live owner older than this is treated as hung. Infinity: only a dead pid breaks it.
  staleMs: number;
  waitMs: number;
  pollMs?: number;
  onWait?: () => void;
};

export class LockBusyError extends Error {}

export class DirLock {
  private token: string | null = null;
  constructor(readonly dir: string, readonly opts: LockOpts) {}

  private stale(owner: Owner | null, now: number): boolean {
    if (owner) return !pidAlive(owner.pid) || now - owner.at > this.opts.staleMs;
    // No owner file: a holder is between mkdir and write (fresh mtime) or crashed there (old mtime).
    const m = mtimeMs(this.dir);
    return m !== null && now - m > Math.min(this.opts.staleMs, 30_000);
  }

  // Serialises stale-lock breakers, so a second breaker re-reads the owner after the first one's new lock exists.
  private breakStale(): void {
    const guard = `${this.dir}.break`;
    try {
      mkdirSync(guard);
    } catch (e) {
      if (errCode(e) !== "EEXIST") throw e;
      const m = mtimeMs(guard);
      if (m !== null && Date.now() - m > 30_000) renameAside(guard);
      return;
    }
    try {
      if (this.stale(readOwner(this.dir), Date.now())) renameAside(this.dir);
    } finally {
      rmSync(guard, { recursive: true, force: true });
    }
  }

  tryAcquire(): boolean {
    try {
      mkdirSync(this.dir);
    } catch (e) {
      if (errCode(e) !== "EEXIST") throw e;
      if (this.stale(readOwner(this.dir), Date.now())) this.breakStale();
      return false;
    }
    const token = crypto.randomUUID();
    try {
      writeFileSync(join(this.dir, "owner"), JSON.stringify({ pid: process.pid, at: Date.now(), token } satisfies Owner));
    } catch (e) {
      if (errCode(e) === "ENOENT") return false;
      throw e;
    }
    this.token = token;
    return true;
  }

  async acquire(): Promise<void> {
    mkdirSync(dirname(this.dir), { recursive: true });
    const deadline = Date.now() + this.opts.waitMs;
    let waited = false;
    while (!this.tryAcquire()) {
      if (!waited) this.opts.onWait?.();
      waited = true;
      if (Date.now() > deadline) throw new LockBusyError(`lock busy: ${this.dir} (held by ${JSON.stringify(readOwner(this.dir))})`);
      await Bun.sleep(this.opts.pollMs ?? 50 + Math.random() * 100);
    }
  }

  // Releases only a lock this process still owns; a broken-and-retaken lock belongs to someone else.
  release(): void {
    if (!this.token) return;
    const owner = readOwner(this.dir);
    if (owner?.token === this.token) renameAside(this.dir);
    this.token = null;
  }
}

export async function withLock<T>(dir: string, opts: LockOpts, fn: () => Promise<T> | T): Promise<T> {
  const lock = new DirLock(dir, opts);
  await lock.acquire();
  try {
    return await fn();
  } finally {
    lock.release();
  }
}
