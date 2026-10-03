export type BookmarkColor =
  | 'favorite'
  | 'reviewed'
  | 'read'
  | 'reading'
  | 'rereading'
  | 'abandoned'
  | 'donation';

export type BookStatus = '' | 'lido' | 'lendo' | 'proxima';

export interface Book {
  id?: string;
  title: string;
  author: string;
  publisher?: string;
  genre: string;
  niche?: string;
  isbn?: string;
  cover?: string;
  rating?: number;
  comment?: string;
  acquiredDate?: string;
  finishedDate?: string;
  bookmarkColor?: BookmarkColor | string;
  bookmarkSchemaVersion?: number;
  status?: BookStatus | string;
  pageCount?: number;
}

export interface Profile {
  photo?: string;
  background?: string;
  homeBackground?: string;
  catalogBackground?: string;
  introMessage?: string;
  theme?: string;
  instagram?: string;
  tiktok?: string;
}

export interface VolumeInfo {
  title: string;
  authors: string[];
  publisher: string;
  categories: string[];
  isbn: string;
  image: string;
}
