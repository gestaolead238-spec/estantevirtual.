import type { VolumeInfo } from './types';

const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_URL = 'https://openlibrary.org/api/books';
const OPEN_LIBRARY_ISBN_URL = 'https://openlibrary.org/isbn';
const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';
const ISBN_SEARCH_URL = './isbn-lookup.php';

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function strings(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.map((entry) => {
    if (typeof entry === 'string') return text(entry);
    if (entry && typeof entry === 'object') {
      const item = entry as Record<string, unknown>;
      return text(item.name || item.label || item.title);
    }
    return '';
  }).filter(Boolean);
}

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9x]/gi, '').toUpperCase();
}

function toVolume(data: Record<string, unknown>, isbn: string): VolumeInfo {
  const imageLinks = data.imageLinks as Record<string, string> | undefined;
  const links = data.cover as Record<string, string> | undefined;
  const image = text(
    data.image || data.coverUrl || imageLinks?.extraLarge || imageLinks?.large
    || imageLinks?.medium || imageLinks?.thumbnail || links?.large || links?.medium
    || links?.small,
  ).replace(/^http:/i, 'https:').replace(/&amp;/g, '&');

  return {
    title: text(data.title || data.Title || data.name),
    authors: strings(data.authors || data.Authors || data.author),
    publisher: strings(data.publisher || data.Imprint || data.publishers).join(', '),
    categories: strings(data.categories || data.Subject || data.subjects || data.genre),
    isbn,
    image,
  };
}

function mergeVolumes(records: VolumeInfo[], isbn: string): VolumeInfo {
  return {
    title: records.find((record) => record.title)?.title || '',
    authors: [...new Set(records.flatMap((record) => record.authors))],
    publisher: records.find((record) => record.publisher)?.publisher || '',
    categories: [...new Set(records.flatMap((record) => record.categories))],
    isbn,
    image: records.find((record) => record.image)?.image
      || `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`,
  };
}

async function googleLookup(isbn: string): Promise<VolumeInfo[]> {
  const response = await fetch(`${GOOGLE_BOOKS_URL}?q=${encodeURIComponent(`isbn:${isbn}`)}&maxResults=10`);
  if (!response.ok) throw new Error(`Google Books respondeu ${response.status}.`);
  const payload = await response.json() as {
    items?: Array<{ volumeInfo?: Record<string, unknown> }>;
  };
  return (payload.items || []).flatMap(({ volumeInfo }) => {
    if (!volumeInfo) return [];
    const identifiers = volumeInfo.industryIdentifiers as Array<{ identifier?: string }> | undefined;
    const normalizedIds = (identifiers || []).map(({ identifier }) => normalizeIsbn(identifier || ''));
    if (normalizedIds.length && !normalizedIds.includes(isbn)) return [];
    return [toVolume(volumeInfo, isbn)];
  });
}

async function openLibraryLookup(isbn: string): Promise<VolumeInfo[]> {
  const url = `${OPEN_LIBRARY_URL}?bibkeys=${encodeURIComponent(`ISBN:${isbn}`)}&format=json&jscmd=data`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open Library respondeu ${response.status}.`);
  const payload = await response.json() as Record<string, Record<string, unknown>>;
  const record = payload[`ISBN:${isbn}`];
  if (!record) return [];
  return [toVolume(record, isbn)];
}

async function openLibraryEditionLookup(isbn: string): Promise<VolumeInfo[]> {
  const response = await fetch(`${OPEN_LIBRARY_ISBN_URL}/${encodeURIComponent(isbn)}.json`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Open Library ISBN respondeu ${response.status}.`);
  const edition = await response.json() as {
    title?: string;
    authors?: Array<{ key?: string }>;
    publishers?: string[];
    covers?: number[];
    works?: Array<{ key?: string }>;
  };

  const authorRequests = (edition.authors || []).flatMap(({ key }) => {
    const match = key?.match(/^\/authors\/(OL[0-9]+[A-Z])$/);
    return match ? [fetch(`https://openlibrary.org/authors/${match[1]}.json`)] : [];
  });
  const workRequests = (edition.works || []).flatMap(({ key }) => {
    const match = key?.match(/^\/works\/(OL[0-9]+W)$/);
    return match ? [fetch(`https://openlibrary.org/works/${match[1]}.json`)] : [];
  });
  const [authorResults, workResults] = await Promise.all([
    Promise.allSettled(authorRequests),
    Promise.allSettled(workRequests),
  ]);
  const authors: string[] = [];
  for (const result of authorResults) {
    if (result.status !== 'fulfilled' || !result.value.ok) continue;
    const author = await result.value.json() as { name?: string };
    if (text(author.name)) authors.push(text(author.name));
  }
  const categories: string[] = [];
  for (const result of workResults) {
    if (result.status !== 'fulfilled' || !result.value.ok) continue;
    const work = await result.value.json() as { subjects?: string[]; subject_places?: string[] };
    categories.push(...strings(work.subjects), ...strings(work.subject_places));
  }

  const coverId = (edition.covers || []).find((cover) => Number.isInteger(cover) && cover > 0);
  return [{
    title: text(edition.title),
    authors,
    publisher: strings(edition.publishers).join(', '),
    categories: [...new Set(categories)],
    isbn,
    image: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : '',
  }];
}

