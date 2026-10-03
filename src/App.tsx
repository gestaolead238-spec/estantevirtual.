import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck, Ban, BookMarked, BookOpen, Camera, Check, ChevronDown,
  Download, Gift, Heart, House, ImagePlus, Instagram, LibraryBig, LoaderCircle, LogOut,
  Music2, Plus, Search, SlidersHorizontal, Star, Trash2, Upload, UserRound, X, Pencil, ScanLine,
} from 'lucide-react';
import { deleteBook, fetchLibrary, fetchSession, importBooks, logout, saveBook, updateProfile } from './api';
import { lookupBook } from './bookLookup';
import type { Book, BookmarkColor, BookStatus, Profile, VolumeInfo } from './types';

const FALLBACK_COVER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"%3E%3Crect width="200" height="300" fill="%23e9f4f6"/%3E%3Cpath d="M55 75h90v150H55z" fill="none" stroke="%2374aab7" stroke-width="7"/%3E%3Cpath d="M73 105h54m-54 22h54m-54 22h40" stroke="%2374aab7" stroke-width="6" stroke-linecap="round"/%3E%3C/svg%3E';
const CATEGORY_META: Record<BookmarkColor, { label: string; icon: typeof Heart; color: string }> = {
  favorite: { label: 'Favoritos', icon: Heart, color: '#df7772' },
  reviewed: { label: 'Resenhados', icon: BadgeCheck, color: '#ec8058' },
  read: { label: 'Lido', icon: Check, color: '#54a987' },
  reading: { label: 'Lendo', icon: BookOpen, color: '#8c69a8' },
  rereading: { label: 'Relendo', icon: BookMarked, color: '#e1b94c' },
  abandoned: { label: 'Abandonei', icon: Ban, color: '#588bb7' },
  donation: { label: 'Para doação', icon: Gift, color: '#56aaa9' },
};
const LEGACY_BOOKMARK_COLORS: Record<string, BookmarkColor | ''> = {
  black: 'reading', green: '', yellow: 'favorite', brown: 'reviewed', blue: 'read',
};
const BOOK_STATUS: Array<{ value: BookStatus; label: string }> = [
  { value: '', label: 'Sem status' },
  { value: 'lido', label: 'Lido' },
  { value: 'lendo', label: 'Lendo' },
  { value: 'proxima', label: 'Próxima leitura' },
];
const DEFAULT_INTRO_MESSAGE = [
  'Sou uma leitora apaixonada por histórias, mundos fantásticos e personagens que continuam vivendo na cabeça mesmo depois que a última página termina.',
  'Minha biblioteca reúne um pouco de tudo que desperta minha curiosidade: fantasia, dark fantasy, ficção, romances, clássicos e histórias que, de alguma forma, deixam uma marca. Gosto especialmente de livros que criam mundos próprios, daqueles em que é fácil esquecer por algumas horas que existe um mundo lá fora.',
  'Além de ler, gosto de viajar, conhecer culturas diferentes e descobrir novos lugares — e talvez seja justamente por isso que gosto tanto dos livros: cada história também é uma forma de viajar.',
  'Este espaço nasceu para reunir minha biblioteca, registrar minhas leituras e compartilhar um pouco desse universo com quem também acredita que uma boa história nunca termina exatamente quando fechamos o livro.',
].join('\n\n');
const THEMES = [
  { id: 'vitoriano', name: 'Vitoriano', colors: ['#73465b', '#3f5a4a', '#f5efe8', '#342c2d'] },
  { id: 'gold', name: 'Gold', colors: ['#946c18', '#ceaa52', '#fff8e6', '#3d321c'] },
  { id: 'gotico', name: 'Gótico', colors: ['#593c71', '#873f52', '#f3edf6', '#302a35'] },
  { id: 'sombrio', name: 'Sombrio', colors: ['#4e4a52', '#85808a', '#ebe9ec', '#2e2c31'] },
  { id: 'rock', name: 'Rock', colors: ['#b5413f', '#354454', '#f1f2f3', '#26292d'] },
  { id: 'jardim-secreto', name: 'Jardim Secreto', colors: ['#3f755c', '#a4bc87', '#f1f5e8', '#283a30'] },
  { id: 'oceano', name: 'Oceano', colors: ['#167d91', '#53b5b1', '#eaf7f6', '#233b43'] },
] as const;

interface AppProps {
  admin: boolean;
  home: boolean;
}

