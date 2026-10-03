let html5QrCode = null;
let currentCoverUrl = "";
let editingBookId = null;
let acervoPronto = false;
let acervoLoadPromise = null;
let isAdmin = false;
let activeFilter = { field: null, value: null };
let activeBookmarkFilter = '';
let profileImageData = '';
let profileBackgroundData = '';
let longPressTimer = null;

const DEFAULT_COVER_URL = "https://via.placeholder.com/128x192?text=Sem+Capa";
const ACERVO_API_URL = "./api.php";
const AUTH_API_URL = "./auth.php";
const BOOKMARK_SCHEMA_VERSION = 2;
const LEGACY_BOOKMARK_COLORS = {
  black: 'reading',
  green: '',
  yellow: 'favorite',
  brown: 'reviewed',
  blue: 'read'
};
const STATUS_LABELS = {
  lido: 'Lido',
  lendo: 'Lendo',
  proxima: 'Próxima leitura'
};
const BOOKMARK_COLORS = {
  favorite: { label: 'vermelho', category: 'Favoritos', hex: '#dc2626', icon: 'heart' },
  reviewed: { label: 'resenhado', category: 'Resenhados', hex: '#927044', icon: 'review' },
  read: { label: 'verde', category: 'Lido', hex: '#16a34a' },
  reading: { label: 'amarelo', category: 'Lendo', hex: '#eab308' },
  rereading: { label: 'marrom', category: 'Relendo', hex: '#78350f' },
  abandoned: { label: 'preto', category: 'Abandonei', hex: '#111827' },
  donation: { label: 'roxo', category: 'Para doação', hex: '#7e22ce' }
};

function sanitizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function mostrarMensagemAuth(message, type = 'error') {
  const messageNode = document.getElementById('auth-message');
  if (!messageNode) return;
  messageNode.textContent = message;
  messageNode.classList.remove('hidden', 'border-red-200', 'bg-red-50', 'text-red-700', 'border-green-200', 'bg-green-50', 'text-green-700');
  if (type === 'success') {
    messageNode.classList.add('border-green-200', 'bg-green-50', 'text-green-700');
  } else {
    messageNode.classList.add('border-red-200', 'bg-red-50', 'text-red-700');
  }
  if (!message) {
    messageNode.classList.add('hidden');
    return;
  }
  messageNode.classList.remove('hidden');
}

function setAdminState(authenticated) {
  isAdmin = authenticated;
  document.body.classList.toggle('is-admin', isAdmin);
  document.querySelectorAll('[data-admin-only]').forEach((element) => {
    const keepHidden = element.dataset.adminPreserveHidden === 'true';
    element.classList.toggle('hidden', !isAdmin || keepHidden);
  });
  document.getElementById('admin-login-link')?.classList.toggle('hidden', isAdmin);
  document.getElementById('admin-logout')?.classList.toggle('hidden', !isAdmin);
  if (document.getElementById('books-list')) carregarListaSalva();
}

async function autenticarAdmin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = document.getElementById('auth-submit');
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  submitButton.disabled = true;
  mostrarMensagemAuth('Verificando acesso...', 'success');

  try {
    const response = await fetch(AUTH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível entrar.');
    form.reset();
    window.location.href = './admin-tools.html';
  } catch (error) {
    mostrarMensagemAuth(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function logoutUsuario() {
  try {
    await fetch(AUTH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' })
    });
  } finally {
    window.location.reload();
  }
}

async function initAuth() {
  const form = document.getElementById('auth-form');
  if (form) {
    form.addEventListener('submit', autenticarAdmin);
    try {
      const response = await fetch(AUTH_API_URL, { cache: 'no-store' });
      const result = await response.json();
      if (result.authenticated) window.location.href = './admin-tools.html';
    } catch (error) {
      mostrarMensagemAuth('Não foi possível confirmar a sessão com o servidor.');
    }
    return;
  }

  try {
    const response = await fetch(AUTH_API_URL, { cache: 'no-store' });
    const result = await response.json();
    const authenticated = Boolean(response.ok && result.authenticated);
    setAdminState(authenticated);
    if (document.body.dataset.adminPage === 'true' && !authenticated) {
      window.location.href = './admin.html';
    }
  } catch (error) {
    setAdminState(false);
    console.error('Não foi possível consultar a sessão administrativa.', error);
    if (document.body.dataset.adminPage === 'true') window.location.href = './admin.html';
  }
}

function toggleScanner() {
  const container = document.getElementById('scanner-container');
  container.classList.remove('hidden');

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("interactive");
  }

  const config = {
    fps: 10,
    qrbox: { width: 250, height: 150 },
    formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13]
  };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess
  ).catch((err) => {
    alert("Erro ao abrir a câmera: " + err);
    container.classList.add('hidden');
  });
}

function stopScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().then(() => {
      document.getElementById('scanner-container').classList.add('hidden');
    });
  } else {
    document.getElementById('scanner-container').classList.add('hidden');
  }
}

function onScanSuccess(decodedText) {
  stopScanner();
  buscarLivroNaAPI(decodedText);
}

function abrirMenu() {
  document.getElementById('settings-backdrop').classList.remove('hidden');
  document.getElementById('settings-drawer').classList.remove('translate-x-full');
  document.getElementById('settings-drawer').setAttribute('aria-hidden', 'false');
  document.getElementById('menu-button').setAttribute('aria-expanded', 'true');
}

function fecharMenu() {
  document.getElementById('settings-backdrop').classList.add('hidden');
  document.getElementById('settings-drawer').classList.add('translate-x-full');
  document.getElementById('settings-drawer').setAttribute('aria-hidden', 'true');
  document.getElementById('menu-button').setAttribute('aria-expanded', 'false');
}

function compactarImagem(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('O arquivo selecionado não é uma imagem válida.'));
      image.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function alterarCapa(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    currentCoverUrl = await compactarImagem(file, 700, 0.82);
    document.getElementById('book-cover').src = currentCoverUrl;
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = '';
  }
}

async function alterarFundo(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const background = await compactarImagem(file, 1600, 0.76);
    localStorage.setItem('imagem_fundo', background);
    aplicarFundo(background);
  } catch (error) {
    alert(`Não foi possível salvar a imagem de fundo: ${error.message}`);
  } finally {
    event.target.value = '';
  }
}

