export function recent(): string[] { try { const r = JSON.parse(localStorage.getItem("cosmos-recent") || "[]"); return Array.isArray(r) ? r : []; } catch { return []; } }
export function remember(id: string) { try { localStorage.setItem("cosmos-recent", JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 5))); } catch {} }
