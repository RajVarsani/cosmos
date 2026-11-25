// the console's glyphs; size comes from the button that holds them
const P = { fill: "none", stroke: "currentColor" } as const;

export const IconOpen = () => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.4"><path d="M9.5 3H13v3.5M13 3 7.5 8.5M11 9.5V13H3V5h3.5" /></svg>;
export const IconCopy = () => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.4"><rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.6" /><path d="M10.5 5.5V4.2c0-.7-.5-1.2-1.2-1.2H4.2C3.5 3 3 3.5 3 4.2v5.1c0 .7.5 1.2 1.2 1.2h1.3" /></svg>;
export const IconShare = () => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.4"><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c1.6 1.6 2.3 3.5 2.3 5.5S9.6 11.9 8 13.5M8 2.5C6.4 4.1 5.7 6 5.7 8s.7 3.9 2.3 5.5" /></svg>;
export const IconEye = () => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.4"><path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8Z" /><circle cx="8" cy="8" r="2" /></svg>;
export const IconLogs = () => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.4"><path d="M3 4h10M3 8h7M3 12h9" /></svg>;
export const IconStop = () => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.4"><rect x="4" y="4" width="8" height="8" rx="1.5" /></svg>;
export const IconStart = () => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.4" strokeLinejoin="round"><path d="M5 3.5v9l7.5-4.5z" /></svg>;
export const IconRemove = () => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.4"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></svg>;
export const IconUp = ({ style }: { style?: React.CSSProperties }) => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.5" style={style}><path d="M4 10l4-4 4 4" /></svg>;
export const IconDown = () => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.5"><path d="M4 6l4 4 4-4" /></svg>;
export const IconX = () => <svg viewBox="0 0 12 12" {...P} strokeWidth="1.5" style={{ width: 11, height: 11 }}><path d="M2 2l8 8M10 2l-8 8" /></svg>;
export const IconSearch = () => <svg viewBox="0 0 16 16" {...P} strokeWidth="1.5"><circle cx="7" cy="7" r="4.6" /><path d="M10.4 10.4 14 14" /></svg>;
