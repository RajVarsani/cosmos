// shown in place of the scene when WebGL is missing or the engine throws on start
export function Fallback({ msg }: { msg: string | null }) {
  return (
    <div className="cz-fb" id="cz-fb" hidden={msg == null}>
      {msg == null ? null : `3D view unavailable (${msg}). Every system is still reachable from the command palette.`}
    </div>
  );
}