function aplicarFundo(background) {
  document.body.style.backgroundImage = background ? `url("${background}")` : '';
  document.body.style.backgroundSize = background ? 'cover' : '';
  document.body.style.backgroundPosition = background ? 'center' : '';
  document.body.style.backgroundAttachment = background ? 'fixed' : '';
}

function obterLinkSocial(rede, valor) {
  const username = sanitizeText(valor).replace(/^@/, '').replace(/\/$/, '');
  if (!username) return '';
  if (/^https?:\/\//i.test(username)) {
    try {
      const url = new URL(username);
      const dominio = rede === 'instagram' ? /(^|\.)instagram\.com$/i : /(^|\.)tiktok\.com$/i;
      return dominio.test(url.hostname) ? url.href : '';
    } catch (error) {
      return '';
    }
  }
  if (!/^[\w.]+$/u.test(username)) return '';
  const dominio = rede === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/@';
  return `${dominio}${encodeURIComponent(username)}`;
}

function obterIdentificadorSocial(rede, valor) {
  let username = sanitizeText(valor);
  if (/^https?:\/\//i.test(username)) {
    try {
      username = new URL(username).pathname.split('/').filter(Boolean)[0] || '';
    } catch (error) {
      return '';
    }
  }
  username = username.replace(/^@/, '').replace(/\/$/, '');
  return username ? `@${username}` : '';
}

function aplicarPerfil(perfil = {}) {
  profileImageData = typeof perfil.photo === 'string' ? perfil.photo : '';
  profileBackgroundData = typeof perfil.background === 'string'
    ? perfil.background
    : localStorage.getItem('imagem_fundo') || '';
  aplicarFundo(profileBackgroundData);
  const backgroundPreview = document.getElementById('profile-background-preview');
  if (backgroundPreview) {
    backgroundPreview.src = profileBackgroundData;
    backgroundPreview.classList.toggle('hidden', !profileBackgroundData);
  }
  [document.getElementById('profile-photo'), document.getElementById('admin-profile-avatar')].forEach((photo) => {
    if (!photo) return;
    photo.src = profileImageData;
    photo.classList.toggle('hidden', !profileImageData);
  });
  [document.getElementById('profile-avatar-fallback'), document.getElementById('admin-profile-avatar-fallback')].forEach((fallback) => {
    fallback?.classList.toggle('hidden', Boolean(profileImageData));
  });
  document.getElementById('profile-avatar-fallback')?.classList.toggle('hidden', Boolean(profileImageData));
  const editorPhoto = document.getElementById('profile-editor-photo');
  if (editorPhoto) {
    editorPhoto.src = profileImageData;
    editorPhoto.classList.toggle('hidden', !profileImageData);
  }

  const instagram = document.getElementById('profile-instagram-link');
  const tiktok = document.getElementById('profile-tiktok-link');
  [[instagram, 'instagram', perfil.instagram], [tiktok, 'tiktok', perfil.tiktok]].forEach(([link, network, value]) => {
    if (!link) return;
    const href = obterLinkSocial(network, value || '');
    link.href = href || '#';
    const handle = link.querySelector('[data-profile-handle]');
    if (handle) handle.textContent = obterIdentificadorSocial(network, value || '');
    link.classList.toggle('hidden', !href);
  });

  const instagramField = document.getElementById('profile-instagram');
  const tiktokField = document.getElementById('profile-tiktok');
  if (instagramField) instagramField.value = perfil.instagram || '';
  if (tiktokField) tiktokField.value = perfil.tiktok || '';
}

async function alterarFotoPerfil(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    profileImageData = await compactarImagem(file, 1000, 0.82);
    const photo = document.getElementById('profile-photo');
    if (photo) {
      photo.src = profileImageData;
      photo.classList.remove('hidden');
    }
    const editorPhoto = document.getElementById('profile-editor-photo');
    if (editorPhoto) {
      editorPhoto.src = profileImageData;
      editorPhoto.classList.remove('hidden');
    }
    document.getElementById('profile-avatar-fallback')?.classList.add('hidden');
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = '';
  }
}

async function alterarFundoPerfil(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const background = await compactarImagem(file, 1600, 0.72);
    if (background.length > 2500000) {
      throw new Error('A imagem de fundo é muito grande. Escolha uma imagem menor.');
    }
    profileBackgroundData = background;
    aplicarFundo(background);
    const preview = document.getElementById('profile-background-preview');
    if (preview) {
      preview.src = background;
      preview.classList.remove('hidden');
    }
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = '';
  }
}

