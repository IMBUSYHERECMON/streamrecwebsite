async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, {
    ...init,
    headers
  });

  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text().catch(() => '');

  if (!response.ok) {
    const message = rawText
      ? rawText.slice(0, 220)
      : response.statusText || 'Unknown API error';
    throw new Error(`${response.status}: ${message}`);
  }

  if (response.status === 204) return undefined as T;
  if (!rawText) return undefined as T;

  const looksLikeHtml = /^\s*</.test(rawText);
  if (looksLikeHtml && !contentType.includes('application/json')) {
    throw new Error('API returned HTML instead of JSON. Check that the backend server is running.');
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error('API returned invalid JSON. Check server logs and endpoint response format.');
  }
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
  delete: <T>(url: string) =>
    request<T>(url, {
      method: 'DELETE'
    })
};
