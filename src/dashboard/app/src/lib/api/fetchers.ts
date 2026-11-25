import axios from "axios";
import type { Fetcher } from "swr";

type Method = "get" | "post" | "put" | "delete";

// x-cosmos forces a preflight other sites cannot pass; the server refuses posts without it
export const http = axios.create({ headers: { "content-type": "application/json", "x-cosmos": "1" } });

const reason = (e: unknown) => {
  const r = (e as { response?: { status?: number; data?: { error?: string } } }).response;
  return Object.assign(new Error(r?.data?.error || (r?.status ? `HTTP ${r.status}` : (e as Error).message)), { body: r?.data });
};

export const genericAPIFetcher: Fetcher<any, [string, Method, ...unknown[]]> = async ([url, type, ...rest]) => {
  try {
    return (await (http[type] as (...a: unknown[]) => Promise<{ data: unknown }>)(url, ...rest, { timeout: 10000 })).data;
  } catch (e) {
    throw reason(e);
  }
};

export const genericMutationFetcher = async (url: string, { arg }: { arg: { type: Method; rest?: unknown[] } }) => {
  try {
    return (await (http[arg.type] as (...a: unknown[]) => Promise<{ data: any }>)(url, ...(arg.rest || []), { timeout: 30000 })).data;
  } catch (e) {
    throw reason(e);
  }
};
