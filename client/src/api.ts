/// <reference types="vite/client" />

const API_URL = import.meta.env.VITE_API_URL ?? "";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, options);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  const data: unknown = await response.json();
  return data as T;
}