async function salvarPerfil(event) {
  event.preventDefault();
  const button = document.getElementById('profile-save-button');
  const message = document.getElementById('profile-save-message');
  button.disabled = true;
  message.textContent = 'Salvando...';
  try {
    const response = await fetch(ACERVO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save-profile',
        profile: {
          photo: profileImageData,
          background: profileBackgroundData,
          instagram: sanitizeText(document.getElementById('profile-instagram').value),
          tiktok: sanitizeText(document.getElementById('profile-tiktok').value)
        }
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o perfil.');
    aplicarPerfil(result.profile || {});
    message.textContent = 'Perfil atualizado.';
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function limparFundoPerfil() {
  profileBackgroundData = '';
  aplicarFundo('');
  document.getElementById('profile-background-preview')?.classList.add('hidden');
}

function removerFundo() {
  localStorage.removeItem('imagem_fundo');
  aplicarFundo('');
}

function usarCapaPadrao(image) {
  image.onerror = null;
  image.src = DEFAULT_COVER_URL;
}

function obterUrlCapa(info, isbn) {
  const links = info.imageLinks || {};
  const candidate = info.image || info.cover || info.capa || links.extraLarge || links.large || links.medium || links.small || links.thumbnail || links.smallThumbnail;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim().replace(/^http:/i, 'https:').replace(/&amp;/g, '&');
  }
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg?default=false`;
  }
  return DEFAULT_COVER_URL;
}

function buscarPorTexto() {
  const query = document.getElementById('input-search').value.trim();
  if (query) {
    buscarLivroNaAPI(query);
  }
}

const CBL_SEARCH_URL = "https://isbn-search-br.search.windows.net/indexes/isbn-index/docs/search?api-version=2020-06-30";
const CBL_QUERY_KEY = "100216A23C5AEE390338BBD19EA86D29";
const GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes";
const OPEN_LIBRARY_API_URL = "https://openlibrary.org/api/books";

function obterISBNsParaConsulta(isbn) {
  const isISBN13 = isbn.length === 13 && isbn.startsWith('978');
  if (!isISBN13) {
    return [isbn];
  }

  const base = isbn.slice(3, -1);
  let soma = 0;
  for (let index = 0; index < base.length; index += 1) {
    soma += Number(base[index]) * (10 - index);
  }
  const resto = 11 - (soma % 11);
  const digito = resto === 10 ? 'X' : resto === 11 ? '0' : String(resto);
  return [isbn, `${base}${digito}`];
}

async function buscarISBNNaCBL(isbn) {
  for (const codigo of obterISBNsParaConsulta(isbn)) {
    try {
      const response = await fetch(CBL_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': CBL_QUERY_KEY
        },
        body: JSON.stringify({
          search: codigo,
          searchMode: 'any',
          searchFields: 'FormattedKey,RowKey',
          queryType: 'full',
          top: 1,
          select: 'Authors,Title,Subtitle,RowKey,PartitionKey,FormattedKey,Subject,Veiculacao,Ano,IdiomasObra,Imprint,Date'
        })
      });

      if (!response.ok) {
        console.warn(`CBL respondeu ${response.status} para o ISBN ${codigo}.`);
        continue;
      }

      const data = await response.json();
      if (data.value && data.value.length > 0) {
        const livro = data.value[0];
        return normalizarDadosISBN({
          title: livro.Title,
          authors: livro.Authors,
          publisher: livro.Imprint,
          categories: livro.Subject,
          isbn: livro.FormattedKey || isbn
        });
      }
    } catch (error) {
      console.warn(`CBL falhou para o ISBN ${codigo}:`, error);
    }
  }

  return null;
}

function normalizarListaISBN(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return list.map((value) => {
    if (typeof value === 'string') return sanitizeText(value);
    if (value && typeof value === 'object') return sanitizeText(value.name || value.label || value.title || '');
    return '';
  }).filter(Boolean);
}

function normalizarDadosISBN(data) {
  const info = data.book || data.result || data.data || data;
  const categories = info.categories || info.categorias || info.genre || info.genres || info.genero || info.Subject || info.subjects || '';
  const authors = info.authors || info.autores || info.author || info.Authors || info.Author || [];

  return {
    title: sanitizeText(info.title || info.Title || info.titulo || info.name || info.Name || ''),
    authors: normalizarListaISBN(authors),
    categories: normalizarListaISBN(categories),
    isbn: info.isbn || info.ISBN || info.codigo || info.FormattedKey || '',
    publisher: normalizarListaISBN(info.publisher || info.publisherName || info.imprint || info.Imprint || info.publishers || []).join(', '),
    pageCount: Number(info.pageCount || info.number_of_pages || info.NumberOfPages || 0),
    image: info.image || info.cover || info.capa || '',
    imageLinks: info.imageLinks || {}
  };
}

function combinarDadosISBN(results) {
  const records = results.filter(Boolean).map(normalizarDadosISBN);
  const firstValue = (key) => records.find((record) => {
    const value = record[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  })?.[key];

  return {
    title: firstValue('title') || '',
    authors: firstValue('authors') || [],
    categories: firstValue('categories') || [],
    publisher: firstValue('publisher') || '',
    pageCount: records.find((record) => record.pageCount > 0)?.pageCount || 0,
    image: firstValue('image') || '',
    imageLinks: firstValue('imageLinks') || {}
  };
}

function dadosISBNCompletos(info) {
  return Boolean(info.title && info.authors.length && info.categories.length);
}

async function buscarLivroNaAPI(query) {
  const cleanQuery = query.replace(/[^0-9a-zA-Z\s]/g, '');
  const isbnQuery = cleanQuery.replace(/\s+/g, '');
  const isIsbn = /^\d{10,13}$/.test(isbnQuery);

  try {
    if (isIsbn) {
      const resultadosISBN = [];
      const dadosCBL = await buscarISBNNaCBL(isbnQuery);
      if (dadosCBL) resultadosISBN.push(dadosCBL);

      let dadosCombinados = combinarDadosISBN(resultadosISBN);
      if (!dadosISBNCompletos(dadosCombinados)) {
        const dadosGoogle = await buscarISBNNoGoogleBooks(isbnQuery);
        if (dadosGoogle) resultadosISBN.push(dadosGoogle);
        dadosCombinados = combinarDadosISBN(resultadosISBN);
      }

      if (!dadosISBNCompletos(dadosCombinados)) {
        const dadosOpenLibrary = await buscarISBNNaOpenLibrary(isbnQuery);
        if (dadosOpenLibrary) resultadosISBN.push(dadosOpenLibrary);
        dadosCombinados = combinarDadosISBN(resultadosISBN);
      }

      if (dadosCombinados.title) {
        preencherFormularioLivro(dadosCombinados, isbnQuery);
      } else {
        mostrarFormularioSemDados(isbnQuery);
        alert('Não foi possível localizar este ISBN em bases públicas. O ISBN foi mantido e você pode completar os dados manualmente.');
      }
      return;
    }

    const searchUrl = `${GOOGLE_BOOKS_API_URL}?q=${encodeURIComponent(query)}&maxResults=1`;
    const response = await fetch(searchUrl);
    if (!response.ok) {
      throw new Error(`Falha na consulta (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('A API não retornou JSON público.');
    }

    const data = await response.json();
    const info = data.items && data.items.length > 0 ? data.items[0].volumeInfo : null;
    if (info) {
      preencherFormularioLivro(info, isIsbn ? (info.isbn || cleanQuery) : info.industryIdentifiers ? info.industryIdentifiers[0].identifier : "");
    } else {
      alert("Livro não encontrado na base de dados do Google.");
    }
  } catch (error) {
    alert(isIsbn ? "Erro ao consultar o ISBN e a base de fallback." : "Erro ao buscar dados do livro.");
    console.error(error);
  }
}

async function buscarISBNNoGoogleBooks(isbn) {
  try {
    const response = await fetch(`${GOOGLE_BOOKS_API_URL}?q=isbn:${isbn}&maxResults=1`);
    if (!response.ok) {
      console.warn(`Google Books falhou para o ISBN ${isbn}: ${response.status}`);
      return false;
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      return null;
    }

    return normalizarDadosISBN({ ...data.items[0].volumeInfo, isbn });
  } catch (error) {
    console.warn(`Google Books falhou para o ISBN ${isbn}:`, error);
    return null;
  }
}

async function buscarISBNNaOpenLibrary(isbn) {
  try {
    const url = `${OPEN_LIBRARY_API_URL}?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Open Library falhou para o ISBN ${isbn}: ${response.status}`);
      return false;
    }

    const data = await response.json();
    const livro = data[`ISBN:${isbn}`];
    if (!livro) {
      return null;
    }

    return normalizarDadosISBN({
      title: livro.title,
      authors: livro.authors || [],
      publisher: livro.publishers || [],
      pageCount: Number(livro.number_of_pages || 0),
      categories: livro.subjects || [],
      image: livro.cover ? livro.cover.medium : '',
      isbn
    });
  } catch (error) {
    console.warn(`Open Library falhou para o ISBN ${isbn}:`, error);
    return null;
  }
}