interface EditorState {
  book: Book;
  id?: string;
}

interface FilterState {
  genre: string;
  status: string;
  rating: string;
}

function normalizeBookmark(book: Book): BookmarkColor | '' {
  const color = book.bookmarkColor || '';
  if (Number(book.bookmarkSchemaVersion || 0) >= 2) {
    return Object.prototype.hasOwnProperty.call(CATEGORY_META, color) ? color as BookmarkColor : '';
  }
  return LEGACY_BOOKMARK_COLORS[color] || '';
}

function isBook(value: unknown): value is Book {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as { title?: unknown }).title === 'string';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function socialUrl(network: 'instagram' | 'tiktok', value: string): string {
  const account = value.trim();
  const expectedHost = network === 'instagram' ? /(^|\.)instagram\.com$/i : /(^|\.)tiktok\.com$/i;
  try {
    const url = new URL(account);
    if (url.protocol === 'https:' && expectedHost.test(url.hostname)) return url.toString();
  } catch {
    // Plain usernames are expected for this field.
  }
  const username = account.replace(/^@/, '').replace(/^https?:\/\/(www\.)?[^/]+\//i, '').replace(/^@/, '').replace(/\/$/, '');
  return network === 'instagram'
    ? `https://www.instagram.com/${encodeURIComponent(username)}`
    : `https://www.tiktok.com/@${encodeURIComponent(username)}`;
}

function readImage(file: File, maxDimension = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('O arquivo selecionado não é uma imagem válida.'));
      image.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Não foi possível processar a imagem.'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function emptyBook(): Book {
  return {
    title: '',
    author: '',
    publisher: '',
    genre: '',
    niche: '',
    isbn: '',
    cover: '',
    rating: 0,
    comment: '',
    acquiredDate: '',
    finishedDate: '',
    bookmarkColor: '',
    bookmarkSchemaVersion: 2,
    status: '',
  };
}