async function isbnSearchLookup(isbn: string): Promise<VolumeInfo[]> {
  const response = await fetch(ISBN_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isbn }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(text(payload.error) || `ISBN Search respondeu ${response.status}.`);
  }
  return [toVolume(payload, isbn)];
}

function isbnAliases(isbn: string): string[] {
  if (isbn.length === 13 && isbn.startsWith('978')) {
    const base = isbn.slice(3, 12);
    const sum = [...base].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
    const check = (11 - sum % 11) % 11;
    return [isbn, `${base}${check === 10 ? 'X' : check}`];
  }
  if (isbn.length === 10) {
    const base = `978${isbn.slice(0, 9)}`;
    const sum = [...base].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return [isbn, `${base}${(10 - sum % 10) % 10}`];
  }
  return [isbn];
}

async function textLookup(query: string): Promise<VolumeInfo[]> {
  const response = await fetch(`${GOOGLE_BOOKS_URL}?q=${encodeURIComponent(query)}&maxResults=10`);
  if (!response.ok) throw new Error(`Google Books respondeu ${response.status}.`);
  const payload = await response.json() as {
    items?: Array<{ volumeInfo?: Record<string, unknown> }>;
  };
  return (payload.items || []).flatMap(({ volumeInfo }) => {
    if (!volumeInfo) return [];
    const identifiers = volumeInfo.industryIdentifiers as Array<{ identifier?: string }> | undefined;
    const isbn = identifiers?.find(({ identifier }) => identifier && /^(?:\d{10}|\d{13})$/.test(normalizeIsbn(identifier)))?.identifier || '';
    return [toVolume(volumeInfo, normalizeIsbn(isbn))];
  });
}

async function openLibraryTextLookup(query: string): Promise<VolumeInfo[]> {
  const url = `${OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=10&fields=title,author_name,publisher,subject,isbn,cover_i`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open Library respondeu ${response.status}.`);
  const payload = await response.json() as {
    docs?: Array<{ title?: string; author_name?: string[]; publisher?: string[]; subject?: string[]; isbn?: string[]; cover_i?: number }>;
  };
  return (payload.docs || []).map((record) => ({
    title: text(record.title),
    authors: strings(record.author_name),
    publisher: strings(record.publisher).slice(0, 1).join(', '),
    categories: strings(record.subject).slice(0, 5),
    isbn: record.isbn?.[0] || '',
    image: record.cover_i ? `https://covers.openlibrary.org/b/id/${record.cover_i}-L.jpg` : '',
  }));
}

export async function lookupBook(query: string): Promise<VolumeInfo | null> {
  const cleanQuery = query.trim();
  const isbn = normalizeIsbn(cleanQuery);
  if (!/^(?:\d{9}[\dX]|\d{13})$/.test(isbn)) {
    const results = await Promise.allSettled([
      textLookup(cleanQuery),
      openLibraryTextLookup(cleanQuery),
    ]);
    const records = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    if (!records.length && results.every((result) => result.status === 'rejected')) {
      throw new Error('Não foi possível consultar as bases de livros. Tente novamente.');
    }
    return records.length ? mergeVolumes(records, records.find((record) => record.isbn)?.isbn || '') : null;
  }

  const aliases = isbnAliases(isbn);
  const results = await Promise.allSettled([
    isbnSearchLookup(isbn),
    ...aliases.map((alias) => openLibraryEditionLookup(alias)),
    ...aliases.flatMap((alias) => [
      googleLookup(alias),
      openLibraryLookup(alias),
    ]),
  ]);
  const records = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (!records.length) {
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length === results.length) {
      throw new Error('Não foi possível consultar as bases de livros. Tente novamente.');
    }
    return null;
  }
  return mergeVolumes(records, isbn);
}
