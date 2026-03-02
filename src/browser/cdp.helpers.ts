export async function appendCdpPath(
  base: string,
  path: string,
): Promise<string> {
  return `${base}${path}`;
}

export async function fetchJson<T>(
  url: string,
  timeout: number = 2000,
): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  return (await res.json()) as T;
}

export function getHeadersWithAuth(url: string): Record<string, string> {
  return {};
}

export async function withCdpSocket<T>(
  wsUrl: string,
  fn: (send: any) => Promise<T>,
  opts?: { handshakeTimeoutMs: number },
): Promise<T> {
  return await fn((method: string, params: any) => Promise.resolve());
}
