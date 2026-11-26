export async function openUrl(url: string): Promise<void> {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  const p = Bun.spawn([cmd, url], { stdout: "ignore", stderr: "pipe" });
  if ((await p.exited) !== 0 && cmd !== "explorer") throw new Error(`${cmd} ${url} failed: ${(await new Response(p.stderr).text()).trim() || "no output"}`);
}
