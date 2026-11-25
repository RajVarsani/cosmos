export const LV_ERR = /(\b(ERROR|FATAL|PANIC|CRITICAL|CRIT|EMERG)\b|Traceback \(most recent|\b[A-Z]\w*(Error|Exception)\b|\bError:|level=(error|fatal|panic)|"level"\s*:\s*"(error|fatal|panic)"|\[(error|fatal)\]|npm ERR!|\bpanic:)/;
export const LV_WARN = /(\b(WARN|WARNING)\b|\bWarning:|level=warn|"level"\s*:\s*"warn(ing)?"|\[warn(ing)?\]|DeprecationWarning)/;
export type Lv = "" | "warn" | "error" | "sys";
export const levelOf = (t: string): Lv => (LV_ERR.test(t) ? "error" : LV_WARN.test(t) ? "warn" : "");
