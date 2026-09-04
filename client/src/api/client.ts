export class ApiError extends Error {
  status: number
  code: string
  fields?: Record<string, string[]>

  constructor(message: string, status: number, code: string, fields?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return undefined as T

  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string; fields?: Record<string, string[]> } } | null

  if (!res.ok) {
    throw new ApiError(
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.fields,
    )
  }
  return json?.data as T
}