export default function App({ admin, home }: AppProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [profile, setProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<BookmarkColor | ''>('');
  const [filters, setFilters] = useState<FilterState>({ genre: '', status: '', rating: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookupText, setLookupText] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [profileDraft, setProfileDraft] = useState<Profile>({});
  const [profileSaving, setProfileSaving] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const profilePhotoRef = useRef<HTMLInputElement>(null);
  const homeBackgroundRef = useRef<HTMLInputElement>(null);
  const catalogBackgroundRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const result = await fetchLibrary();
    setBooks(result.books);
    setProfile(result.profile || {});
    setProfileDraft(result.profile || {});
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        if (admin) {
          const session = await fetchSession();
          if (!session.authenticated) {
            window.location.replace('./admin.html');
            return;
          }
          if (active) setAuthenticated(true);
        }
        const result = await fetchLibrary();
        if (!active) return;
        if (admin) {
          const localBooks = localStorage.getItem('meus_livros');
          if (localBooks) {
            const parsed: unknown = JSON.parse(localBooks);
            if (Array.isArray(parsed)) {
              const validBooks = parsed.filter(isBook);
              const needsLegacyImport = result.books.length === 0 || validBooks.some((book) => !book.id);
              if (validBooks.length > 0 && needsLegacyImport) {
                result.books = await importBooks(validBooks.map((book) => ({
                  ...book,
                  bookmarkColor: normalizeBookmark(book),
                  bookmarkSchemaVersion: 2,
                })));
              }
            }
          }
        }
        setBooks(result.books);
        setProfile(result.profile || {});
        setProfileDraft(result.profile || {});
        if (admin && result.books.some((book) => Number(book.bookmarkSchemaVersion || 0) < 2)) {
          const response = await fetch('./api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'migrate-bookmarks' }),
          });
          const migrated = await response.json() as { books?: Book[]; error?: string };
          if (!response.ok || !Array.isArray(migrated.books)) {
            throw new Error(migrated.error || 'Não foi possível atualizar os marcadores.');
          }
          if (active) setBooks(migrated.books);
        }
      } catch (loadError) {
        if (active) setError(messageOf(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void initialize();
    return () => { active = false; };
  }, [admin]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!scannerOpen || !admin) return;
    if (!window.Html5Qrcode) {
      setNotice('Leitor de código de barras indisponível. Digite o ISBN na busca.');
      setScannerOpen(false);
      return;
    }
    const scanner = new window.Html5Qrcode('isbn-scanner');
    scannerRef.current = scanner;
    void scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 280, height: 130 } },
      (value) => {
        setLookupText(value);
        setScannerOpen(false);
        void runLookup(value);
      },
      () => undefined,
    ).catch((scanError) => {
      setNotice(`Não foi possível iniciar a câmera: ${messageOf(scanError)}`);
      setScannerOpen(false);
    });
    return () => {
      const current = scannerRef.current;
      scannerRef.current = null;
      if (current) void current.stop().catch(() => undefined);
    };
  }, [admin, scannerOpen]);

  const visibleBooks = useMemo(() => {
    const term = normalizeText(query);
    return books.filter((book) => {
      const matchesText = !term || [
        book.title, book.author, book.publisher, book.genre, book.isbn, book.comment, book.status, book.niche,
      ].some((field) => normalizeText(String(field || '')).includes(term));
      const matchesBookmark = !activeCategory || normalizeBookmark(book) === activeCategory;
      const matchesGenre = !filters.genre || book.genre === filters.genre;
      const matchesStatus = !filters.status || book.status === filters.status;
      const matchesRating = !filters.rating || Number(book.rating || 0) === Number(filters.rating);
      return matchesText && matchesBookmark && matchesGenre && matchesStatus && matchesRating;
    });
  }, [books, query, activeCategory, filters]);

  const genres = useMemo(
    () => [...new Set(books.map((book) => book.genre).filter((genre) => genre && genre !== 'Não informado'))].sort(),
    [books],
  );

  async function runLookup(value: string) {
    const search = value.trim();
    if (!search) {
      setNotice('Digite um ISBN para buscar os dados do livro.');
      return;
    }
    setLookupLoading(true);
    setNotice('');
    try {
      const result: VolumeInfo | null = await lookupBook(search);
      const normalizedSearch = search.replace(/[^0-9x]/gi, '').toUpperCase();
      const cleanIsbn = result?.isbn || (/^(?:\d{9}[\dX]|\d{13})$/.test(normalizedSearch) ? normalizedSearch : '');
      if (!result) {
        setEditor({ book: { ...emptyBook(), isbn: cleanIsbn } });
        setNotice('Não encontrei esse ISBN nas bases. Você pode completar os dados manualmente.');
        return;
      }
      setEditor({
        book: {
          ...emptyBook(),
          title: result.title,
          author: result.authors.join(', '),
          publisher: result.publisher,
          genre: result.categories.join(', '),
          isbn: cleanIsbn,
          cover: result.image,
        },
      });
    } catch (lookupError) {
      setNotice(messageOf(lookupError));
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSaveBook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || '').trim();
    if (!title) {
      setNotice('Informe o título do livro antes de salvar.');
      return;
    }
    const book: Book = {
      ...(editor.id ? books.find((item) => item.id === editor.id) : {}),
      title,
      author: String(form.get('author') || '').trim(),
      publisher: String(form.get('publisher') || '').trim(),
      genre: String(form.get('genre') || '').trim() || 'Não informado',
      niche: String(form.get('niche') || '').trim() || 'Sem nicho',
      isbn: String(form.get('isbn') || '').trim(),
      cover: editor.book.cover || '',
      rating: Number(form.get('rating') || 0),
      comment: String(form.get('comment') || '').trim(),
      acquiredDate: String(form.get('acquiredDate') || ''),
      finishedDate: String(form.get('finishedDate') || ''),
      bookmarkColor: String(form.get('bookmarkColor') || ''),
      bookmarkSchemaVersion: 2,
      status: String(form.get('status') || ''),
    };
    setSaving(true);
    try {
      setBooks(await saveBook(book, editor.id));
      setEditor(null);
      setNotice(editor.id ? 'Livro atualizado.' : 'Livro adicionado ao acervo.');
    } catch (saveError) {
      setNotice(`Não foi possível salvar: ${messageOf(saveError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(book: Book) {
    if (!book.id || !window.confirm(`Excluir “${book.title}” do acervo?`)) return;
    try {
      setBooks(await deleteBook(book.id));
      setNotice('Livro excluído do acervo.');
    } catch (deleteError) {
      setNotice(`Não foi possível excluir o livro: ${messageOf(deleteError)}`);
    }
  }

  async function handleStatus(book: Book, status: string) {
    if (!book.id) return;
    try {
      setBooks(await saveBook({ ...book, status }, book.id));
    } catch (statusError) {
      setNotice(`Não foi possível atualizar o status: ${messageOf(statusError)}`);
    }
  }

  async function handleCover(file?: File) {
    if (!file || !editor) return;
    try {
      setEditor({ ...editor, book: { ...editor.book, cover: await readImage(file, 1000) } });
    } catch (imageError) {
      setNotice(messageOf(imageError));
    }
  }

  async function handleProfileImage(file: File | undefined, field: 'photo' | 'homeBackground' | 'catalogBackground') {
    if (!file) return;
    try {
      const image = await readImage(file, field === 'photo' ? 800 : 1600);
      setProfileDraft((current) => ({ ...current, [field]: image }));
    } catch (imageError) {
      setNotice(messageOf(imageError));
    }
  }

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      const saved = await updateProfile({
        ...profileDraft,
        background: '',
        homeBackground: profileDraft.homeBackground ?? profileDraft.background ?? '',
        catalogBackground: profileDraft.catalogBackground ?? profileDraft.background ?? '',
        introMessage: String(form.get('introMessage') || '').trim(),
        instagram: String(form.get('instagram') || '').trim(),
        tiktok: String(form.get('tiktok') || '').trim(),
        theme: String(form.get('theme') || 'vitoriano'),
      });
      setProfile(saved);
      setProfileDraft(saved);
      setProfileOpen(false);
      setNotice('Perfil atualizado.');
    } catch (profileError) {
      setNotice(`Não foi possível salvar o perfil: ${messageOf(profileError)}`);
    } finally {
      setProfileSaving(false);
    }
  }

  function exportLibrary() {
    const payload = {
      format: 'estantevirtual-acervo',
      version: 1,
      exportedAt: new Date().toISOString(),
      books: books.map((book) => ({
        ...book,
        bookmarkColor: normalizeBookmark(book),
        bookmarkSchemaVersion: 2,
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'meu-acervo.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file?: File) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as { books?: Book[] } | Book[];
      const incoming = Array.isArray(payload) ? payload : payload.books;
      if (!Array.isArray(incoming)) throw new Error('O arquivo não contém uma lista de livros válida.');
      setBooks(await importBooks(incoming));
      setNotice('Livros importados. Duplicados foram ignorados.');
    } catch (importError) {
      setNotice(`Não foi possível importar o arquivo: ${messageOf(importError)}`);
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch (logoutError) {
      setNotice(`Não foi possível encerrar a sessão: ${messageOf(logoutError)}`);
      return;
    }
    window.location.assign('./admin.html');
  }

  function openNewBook() {
    setEditor({ book: emptyBook() });
  }

  const total = new Intl.NumberFormat('pt-BR').format(books.length);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  if (loading) return <div className="loading-screen"><LoaderCircle className="spin" size={28} />Carregando sua estante…</div>;

  if (home) {
    return (
      <div className="app-shell home-page" data-theme={profile.theme || 'vitoriano'} style={(profile.homeBackground || profile.background) ? { backgroundImage: `linear-gradient(#f5fbfccc,#f5fbfccc),url("${profile.homeBackground || profile.background}")` } : undefined}>
        <header className="topbar">
          <a href="./index.html" className="avatar-link" aria-label="Início">
            {profile.photo
              ? <img src={profile.photo} alt="Foto do perfil" className="avatar" />
              : <span className="avatar avatar-fallback"><BookOpen size={19} /></span>}
          </a>
          <a className="brand" href="./index.html">Estante Da Sara</a>
          <div className="topbar-actions"><a className="admin-link" href="./admin.html">ADM</a></div>
        </header>
        <main className="home-content">
          <section className="home-intro">
            <div className="home-copy">
              <p className="eyebrow">Biblioteca de Sarah</p>
              <h1>Entre páginas, mundos e boas histórias</h1>
              {(profile.introMessage ?? DEFAULT_INTRO_MESSAGE).split(/\n{2,}|\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              <p className="home-signoff">Entre páginas, mundos e algumas obsessões literárias, esta é a minha biblioteca.</p>
              <a className="primary-button" href="./biblioteca.html"><BookOpen size={18} />Explorar meu acervo</a>
            </div>
            {profile.photo && <img className="home-photo" src={profile.photo} alt="Foto da criadora da biblioteca" />}
          </section>
          <footer className="home-footer">
            {profile.instagram && <a className="social-link" href={socialUrl('instagram', profile.instagram)} target="_blank" rel="noreferrer"><Instagram size={16} />Instagram</a>}
            {profile.tiktok && <a className="social-link" href={socialUrl('tiktok', profile.tiktok)} target="_blank" rel="noreferrer"><Music2 size={16} />TikTok</a>}
          </footer>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell" data-theme={profile.theme || 'vitoriano'} style={(profile.catalogBackground || profile.background) ? { backgroundImage: `linear-gradient(#f5fbfccc,#f5fbfccc),url("${profile.catalogBackground || profile.background}")` } : undefined}>
      <header className="topbar">
        <a href="./index.html" className="avatar-link" aria-label="Voltar ao início">
          {profile.photo
            ? <img src={profile.photo} alt="Foto do perfil" className="avatar" />
            : <span className="avatar avatar-fallback"><BookOpen size={19} /></span>}
        </a>
        <a className="brand" href="./index.html">Estante Da Sara</a>
        <div className="topbar-actions">
          <button className="icon-button search-top" type="button" aria-label="Abrir busca" onClick={() => { setSearchOpen(true); document.getElementById('book-search')?.focus(); }}>
            <Search size={22} />
          </button>
        </div>
      </header>

      <main className="content">
        <section className="overview" aria-label="Resumo do acervo">
          <div className="overview-count">
            <BookOpen size={24} />
            <div><p className="eyebrow">Biblioteca de Sarah</p><h1>Livros <span>{total}</span></h1></div>
          </div>
          <div className="category-scroll" role="group" aria-label="Filtrar por categoria">
            {Object.entries(CATEGORY_META).map(([key, item]) => {
              const CategoryIcon = item.icon;
              const count = books.filter((book) => normalizeBookmark(book) === key).length;
              return (
                <button key={key} type="button" className={`category-button ${activeCategory === key ? 'selected' : ''}`} onClick={() => setActiveCategory(activeCategory === key ? '' : key as BookmarkColor)} aria-pressed={activeCategory === key}>
                  <span className="bookmark-icon" style={{ '--bookmark-color': item.color } as React.CSSProperties}><CategoryIcon size={20} strokeWidth={2.2} /></span>
                  <span>{item.label}</span><small>{count}</small>
                </button>
              );
            })}
          </div>
        </section>

        {admin && authenticated && (
          <section className="admin-actions" aria-label="Ações administrativas">
            <button className="primary-button" type="button" onClick={openNewBook}><Plus size={18} />Adicionar livro</button>
            <div className="search-external">
              <label htmlFor="isbn-lookup"><Search size={17} /><span className="sr-only">Buscar por título, autor ou ISBN</span></label>
              <input id="isbn-lookup" value={lookupText} onChange={(event) => setLookupText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void runLookup(lookupText); }} placeholder="ISBN, título ou autor…" />
              <button type="button" onClick={() => void runLookup(lookupText)} disabled={lookupLoading} aria-label="Buscar livro">
                {lookupLoading ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}
              </button>
            </div>
            <button className="tool-button" type="button" onClick={() => setScannerOpen(!scannerOpen)} aria-label="Escanear ISBN"><ScanLine size={19} /><span>Escanear</span></button>
            <button className="tool-button" type="button" onClick={exportLibrary} aria-label="Exportar acervo"><Download size={18} /><span>Exportar</span></button>
            <button className="tool-button" type="button" onClick={() => importRef.current?.click()} aria-label="Importar acervo"><Upload size={18} /><span>Importar</span></button>
            <button className="tool-button" type="button" onClick={() => void handleLogout()} aria-label="Sair da conta"><LogOut size={18} /><span>Sair</span></button>
            <input ref={importRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={(event) => void handleImport(event.target.files?.[0])} />
          </section>
        )}

        {scannerOpen && admin && <div className="scanner-panel"><div id="isbn-scanner" /><button type="button" className="secondary-button" onClick={() => setScannerOpen(false)}>Fechar câmera</button></div>}

        <section className="catalog" id="catalog">
          <div className="catalog-heading">
            <div><h2>Biblioteca de Sarah</h2><p>{visibleBooks.length} {visibleBooks.length === 1 ? 'livro exibido' : 'livros exibidos'}</p></div>
            <div className="catalog-tools">
              <div className={`search-field ${searchOpen || query ? 'open' : ''}`}>
                <Search size={18} />
                <input id="book-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar no acervo…" aria-label="Buscar no acervo" />
                {query && <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}><X size={16} /></button>}
              </div>
              <button className={`tool-button filter-trigger ${filterOpen ? 'active' : ''}`} type="button" onClick={() => setFilterOpen(!filterOpen)} aria-expanded={filterOpen}>
                <SlidersHorizontal size={18} /><span>Filtros</span>{activeFilterCount > 0 && <small>{activeFilterCount}</small>}<ChevronDown size={15} />
              </button>
              {filterOpen && (
                <div className="filter-popover">
                  <div className="popover-title"><strong>Filtrar acervo</strong><button type="button" aria-label="Fechar filtros" onClick={() => setFilterOpen(false)}><X size={17} /></button></div>
                  <label>Gênero<select value={filters.genre} onChange={(event) => setFilters({ ...filters, genre: event.target.value })}><option value="">Todos</option>{genres.map((genre) => <option key={genre}>{genre}</option>)}</select></label>
                  <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{BOOK_STATUS.filter((status) => status.value).map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
                  <label>Nota<select value={filters.rating} onChange={(event) => setFilters({ ...filters, rating: event.target.value })}><option value="">Todas</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} estrelas</option>)}</select></label>
                  <button type="button" className="clear-filters" onClick={() => setFilters({ genre: '', status: '', rating: '' })}>Limpar filtros</button>
                </div>
              )}
            </div>
          </div>
          {error && <div className="error-state" role="alert">{error}<button type="button" onClick={() => { setError(''); setLoading(true); void refresh().then(() => setLoading(false)).catch((loadError) => { setError(messageOf(loadError)); setLoading(false); }); }}>Tentar novamente</button></div>}
          {!error && visibleBooks.length === 0 && (
            <div className="empty-state"><LibraryBig size={38} /><h3>{books.length ? 'Nenhum livro encontrado' : 'Sua estante está esperando por você'}</h3><p>{books.length ? 'Experimente mudar os filtros ou o termo da busca.' : 'Os livros cadastrados aparecerão aqui.'}</p>{admin && <button className="primary-button" type="button" onClick={openNewBook}><Plus size={18} />Adicionar primeiro livro</button>}</div>
          )}
          <ul className="book-grid">
            {visibleBooks.map((book) => {
              const marker = normalizeBookmark(book);
              const markerMeta = marker ? CATEGORY_META[marker] : null;
              const MarkerIcon = markerMeta?.icon;
              return (
                <li className="book-card" key={book.id || `${book.title}-${book.author}`}>
                  <div className="cover-wrap">
                    <img className="book-cover" src={book.cover || FALLBACK_COVER} alt={`Capa de ${book.title}`} loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_COVER; }} />
                    {markerMeta && MarkerIcon && <span className="cover-ribbon" title={markerMeta.label} aria-label={markerMeta.label} style={{ '--bookmark-color': markerMeta.color } as React.CSSProperties}><MarkerIcon size={17} fill="currentColor" /></span>}
                    {admin && authenticated && <button type="button" className="edit-cover-button" aria-label={`Editar ${book.title}`} onClick={() => setEditor({ book: { ...book }, id: book.id })}><Pencil size={15} /></button>}
                  </div>
                  <div className="book-info">
                    <div className="book-title-row"><h3 title={book.title}>{book.title}</h3></div>
                    <p className="book-author" title={book.author}>{book.author || 'Autor não informado'}</p>
                    {book.genre && book.genre !== 'Não informado' && <p className="book-genre">{book.genre}</p>}
                    {!!book.rating && <div className="rating-stars" aria-label={`Nota ${book.rating} de 5`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={12} fill={index < Number(book.rating) ? 'currentColor' : 'none'} />)}</div>}
                    {book.comment && <p className="book-review" title={book.comment}>{book.comment}</p>}
                    {admin && authenticated && (
                      <div className="card-admin-actions">
                        <select aria-label={`Status de ${book.title}`} value={book.status || ''} onChange={(event) => void handleStatus(book, event.target.value)}>{BOOK_STATUS.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}</select>
                        <button type="button" title="Editar livro" aria-label={`Editar ${book.title}`} onClick={() => setEditor({ book: { ...book }, id: book.id })}><Pencil size={15} /></button>
                        <button type="button" title="Excluir livro" aria-label={`Excluir ${book.title}`} onClick={() => void handleDelete(book)}><Trash2 size={15} /></button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="footer-links">
          {profile.instagram && <a className="social-link" href={socialUrl('instagram', profile.instagram)} target="_blank" rel="noreferrer"><Instagram size={15} />Acompanhe no Instagram</a>}
          {profile.tiktok && <a className="social-link" href={socialUrl('tiktok', profile.tiktok)} target="_blank" rel="noreferrer"><Music2 size={15} />Acompanhe no TikTok</a>}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navegação principal">
        <a href="./index.html" aria-label="Início"><House size={21} /><span>Início</span></a>
        <button type="button" onClick={() => { setSearchOpen(true); document.getElementById('book-search')?.focus(); }} aria-label="Buscar"><Search size={21} /><span>Buscar</span></button>
        <a href="#catalog" aria-current="page" aria-label="Estante"><LibraryBig size={21} /><span>Estante</span></a>
        {admin ? <button type="button" onClick={() => setProfileOpen(true)} aria-label="Perfil e configurações"><UserRound size={21} /><span>Perfil</span></button> : <a href="./index.html#profile-photo" aria-label="Perfil"><UserRound size={21} /><span>Perfil</span></a>}
      </nav>

      {notice && <div className="toast" role="status" aria-live="polite">{notice}<button type="button" aria-label="Fechar mensagem" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {editor && admin && authenticated && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}>
          <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
            <header className="modal-header"><div><span className="eyebrow">{editor.id ? 'Atualização do acervo' : 'Novo exemplar'}</span><h2 id="editor-title">{editor.id ? 'Editar livro' : 'Adicionar livro'}</h2></div><button type="button" aria-label="Fechar formulário" onClick={() => setEditor(null)}><X size={21} /></button></header>
            <form onSubmit={(event) => void handleSaveBook(event)}>
              <div className="editor-cover-row">
                <div className="editor-cover"><img src={editor.book.cover || FALLBACK_COVER} alt="Prévia da capa" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_COVER; }} /><button type="button" onClick={() => coverRef.current?.click()} aria-label="Enviar imagem da capa"><ImagePlus size={17} /></button><input ref={coverRef} type="file" accept="image/*" className="visually-hidden" onChange={(event) => void handleCover(event.target.files?.[0])} /></div>
                <p>Adicione uma imagem da capa ou preencha os dados abaixo.</p>
              </div>
              <div className="form-grid">
                <label className="wide">Título<input name="title" required defaultValue={editor.book.title} autoFocus /></label>
                <label>Autor(es)<input name="author" defaultValue={editor.book.author} /></label>
                <label>Gênero<input name="genre" defaultValue={editor.book.genre === 'Não informado' ? '' : editor.book.genre} /></label>
                <label>Editora<input name="publisher" defaultValue={editor.book.publisher} /></label>
                <label>Nicho da estante<input name="niche" placeholder="Ex.: A1, Seção 2" defaultValue={editor.book.niche === 'Sem nicho' ? '' : editor.book.niche} /></label>
                <label>ISBN<input name="isbn" defaultValue={editor.book.isbn} /></label>
                <label>Status<select name="status" defaultValue={editor.book.status || ''}>{BOOK_STATUS.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}</select></label>
                <label>Data de aquisição<input name="acquiredDate" type="date" defaultValue={editor.book.acquiredDate} /></label>
                <label>Data de término<input name="finishedDate" type="date" defaultValue={editor.book.finishedDate} /></label>
                <label className="wide">Marcador<select name="bookmarkColor" defaultValue={normalizeBookmark(editor.book)}><option value="">Sem marcador</option>{Object.entries(CATEGORY_META).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></label>
                <fieldset className="wide rating-field"><legend>Sua nota</legend><span>{[1, 2, 3, 4, 5].map((rating) => <label key={rating} aria-label={`${rating} estrela${rating > 1 ? 's' : ''}`}><input type="radio" name="rating" value={rating} defaultChecked={Number(editor.book.rating) === rating} /><Star size={24} fill={Number(editor.book.rating) >= rating ? 'currentColor' : 'none'} /></label>)}</span></fieldset>
                <label className="wide">Resenha<textarea name="comment" rows={3} defaultValue={editor.book.comment} placeholder="Escreva sua resenha…" /></label>
              </div>
              <footer className="modal-actions"><button className="secondary-button" type="button" onClick={() => setEditor(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving && <LoaderCircle className="spin" size={17} />}{saving ? 'Salvando…' : editor.id ? 'Salvar alterações' : 'Salvar no acervo'}</button></footer>
            </form>
          </section>
        </div>
      )}

      {profileOpen && admin && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
          <section className="editor-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
            <header className="modal-header"><div><span className="eyebrow">Personalização</span><h2 id="profile-title">Perfil público</h2></div><button type="button" aria-label="Fechar perfil" onClick={() => setProfileOpen(false)}><X size={21} /></button></header>
            <form onSubmit={(event) => void handleSaveProfile(event)}>
              <div className="profile-photo-editor">
                <img src={profileDraft.photo || FALLBACK_COVER} alt="Prévia da foto do perfil" />
                <button type="button" className="secondary-button" onClick={() => profilePhotoRef.current?.click()}><Camera size={16} />Alterar foto</button>
                <input ref={profilePhotoRef} type="file" accept="image/*" className="visually-hidden" onChange={(event) => void handleProfileImage(event.target.files?.[0], 'photo')} />
              </div>
              <label className="form-label">Mensagem de apresentação<textarea name="introMessage" rows={7} maxLength={10000} defaultValue={profileDraft.introMessage ?? DEFAULT_INTRO_MESSAGE} placeholder="Escreva a apresentação; separe parágrafos com uma linha em branco." /></label>
              <fieldset className="theme-picker">
                <legend>Conjunto de cores da interface</legend>
                <div className="theme-options">
                  {THEMES.map((theme) => (
                    <label key={theme.id} className={`theme-option ${(profileDraft.theme || 'vitoriano') === theme.id ? 'selected' : ''}`}>
                      <input type="radio" name="theme" value={theme.id} checked={(profileDraft.theme || 'vitoriano') === theme.id} onChange={() => setProfileDraft({ ...profileDraft, theme: theme.id })} />
                      <span className="theme-swatches">{theme.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}</span>
                      <span>{theme.name}</span>
                    </label>
                  ))}
                </div>
                <p>Os marcadores coloridos dos livros não mudam com o tema.</p>
              </fieldset>
              <div className="profile-backgrounds">
                <section className="background-setting">
                  <strong>Fundo da página inicial</strong>
                  <div className="background-preview">{(profileDraft.homeBackground || profileDraft.background) ? <img src={profileDraft.homeBackground || profileDraft.background} alt="Prévia do fundo da página inicial" /> : <span>Fundo padrão</span>}</div>
                  <div className="background-actions">
                    <button type="button" className="upload-control" onClick={() => homeBackgroundRef.current?.click()}><ImagePlus size={17} />Escolher imagem</button>
                    {(profileDraft.homeBackground || profileDraft.background) && <button className="text-button" type="button" onClick={() => setProfileDraft({ ...profileDraft, homeBackground: '' })}>Remover</button>}
                  </div>
                  <input ref={homeBackgroundRef} type="file" accept="image/*" className="visually-hidden" onChange={(event) => void handleProfileImage(event.target.files?.[0], 'homeBackground')} />
                </section>
                <section className="background-setting">
                  <strong>Fundo do acervo</strong>
                  <div className="background-preview">{(profileDraft.catalogBackground || profileDraft.background) ? <img src={profileDraft.catalogBackground || profileDraft.background} alt="Prévia do fundo do acervo" /> : <span>Fundo padrão</span>}</div>
                  <div className="background-actions">
                    <button type="button" className="upload-control" onClick={() => catalogBackgroundRef.current?.click()}><ImagePlus size={17} />Escolher imagem</button>
                    {(profileDraft.catalogBackground || profileDraft.background) && <button className="text-button" type="button" onClick={() => setProfileDraft({ ...profileDraft, catalogBackground: '' })}>Remover</button>}
                  </div>
                  <input ref={catalogBackgroundRef} type="file" accept="image/*" className="visually-hidden" onChange={(event) => void handleProfileImage(event.target.files?.[0], 'catalogBackground')} />
                </section>
              </div>
              <div className="form-grid">
                <label>Instagram<input name="instagram" defaultValue={profileDraft.instagram} placeholder="@usuario" /></label>
                <label>TikTok<input name="tiktok" defaultValue={profileDraft.tiktok} placeholder="@usuario" /></label>
              </div>
              <footer className="modal-actions"><button type="button" className="secondary-button" onClick={() => setProfileOpen(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={profileSaving}>{profileSaving ? 'Salvando…' : 'Salvar perfil'}</button></footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
