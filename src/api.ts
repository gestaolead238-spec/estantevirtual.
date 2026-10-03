import type { Book, Profile } from './types';

const API_URL = './api.php';
const AUTH_URL = './auth.php';

interface LibraryPayload {
  books: Book[];
  profile?: Profile;
}

async function parseJson<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || `A solicitação falhou (${response.status}).`);
  }
  return result;
}

export async function fetchLibrary(): Promise<LibraryPayload> {
  return parseJson<LibraryPayload>(await fetch(API_URL, { cache: 'no-store' }));
}

export async function fetchSession(): Promise<{ authenticated: boolean; email?: string }> {
  return parseJson(await fetch(AUTH_URL, { cache: 'no-store' }));
}

export async function login(email: string, password: string): Promise<void> {
  await parseJson(await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email, password }),
  }));
}

export async function saveBook(book: Book, id?: string): Promise<Book[]> {
  const result = await post<LibraryPayload>({ action: 'save', id, book });
  return result.books;
}

export async function deleteBook(id: string): Promise<Book[]> {
  const result = await post<LibraryPayload>({ action: 'delete', id });
  return result.books;
}

export async function importBooks(books: Book[]): Promise<Book[]> {
  const result = await post<LibraryPayload>({ action: 'import', books });
  return result.books;
}

export async function updateProfile(profile: Profile): Promise<Profile> {
  const result = await post<{ profile: Profile }>({ action: 'save-profile', profile });
  return result.profile;
}

export async function logout(): Promise<void> {
  await parseJson(await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'logout' }),
  }));
}

async function post<T>(body: unknown): Promise<T> {
  return parseJson<T>(await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}