function mostrarFormularioSemDados(isbn) {
  editingBookId = null;
  currentCoverUrl = DEFAULT_COVER_URL;

  document.getElementById('field-title').value = '';
  document.getElementById('field-author').value = '';
  document.getElementById('field-publisher').value = '';
  document.getElementById('field-page-count').value = '';
  document.getElementById('field-genre').value = '';
  document.getElementById('field-isbn').value = isbn;
  document.getElementById('field-niche').value = '';
  document.getElementById('field-acquired-date').value = '';
  document.getElementById('field-finished-date').value = '';
  document.getElementById('field-comment').value = '';
  selecionarCorMarcador('');
  selecionarNota(0);
  document.getElementById('book-cover').src = DEFAULT_COVER_URL;
  document.getElementById('form-title').textContent = 'Cadastro manual';
  document.getElementById('save-book-button').textContent = 'Salvar no Acervo';
  document.getElementById('form-card').classList.remove('hidden');
  document.getElementById('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function preencherFormularioLivro(info, isbn) {
  if (!info) return;

  editingBookId = null;
  const generosApi = Array.isArray(info.categories) ? info.categories.filter(Boolean).join(', ') : info.categories || '';
  const autores = Array.isArray(info.authors) ? info.authors.join(', ') : info.authors || '';
  const editora = Array.isArray(info.publishers) ? info.publishers.join(', ') : info.publisher || info.publisherName || info.imprint || info.Imprint || info.publishers || '';
  currentCoverUrl = obterUrlCapa(info, isbn);

  document.getElementById('field-title').value = info.title || '';
  document.getElementById('field-author').value = autores;
  document.getElementById('field-publisher').value = editora;
  document.getElementById('field-page-count').value = Number(info.pageCount || info.number_of_pages || 0) || '';
  document.getElementById('field-genre').value = generosApi;
  document.getElementById('field-isbn').value = isbn;
  document.getElementById('field-niche').value = '';
  document.getElementById('field-acquired-date').value = '';
  document.getElementById('field-finished-date').value = '';
  document.getElementById('field-comment').value = '';
  selecionarCorMarcador('');
  selecionarNota(0);
  document.getElementById('book-cover').src = currentCoverUrl;
  document.getElementById('form-title').textContent = 'Confirmar Cadastro';
  document.getElementById('save-book-button').textContent = 'Salvar no Acervo';
  document.getElementById('form-card').classList.remove('hidden');
}

function cancelarCadastro() {
  document.getElementById('form-card').classList.add('hidden');
  editingBookId = null;
  selecionarCorMarcador('');
  document.getElementById('form-title').textContent = 'Confirmar Cadastro';
  document.getElementById('save-book-button').textContent = 'Salvar no Acervo';
}

function selecionarNota(nota) {
  document.getElementById('field-rating').value = nota;
  document.querySelectorAll('[data-rating]').forEach((button) => {
    const selected = Number(button.dataset.rating) <= nota;
    button.classList.toggle('text-amber-500', selected);
    button.classList.toggle('text-gray-300', !selected);
    button.setAttribute('aria-pressed', String(Number(button.dataset.rating) === nota));
  });
}

function selecionarCorMarcador(color) {
  const selectedColor = Object.prototype.hasOwnProperty.call(BOOKMARK_COLORS, color) ? color : '';
  const field = document.getElementById('field-bookmark-color');
  if (field) field.value = selectedColor;
  document.querySelectorAll('[data-bookmark-color]').forEach((button) => {
    const selected = button.dataset.bookmarkColor === selectedColor;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('ring-2', selected);
    button.style.setProperty('--tw-ring-color', selectedColor ? BOOKMARK_COLORS[selectedColor].hex : '#927044');
  });
}

function obterCorMarcador(livro) {
  const color = livro?.bookmarkColor || '';
  if (Number(livro?.bookmarkSchemaVersion) >= BOOKMARK_SCHEMA_VERSION) {
    return Object.prototype.hasOwnProperty.call(BOOKMARK_COLORS, color) ? color : '';
  }
  return Object.prototype.hasOwnProperty.call(LEGACY_BOOKMARK_COLORS, color)
    ? LEGACY_BOOKMARK_COLORS[color]
    : '';
}

function renderBookmarkChoices() {
  document.querySelectorAll('[data-bookmark-options]').forEach((container) => {
    container.innerHTML = `
      <button type="button" data-bookmark-color="" onclick="selecionarCorMarcador('')" class="flex h-9 w-9 items-center justify-center rounded border border-gray-400 bg-white text-sm text-gray-600" title="Sem marcador" aria-label="Sem marcador" aria-pressed="true">×</button>
      ${Object.entries(BOOKMARK_COLORS).map(([color, marker]) => `
        <button type="button" data-bookmark-color="${color}" onclick="selecionarCorMarcador('${color}')" class="flex h-9 w-9 items-center justify-center rounded border bg-white transition" style="border-color:${marker.hex};--tw-ring-color:${marker.hex}" title="${marker.category}" aria-label="${marker.category}" aria-pressed="false">
          ${renderBookmarkIcon(color, 'h-6 w-6')}
        </button>
      `).join('')}
    `;
  });
}

function obterLivrosSalvos() {
  try {
    const livros = JSON.parse(localStorage.getItem('meus_livros') || '[]');
    return Array.isArray(livros) ? livros : [];
  } catch (error) {
    console.error('Não foi possível ler o acervo local.', error);
    return [];
  }
}

async function enviarAcervo(dados) {
  const response = await fetch(ACERVO_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados)
  });
  const resultado = await response.json();
  if (!response.ok) {
    throw new Error(resultado.error || 'Não foi possível salvar no servidor.');
  }
  localStorage.setItem('meus_livros', JSON.stringify(resultado.books));
  carregarListaSalva();
  renderFilterMenu();
  renderBookmarkFilters();
  return resultado.books;
}

