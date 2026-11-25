// Returns the listener description if something on the host is bound to the port, else null.
export async function portOwner(port: number): Promise<string | null> {
  const p = Bun.spawn(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fcp"], { stdout: "pipe", stderr: "ignore" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  if (!out.trim()) return null;
  const cmd = out.split("\n").find((l) => l.startsWith("c"))?.slice(1) ?? "?";
  const pid = out.split("\n").find((l) => l.startsWith("p"))?.slice(1) ?? "?";
  return `${cmd} (pid ${pid})`;
}

export async function busyPorts(ports: number[]): Promise<{ port: number; owner: string }[]> {
  const res = await Promise.all(ports.map(async (port) => ({ port, owner: await portOwner(port) })));
  return res.filter((r): r is { port: number; owner: string } => r.owner !== null);
}
