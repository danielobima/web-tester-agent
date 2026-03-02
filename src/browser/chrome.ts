export async function getChromeWebSocketUrl(
  normalized: string,
  timeout: number,
): Promise<string> {
  const res = await fetch(`${normalized}/json/version`, {
    signal: AbortSignal.timeout(timeout),
  });
  const data = (await res.json()) as any;
  return data.webSocketDebuggerUrl;
}
