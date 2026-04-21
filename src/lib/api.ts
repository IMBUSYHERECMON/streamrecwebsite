async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown API error');
    throw new Error(`${response.status}: ${errorText || response.statusText}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
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