async function carregarAcervoRemoto() {
  const response = await fetch(ACERVO_API_URL, { cache: 'no-store' });
  const resultado = await response.json();
  if (!response.ok || !Array.isArray(resultado.books)) {
    throw new Error(resultado.error || 'Não foi possível carregar o acervo do servidor.');
  }
  aplicarPerfil(resultado.profile || {});
  let livrosRemotos = resultado.books;

  if (isAdmin && livrosRemotos.some((livro) => Number(livro.bookmarkSchemaVersion || 0) < BOOKMARK_SCHEMA_VERSION)) {
    const migrationResponse = await fetch(ACERVO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'migrate-bookmarks' })
    });
    const migrationResult = await migrationResponse.json();
    if (!migrationResponse.ok || !Array.isArray(migrationResult.books)) {
      throw new Error(migrationResult.error || 'Não foi possível atualizar as categorias dos marcadores.');
    }
    livrosRemotos = migrationResult.books;
  }

  const livrosLocais = obterLivrosSalvos();
  const precisaMigrar = livrosRemotos.length === 0 || livrosLocais.some((livro) => !livro.id);
  if (precisaMigrar && livrosLocais.length > 0) {
    if (isAdmin) {
      const livrosLocaisAtualizados = livrosLocais.map((livro) => ({
        ...livro,
        bookmarkColor: obterCorMarcador(livro),
        bookmarkSchemaVersion: BOOKMARK_SCHEMA_VERSION
      }));
      await enviarAcervo({ action: 'import', books: livrosLocaisAtualizados });
      return;
    }
    if (livrosRemotos.length === 0) return;
  }

  localStorage.setItem('meus_livros', JSON.stringify(livrosRemotos));
  carregarListaSalva();
  renderFilterMenu();
  renderBookmarkFilters();
}

async function salvarLivro() {
  if (!acervoPronto) {
    if (!acervoLoadPromise) {
      acervoLoadPromise = carregarAcervoRemoto()
        .then(() => { acervoPronto = true; })
        .catch((error) => {
          console.error(error);
          throw error;
        });
    }

    try {
      await acervoLoadPromise;
    } catch (error) {
      alert(`Não foi possível carregar o acervo: ${error.message}`);
      return;
    }

    if (!acervoPronto) {
      alert('O acervo ainda está sendo carregado. Aguarde um instante e tente novamente.');
      return;
    }
  }

  const title = sanitizeText(document.getElementById('field-title').value);
  const author = sanitizeText(document.getElementById('field-author').value);
  const publisher = sanitizeText(document.getElementById('field-publisher').value);
  const pageCount = Math.max(0, Number(document.getElementById('field-page-count').value) || 0);
  const genre = sanitizeText(document.getElementById('field-genre').value);
  const niche = sanitizeText(document.getElementById('field-niche').value);
  const isbn = sanitizeText(document.getElementById('field-isbn').value);
  const rating = Number(document.getElementById('field-rating').value) || 0;
  const comment = sanitizeText(document.getElementById('field-comment').value);
  const acquiredDate = document.getElementById('field-acquired-date').value;
  const finishedDate = document.getElementById('field-finished-date').value;
  const selectedBookmarkColor = document.getElementById('field-bookmark-color')?.value || '';
  const bookmarkColor = Object.prototype.hasOwnProperty.call(BOOKMARK_COLORS, selectedBookmarkColor) ? selectedBookmarkColor : '';

  if (!title) {
    alert('O livro precisa de um título!');
    return;
  }

  const livrosSalvos = obterLivrosSalvos();
  const livroAtual = editingBookId === null ? {} : livrosSalvos.find((item) => item.id === editingBookId) || {};
  const livro = {
    ...livroAtual,
    title,
    author,
    publisher,
    pageCount,
    genre: genre || 'Não informado',
    niche: niche || 'Sem nicho',
    isbn,
    cover: currentCoverUrl || livroAtual.cover || '',
    rating,
    comment,
    acquiredDate,
    finishedDate,
    bookmarkColor,
    bookmarkSchemaVersion: BOOKMARK_SCHEMA_VERSION,
    status: livroAtual.status || ''
  };

  try {
    await enviarAcervo({ action: 'save', id: editingBookId, book: livro });
  } catch (error) {
    alert(`Não foi possível salvar no servidor: ${error.message}`);
    return;
  }

  cancelarCadastro();
}

function editarLivro(index) {
  const livro = obterLivrosSalvos()[index];
  if (!livro) return;

  editingBookId = livro.id;
  currentCoverUrl = livro.cover || '';
  document.getElementById('field-title').value = livro.title || '';
  document.getElementById('field-author').value = livro.author || '';
  document.getElementById('field-publisher').value = livro.publisher || '';
  document.getElementById('field-page-count').value = Number(livro.pageCount) || '';
  document.getElementById('field-genre').value = livro.genre === 'Não informado' ? '' : livro.genre || '';
  document.getElementById('field-niche').value = livro.niche === 'Sem nicho' ? '' : livro.niche || '';
  document.getElementById('field-isbn').value = livro.isbn || '';
  document.getElementById('field-acquired-date').value = livro.acquiredDate || '';
  document.getElementById('field-finished-date').value = livro.finishedDate || '';
  document.getElementById('field-comment').value = livro.comment || '';
  selecionarCorMarcador(obterCorMarcador(livro));
  document.getElementById('book-cover').src = currentCoverUrl || DEFAULT_COVER_URL;
  selecionarNota(Number(livro.rating) || 0);
  document.getElementById('form-title').textContent = 'Editar Livro';
  document.getElementById('save-book-button').textContent = 'Salvar Alterações';
  document.getElementById('form-card').classList.remove('hidden');
  document.getElementById('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function excluirLivro(index) {
  const livro = obterLivrosSalvos()[index];
  if (!livro || !confirm(`Excluir "${livro.title}" do acervo?`)) return;

  try {
    await enviarAcervo({ action: 'delete', id: livro.id });
    if (editingBookId === livro.id) cancelarCadastro();
  } catch (error) {
    alert(`Não foi possível excluir o livro: ${error.message}`);
  }
}

function escaparHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function getStatusBadge(status) {
  if (!status || !STATUS_LABELS[status]) return '';
  const colorMap = {
    lido: 'bg-emerald-100 text-emerald-700',
    lendo: 'bg-blue-100 text-blue-700',
    proxima: 'bg-violet-100 text-violet-700'
  };
  return `<span class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${colorMap[status]}">${STATUS_LABELS[status]}</span>`;
}

function renderBookmarkIcon(color, className = 'h-10 w-8') {
  const marker = BOOKMARK_COLORS[color];
  if (!marker) return '';
  if (marker.icon === 'heart') {
    return `<svg viewBox="0 0 24 24" class="${className}" aria-hidden="true" focusable="false"><path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 5.9l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.3 1-1a5.5 5.5 0 0 0 0-7.8Z" fill="${marker.hex}" stroke="white" stroke-linejoin="round" stroke-width="1.4"></path></svg>`;
  }
  if (marker.icon === 'review') {
    return `<svg viewBox="0 0 24 24" class="${className}" fill="none" stroke="${marker.hex}" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M4 5h10M4 10h8M4 15h6M4 20h6"/><path d="m14 17 5.8-5.8 2 2L16 19l-2.5.5z"/><path d="m18.8 12.2 2 2"/></svg>`;
  }
  return `<svg viewBox="0 0 28 40" class="${className}" aria-hidden="true" focusable="false"><path d="M6 2h16a3 3 0 0 1 3 3v32L14 29.5 3 37V5a3 3 0 0 1 3-3Z" fill="${marker.hex}" stroke="white" stroke-linejoin="round" stroke-width="2.5"></path><path d="M8 6h12" fill="none" stroke="white" stroke-linecap="round" stroke-opacity=".58" stroke-width="1.5"></path></svg>`;
}

function renderMarcadorLivro(color) {
  const marker = BOOKMARK_COLORS[color];
  if (!marker) return '';
  const symbol = Boolean(marker.icon);
  const containerClass = symbol
    ? 'absolute left-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-white p-1 shadow-md'
    : 'absolute left-2 top-2 z-10 h-11 w-8 drop-shadow-md';
  return `<span class="${containerClass}" title="${marker.category}" aria-label="${marker.category}">${renderBookmarkIcon(color, 'h-full w-full')}</span>`;
}

function renderFilterMenu() {
  const menu = document.getElementById('filter-menu');
  if (!menu) return;

  const livros = obterLivrosSalvos();
  const groups = [
    {
      key: 'author',
      label: 'Autor',
      values: [...new Set(livros.map((livro) => sanitizeText(livro.author)).filter(Boolean))].sort()
    },
    {
      key: 'genre',
      label: 'Gênero',
      values: [...new Set(livros.map((livro) => sanitizeText(livro.genre)).filter((value) => value && value !== 'Não informado'))].sort()
    },
    {
      key: 'rating',
      label: 'Classificação',
      values: ['5', '4', '3', '2', '1']
    }
  ];
  const visibleGroups = groups;

  menu.innerHTML = `
    <div class="space-y-2">
      <button type="button" data-filter-clear="true" class="w-full rounded px-2 py-1.5 text-left text-xs font-semibold text-gray-700 hover:bg-gray-100">Limpar filtro</button>
      ${visibleGroups.map((group) => {
        const isOpen = activeFilter && activeFilter.field === group.key;
        return `
          <div class="rounded border border-gray-200 bg-gray-50">
            <button type="button" data-filter-parent="${group.key}" class="flex w-full items-center justify-between px-2 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-100">
              <span>${group.label}</span>
              <span>${isOpen ? '▾' : '▸'}</span>
            </button>
            <div class="${isOpen ? '' : 'hidden'} border-t border-gray-200 px-2 py-2">
              ${group.values.length === 0 ? '<p class="text-[11px] text-gray-500">Sem opções</p>' : group.values.map((value) => {
                const starText = group.key === 'rating' ? `${'★'.repeat(Number(value))}` : value;
                return `
                  <button type="button" data-filter-field="${group.key}" data-filter-value="${value}" class="mb-1 block w-full rounded px-2 py-1 text-left text-[11px] text-gray-700 hover:bg-white ${activeFilter && activeFilter.field === group.key && activeFilter.value === value ? 'bg-blue-100 text-blue-700' : ''}">
                    ${group.key === 'rating' ? starText : escaparHtml(value)}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderBookmarkFilters() {
  const container = document.getElementById('bookmark-filters');
  if (!container) return;

  container.innerHTML = `
    ${Object.entries(BOOKMARK_COLORS).map(([color, marker]) => `
      <button type="button" data-bookmark-filter="${color}" class="group flex w-16 shrink-0 flex-col items-center gap-1 rounded px-1 py-1 text-center transition hover:bg-[#927044]/10 ${activeBookmarkFilter === color ? 'bg-[#927044]/15' : ''}" title="Filtrar: ${marker.category}" aria-label="Filtrar livros: ${marker.category}" aria-pressed="${activeBookmarkFilter === color}" style="--bookmark-color:${marker.hex}">
        <span class="flex h-10 w-8 items-center justify-center drop-shadow-sm transition-transform group-hover:-translate-y-0.5">${renderBookmarkIcon(color, 'h-9 w-8')}</span>
        <span class="text-[10px] font-semibold leading-tight text-[#38243D]">${marker.category}</span>
      </button>
    `).join('')}
  `;
}

function aplicarFiltroMarcador(color) {
  activeBookmarkFilter = Object.prototype.hasOwnProperty.call(BOOKMARK_COLORS, color)
    ? activeBookmarkFilter === color ? '' : color
    : '';
  renderBookmarkFilters();
  carregarListaSalva();
}

function aplicarFiltro(field, value) {
  activeFilter = { field, value };
  renderFilterMenu();
  renderBookmarkFilters();
  carregarListaSalva();
}

function limparFiltro() {
  activeFilter = { field: null, value: null };
  activeBookmarkFilter = '';
  renderBookmarkFilters();
  renderFilterMenu();
  carregarListaSalva();
}

function atualizarResumoAcervo(livros) {
  const totalNode = document.getElementById('total-books');
  if (totalNode) totalNode.textContent = new Intl.NumberFormat('pt-BR').format(livros.length);
}

function renderLivroNaLista(livro, index, cardLayout, canManageBooks) {
  const bookmarkColor = obterCorMarcador(livro);
  const controls = canManageBooks ? `
    <div class="mt-2 flex gap-1 border-t border-[#927044]/30 pt-1.5">
      <button type="button" onclick="editarLivro(${index})" class="rounded px-2 py-1 text-[10px] font-semibold text-[#571C2A] hover:bg-[#927044]/15" aria-label="Editar ${escaparHtml(livro.title)}">Editar</button>
      <button type="button" onclick="excluirLivro(${index})" class="rounded px-2 py-1 text-[10px] font-semibold text-[#571C2A] hover:bg-[#927044]/15" aria-label="Excluir ${escaparHtml(livro.title)}">Excluir</button>
    </div>
  ` : '';

  if (cardLayout) {
    return `
      <li data-book-index="${index}" class="book-card group relative min-w-0">
        <div class="relative aspect-[2/3] overflow-hidden bg-[#DED4C2]">
          <img src="${escaparHtml(livro.cover || DEFAULT_COVER_URL)}" alt="Capa de ${escaparHtml(livro.title)}" onerror="usarCapaPadrao(this)" class="h-full w-full object-cover">
          ${renderMarcadorLivro(bookmarkColor)}
        </div>
        <div class="min-w-0 pt-2">
          <div class="flex items-start justify-between gap-1">
            <p class="line-clamp-2 min-w-0 text-xs font-semibold leading-4 text-[#191719]" title="${escaparHtml(livro.title)}">${escaparHtml(livro.title)}</p>
            ${getStatusBadge(livro.status || '')}
          </div>
          <p class="mt-1 truncate text-[11px] leading-4 text-[#38243D]" title="${escaparHtml(livro.author || 'Autor não informado')}">${escaparHtml(livro.author || 'Autor não informado')}</p>
          ${Number(livro.rating) > 0 ? `<p class="mt-1 text-[10px] font-semibold text-[#927044]" aria-label="Nota ${Number(livro.rating)} de 5">${'★'.repeat(Math.min(5, Number(livro.rating)))}</p>` : ''}
          ${controls}
        </div>
      </li>
    `;
  }

  return `
    <li data-book-index="${index}" class="relative flex items-center gap-3 border-b border-[#927044]/25 py-3 text-sm">
      ${renderMarcadorLivro(bookmarkColor)}
      <img src="${escaparHtml(livro.cover || DEFAULT_COVER_URL)}" alt="Capa de ${escaparHtml(livro.title)}" onerror="usarCapaPadrao(this)" class="h-14 w-10 shrink-0 rounded object-cover">
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <p class="truncate text-sm font-semibold text-[#191719]">${escaparHtml(livro.title)}</p>
          ${getStatusBadge(livro.status || '')}
        </div>
        <p class="mt-1 truncate text-xs text-[#38243D]">${escaparHtml(livro.author || 'Autor não informado')}</p>
        ${livro.publisher ? `<p class="mt-1 truncate text-xs text-[#38243D]">${escaparHtml(livro.publisher)}</p>` : ''}
        <span class="book-tag mt-1">${escaparHtml(livro.genre || 'Gênero')}</span>
      </div>
      ${controls}
    </li>
  `;
}

function carregarListaSalva() {
  const livros = obterLivrosSalvos();
  const listEl = document.getElementById('books-list');
  const cardLayout = document.body.dataset.bookLayout === 'cards';
  const canManageBooks = isAdmin;
  atualizarResumoAcervo(livros);

  const query = sanitizeText(document.getElementById('input-library-search').value).toLocaleLowerCase('pt-BR');
  const livrosFiltrados = livros
    .map((livro, index) => ({ livro, index }))
    .filter(({ livro }) => {
      const matchesQuery = [livro.title, livro.author, livro.publisher, livro.genre, livro.isbn, livro.comment, livro.status]
        .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query));

      if (!matchesQuery) return false;
      if (activeBookmarkFilter && obterCorMarcador(livro) !== activeBookmarkFilter) return false;
      if (!activeFilter || !activeFilter.field || !activeFilter.value) return true;

      if (activeFilter.field === 'rating') {
        return Number(livro.rating || 0) === Number(activeFilter.value);
      }

      const value = sanitizeText(livro[activeFilter.field] || '').toLocaleLowerCase('pt-BR');
      return value.includes(String(activeFilter.value).toLocaleLowerCase('pt-BR'));
    });

  document.getElementById('visible-books').textContent = livrosFiltrados.length;

  if (livros.length === 0) {
    listEl.innerHTML = '<li class="py-2 text-sm text-gray-500 text-center">Nenhum livro cadastrado ainda.</li>';
    return;
  }

  if (livrosFiltrados.length === 0) {
    listEl.innerHTML = '<li class="py-2 text-sm text-gray-500 text-center">Nenhum livro encontrado.</li>';
    return;
  }

  listEl.innerHTML = livrosFiltrados.map(({ livro, index }) => renderLivroNaLista(livro, index, cardLayout, canManageBooks)).join('');
}

function formatarData(value) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
}

function fecharMenuEtiqueta() {
  const menu = document.getElementById('book-status-menu');
  if (menu) {
    menu.classList.add('hidden');
    menu.innerHTML = '';
  }
}

function abrirMenuEtiqueta(event, index) {
  if (!isAdmin) return;
  const menu = document.getElementById('book-status-menu');
  if (!menu) return;

  const rect = event.target.closest('[data-book-index]')?.getBoundingClientRect();
  const left = rect ? rect.left + 12 : event.clientX || 20;
  const top = rect ? rect.top + rect.height + 8 : event.clientY || 20;
  menu.innerHTML = `
    <div class="space-y-1">
      ${Object.entries(STATUS_LABELS).map(([value, label]) => `
        <button type="button" data-book-label="${value}" data-book-index="${index}" class="block w-full rounded px-2 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-100">${label}</button>
      `).join('')}
    </div>
  `;
  menu.style.left = `${Math.min(left, window.innerWidth - 220)}px`;
  menu.style.top = `${Math.min(top, window.innerHeight - 150)}px`;
  menu.classList.remove('hidden');
}

async function aplicarEtiquetaLivro(index, value) {
  if (!isAdmin || document.body.dataset.bookLayout === 'cards') return;
  const livros = obterLivrosSalvos();
  const livro = livros[index];
  if (!livro) return;

  livro.status = value;
  try {
    await enviarAcervo({ action: 'save', id: livro.id, book: livro });
    fecharMenuEtiqueta();
  } catch (error) {
    alert(`Não foi possível atualizar a etiqueta: ${error.message}`);
  }
}

function iniciarLongPress(event) {
  if (!isAdmin) return;
  const targetButton = event.target.closest('button');
  if (targetButton) return;

  const item = event.target.closest('[data-book-index]');
  if (!item) return;

  const index = Number(item.dataset.bookIndex);
  if (Number.isNaN(index)) return;

  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    abrirMenuEtiqueta(event, index);
  }, 2000);
}

function cancelarLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function exportarAcervo() {
  const arquivo = {
    format: 'estantevirtual-acervo',
    version: 1,
    exportedAt: new Date().toISOString(),
    books: obterLivrosSalvos().map((livro) => ({
      ...livro,
      bookmarkColor: obterCorMarcador(livro),
      bookmarkSchemaVersion: BOOKMARK_SCHEMA_VERSION
    }))
  };
  const blob = new Blob([JSON.stringify(arquivo, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'meu-acervo-estantevirtual.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function importarAcervo(event) {
  const arquivo = event.target.files[0];
  if (!arquivo) return;

  try {
    const dados = JSON.parse(await arquivo.text());
    const importados = Array.isArray(dados) ? dados : dados.books;
    if (!Array.isArray(importados) || importados.some((livro) => !livro || typeof livro.title !== 'string' || !livro.title.trim())) {
      throw new Error('Formato de acervo inválido.');
    }

    const livros = obterLivrosSalvos();
    const chaves = new Set(livros.map((livro) => livro.isbn
      ? `isbn:${livro.isbn}`
      : `livro:${livro.title.trim().toLocaleLowerCase('pt-BR')}|${(livro.author || '').trim().toLocaleLowerCase('pt-BR')}`));
    let adicionados = 0;
    importados.forEach((livro) => {
      const chave = livro.isbn
        ? `isbn:${livro.isbn}`
        : `livro:${livro.title.trim().toLocaleLowerCase('pt-BR')}|${(livro.author || '').trim().toLocaleLowerCase('pt-BR')}`;
      if (!chaves.has(chave)) {
        livros.push({
          genre: 'Não informado',
          niche: 'Sem nicho',
          rating: 0,
          comment: '',
          status: '',
          ...livro,
          bookmarkColor: obterCorMarcador(livro),
          bookmarkSchemaVersion: BOOKMARK_SCHEMA_VERSION
        });
        chaves.add(chave);
        adicionados += 1;
      }
    });

    await enviarAcervo({ action: 'import', books: livros });
    alert(`${adicionados} livro(s) importado(s). Os livros repetidos foram ignorados.`);
  } catch (error) {
    alert(`Não foi possível importar o acervo: ${error.message}`);
  } finally {
    event.target.value = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const authReady = initAuth();
  if (document.getElementById('auth-form')) return;

  renderFilterMenu();
  renderBookmarkFilters();
  renderBookmarkChoices();
  carregarListaSalva();
  aplicarFundo(localStorage.getItem('imagem_fundo') || '');

  const filterToggle = document.getElementById('filter-toggle');
  const filterMenu = document.getElementById('filter-menu');
  if (filterToggle && filterMenu) {
    filterToggle.addEventListener('click', () => {
      filterMenu.classList.toggle('hidden');
    });
  }

  document.querySelectorAll('[data-library-search-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const wrapper = document.getElementById(button.getAttribute('aria-controls'));
      const input = wrapper?.querySelector('input[type="search"]');
      if (!wrapper || !input) return;
      const opening = wrapper.classList.contains('hidden');
      wrapper.classList.toggle('hidden', !opening);
      document.querySelectorAll('[data-library-search-toggle]').forEach((toggle) => {
        toggle.setAttribute('aria-expanded', String(opening));
      });
      if (opening) {
        input.focus();
      } else {
        input.value = '';
        carregarListaSalva();
      }
    });
  });

  const profileForm = document.getElementById('profile-form');
  profileForm?.addEventListener('submit', salvarPerfil);
  document.getElementById('profile-photo-upload')?.addEventListener('change', alterarFotoPerfil);
  document.getElementById('profile-background-upload')?.addEventListener('change', alterarFundoPerfil);
  document.getElementById('profile-background-clear')?.addEventListener('click', limparFundoPerfil);

  document.getElementById('bookmark-filters')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-bookmark-filter]');
    if (button) aplicarFiltroMarcador(button.dataset.bookmarkFilter);
  });

  filterMenu?.addEventListener('click', (event) => {
    const clearButton = event.target.closest('[data-filter-clear]');
    if (clearButton) {
      limparFiltro();
      filterMenu.classList.add('hidden');
      return;
    }

    const parent = event.target.closest('[data-filter-parent]');
    if (parent) {
      const submenu = parent.nextElementSibling;
      if (submenu) submenu.classList.toggle('hidden');
      return;
    }

    const target = event.target.closest('[data-filter-field]');
    if (target) {
      aplicarFiltro(target.dataset.filterField, target.dataset.filterValue);
      filterMenu.classList.add('hidden');
    }
  });

  document.getElementById('books-list')?.addEventListener('pointerdown', iniciarLongPress);
  document.getElementById('books-list')?.addEventListener('pointerup', cancelarLongPress);
  document.getElementById('books-list')?.addEventListener('pointerleave', cancelarLongPress);
  document.getElementById('books-list')?.addEventListener('pointercancel', cancelarLongPress);

  document.getElementById('book-status-menu')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-book-label]');
    if (!button) return;
    const index = Number(button.dataset.bookIndex);
    const value = button.dataset.bookLabel;
    if (!Number.isNaN(index)) {
      await aplicarEtiquetaLivro(index, value);
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#filter-menu') && !event.target.closest('#filter-toggle')) {
      document.getElementById('filter-menu')?.classList.add('hidden');
    }
    if (!event.target.closest('#book-status-menu') && !event.target.closest('[data-book-index]')) {
      fecharMenuEtiqueta();
    }
  });

  acervoLoadPromise = authReady
    .then(() => document.body.dataset.adminPage === 'true' && !isAdmin ? null : carregarAcervoRemoto())
    .then(() => { acervoPronto = true; })
    .catch((error) => {
      console.error(error);
      alert(`Não foi possível conectar ao acervo no servidor: ${error.message}`);
      acervoPronto = true;
    });
});
