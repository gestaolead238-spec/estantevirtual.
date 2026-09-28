let html5QrCode = null;
let currentCoverUrl = "";
let editingBookIndex = null;
const DEFAULT_COVER_URL = "https://via.placeholder.com/128x192?text=Sem+Capa";

// Escanear Código de Barras (EAN-13 / ISBN)
function toggleScanner() {
  const container = document.getElementById('scanner-container');
  container.classList.remove('hidden');

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("interactive");
  }

  const config = {
    fps: 10,
    qrbox: { width: 250, height: 150 },
    formatsToSupport: [ Html5QrcodeSupportedFormats.EAN_13 ]
  };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess
  ).catch(err => {
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
      throw new Error(`Falha na consulta oficial da CBL (${response.status})`);
    }

    const data = await response.json();
    if (data.value && data.value.length > 0) {
      const livro = data.value[0];
      preencherFormularioLivro({
        title: livro.Title,
        authors: livro.Authors || [],
        categories: livro.Subject ? [livro.Subject] : [],
        image: ''
      }, livro.FormattedKey || isbn);
      return true;
    }
  }

  return false;
}

function normalizarDadosISBN(data) {
  const info = data.book || data.result || data.data || data;
  const categories = info.categories || info.categorias || info.genre || info.genero || "";

  return {
    title: info.title || info.titulo || info.name || "",
    authors: info.authors || info.autores || info.author || [],
    categories: Array.isArray(categories) ? categories : [categories],
    isbn: info.isbn || info.ISBN || info.codigo || "",
    image: info.image || info.cover || info.capa || ""
  };
}

// Consulta a mesma base oficial usada pela página de pesquisa da CBL.
async function buscarLivroNaAPI(query) {
  const cleanQuery = query.replace(/[^0-9a-zA-Z\s]/g, '');
  const isIsbn = /^\d{10,13}$/.test(cleanQuery);

  try {
    if (isIsbn) {
      const encontradoNaCBL = await buscarISBNNaCBL(cleanQuery);
      if (encontradoNaCBL) {
        return;
      }
      return buscarISBNNoGoogleBooks(cleanQuery);
    }

    const searchUrl = `${GOOGLE_BOOKS_API_URL}?q=${encodeURIComponent(query)}&maxResults=1`;
    const response = await fetch(searchUrl);
    if (!response.ok) {
      throw new Error(`Falha na consulta (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('O ISBN.org.br não retornou uma API JSON pública.');
    }

    const data = await response.json();
    const info = data.items && data.items.length > 0
      ? data.items[0].volumeInfo
      : null;

    if (info) {
      preencherFormularioLivro(info, isIsbn ? (info.isbn || cleanQuery) : info.industryIdentifiers ? info.industryIdentifiers[0].identifier : "");
    } else {
      alert("Livro não encontrado na base de dados do Google.");
    }
  } catch (error) {
    if (isIsbn) {
      try {
        return await buscarISBNNoGoogleBooks(cleanQuery);
      } catch (fallbackError) {
        console.error(fallbackError);
      }
    }

    alert(isIsbn ? "Erro ao consultar o ISBN.org.br e a base de fallback." : "Erro ao buscar dados do livro.");
    console.error(error);
  }
}

async function buscarISBNNoGoogleBooks(isbn) {
  const response = await fetch(`${GOOGLE_BOOKS_API_URL}?q=isbn:${isbn}&maxResults=1`);
  if (!response.ok) {
    return buscarISBNNaOpenLibrary(isbn);
  }

  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    alert("Livro não encontrado para o ISBN informado.");
    return;
  }

  preencherFormularioLivro(data.items[0].volumeInfo, isbn);
}

async function buscarISBNNaOpenLibrary(isbn) {
  const url = `${OPEN_LIBRARY_API_URL}?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha na consulta alternativa (${response.status})`);
  }

  const data = await response.json();
  const livro = data[`ISBN:${isbn}`];
  if (!livro) {
    alert("Livro não encontrado para o ISBN informado.");
    return;
  }

  preencherFormularioLivro({
    title: livro.title,
    authors: livro.authors ? livro.authors.map(autor => autor.name) : [],
    categories: livro.subjects ? livro.subjects.map(subject => subject.name) : [],
    image: livro.cover ? livro.cover.medium : ""
  }, isbn);
}

function preencherFormularioLivro(info, isbn) {
  if (info) {
      editingBookIndex = null;
      // Puxa o gênero principal retornado pela API (se existir)
      const generosApi = Array.isArray(info.categories) ? info.categories.filter(Boolean).join(", ") : info.categories || "";
      const autores = Array.isArray(info.authors) ? info.authors.join(", ") : info.authors || "";
      
      // Puxa a imagem da capa
      currentCoverUrl = obterUrlCapa(info, isbn);

      // Preenche os campos do formulário automaticamente
      document.getElementById('field-title').value = info.title || "";
      document.getElementById('field-author').value = autores;
      document.getElementById('field-genre').value = generosApi;
      document.getElementById('field-isbn').value = isbn;
      document.getElementById('field-niche').value = ""; // Fica em branco para você preencher
      document.getElementById('field-acquired-date').value = "";
      document.getElementById('field-finished-date').value = "";
      document.getElementById('field-comment').value = "";
      selecionarNota(0);
      document.getElementById('book-cover').src = currentCoverUrl;
      document.getElementById('form-title').textContent = "Confirmar Cadastro";
      document.getElementById('save-book-button').textContent = "Salvar no Acervo";

      // Exibe o formulário
      document.getElementById('form-card').classList.remove('hidden');
  }
}

function cancelarCadastro() {
  document.getElementById('form-card').classList.add('hidden');
  editingBookIndex = null;
  document.getElementById('form-title').textContent = "Confirmar Cadastro";
  document.getElementById('save-book-button').textContent = "Salvar no Acervo";
}

function selecionarNota(nota) {
  document.getElementById('field-rating').value = nota;
  document.querySelectorAll('[data-rating]').forEach(button => {
    const selected = Number(button.dataset.rating) <= nota;
    button.classList.toggle('text-amber-500', selected);
    button.classList.toggle('text-gray-300', !selected);
    button.setAttribute('aria-pressed', String(Number(button.dataset.rating) === nota));
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

// Salvar Dados no Armazenamento Local
function salvarLivro() {
  const title = document.getElementById('field-title').value.trim();
  const author = document.getElementById('field-author').value.trim();
  const genre = document.getElementById('field-genre').value.trim();
  const niche = document.getElementById('field-niche').value.trim();
  const isbn = document.getElementById('field-isbn').value.trim();
  const rating = Number(document.getElementById('field-rating').value) || 0;
  const comment = document.getElementById('field-comment').value.trim();
  const acquiredDate = document.getElementById('field-acquired-date').value;
  const finishedDate = document.getElementById('field-finished-date').value;

  if (!title) {
    alert("O livro precisa de um título!");
    return;
  }

  const livrosSalvos = obterLivrosSalvos();
  const livroAtual = editingBookIndex === null ? {} : livrosSalvos[editingBookIndex] || {};
  const livro = {
    ...livroAtual,
    title,
    author,
    genre: genre || "Não informado",
    niche: niche ? `Nicho ${niche}` : "Sem nicho",
    isbn,
    cover: currentCoverUrl || livroAtual.cover || "",
    rating,
    comment,
    acquiredDate,
    finishedDate
  };

  if (editingBookIndex === null) {
    livrosSalvos.push(livro);
  } else {
    livrosSalvos[editingBookIndex] = livro;
  }
  try {
    localStorage.setItem('meus_livros', JSON.stringify(livrosSalvos));
  } catch (error) {
    alert('Não foi possível salvar. A imagem da capa pode ser grande demais; envie uma imagem menor.');
    return;
  }

  cancelarCadastro();
  carregarListaSalva();
}

function editarLivro(index) {
  const livro = obterLivrosSalvos()[index];
  if (!livro) return;

  editingBookIndex = index;
  currentCoverUrl = livro.cover || "";
  document.getElementById('field-title').value = livro.title || "";
  document.getElementById('field-author').value = livro.author || "";
  document.getElementById('field-genre').value = livro.genre === "Não informado" ? "" : livro.genre || "";
  document.getElementById('field-niche').value = (livro.niche || "").replace(/^Nicho\s*/, '').replace(/^Sem nicho$/, '');
  document.getElementById('field-isbn').value = livro.isbn || "";
  document.getElementById('field-acquired-date').value = livro.acquiredDate || "";
  document.getElementById('field-finished-date').value = livro.finishedDate || "";
  document.getElementById('field-comment').value = livro.comment || "";
  document.getElementById('book-cover').src = currentCoverUrl || DEFAULT_COVER_URL;
  selecionarNota(Number(livro.rating) || 0);
  document.getElementById('form-title').textContent = "Editar Livro";
  document.getElementById('save-book-button').textContent = "Salvar Alterações";
  document.getElementById('form-card').classList.remove('hidden');
  document.getElementById('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escaparHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

// Carregar Lista do Acervo
function carregarListaSalva() {
  const livros = obterLivrosSalvos();
  const listEl = document.getElementById('books-list');
  document.getElementById('total-books').innerText = livros.length;
  const query = document.getElementById('input-library-search').value.trim().toLocaleLowerCase('pt-BR');
  const livrosFiltrados = livros
    .map((livro, index) => ({ livro, index }))
    .filter(({ livro }) => [livro.title, livro.author, livro.genre, livro.niche, livro.isbn, livro.comment]
      .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(query)));
  document.getElementById('visible-books').textContent = livrosFiltrados.length;

  if (livros.length === 0) {
    listEl.innerHTML = '<li class="py-2 text-sm text-gray-500 text-center">Nenhum livro cadastrado ainda.</li>';
    return;
  }

  if (livrosFiltrados.length === 0) {
    listEl.innerHTML = '<li class="py-2 text-sm text-gray-500 text-center">Nenhum livro encontrado.</li>';
    return;
  }

  listEl.innerHTML = livrosFiltrados.map(({ livro: l, index }) => `
    <li class="py-3 flex gap-3 items-center text-sm">
      <img src="${escaparHtml(l.cover || DEFAULT_COVER_URL)}" alt="Capa de ${escaparHtml(l.title)}" onerror="usarCapaPadrao(this)" class="w-10 h-14 object-cover rounded shadow-sm bg-gray-100">
      <div class="flex-1">
        <p class="font-semibold text-gray-800 leading-tight">${escaparHtml(l.title)}</p>
        <p class="text-xs text-gray-500">${escaparHtml(l.author)}</p>
        <div class="flex gap-2 mt-1">
          <span class="inline-block bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded font-medium">${escaparHtml(l.genre)}</span>
          <span class="inline-block bg-amber-50 text-amber-700 text-[10px] px-2 py-0.5 rounded font-medium">${escaparHtml(l.niche)}</span>
        </div>
        ${(l.acquiredDate || l.finishedDate) ? `<p class="mt-1 text-[11px] text-gray-500">${l.acquiredDate ? `Adquirido: ${escaparHtml(formatarData(l.acquiredDate))}` : ''}${l.acquiredDate && l.finishedDate ? ' · ' : ''}${l.finishedDate ? `Terminado: ${escaparHtml(formatarData(l.finishedDate))}` : ''}</p>` : ''}
        ${Number(l.rating) > 0 ? `<p class="mt-1 text-amber-500" aria-label="Nota ${Number(l.rating)} de 5">${'★'.repeat(Math.min(5, Number(l.rating)))}${'☆'.repeat(5 - Math.min(5, Number(l.rating)))}</p>` : ''}
        ${l.comment ? `<p class="mt-1 text-xs text-gray-600">${escaparHtml(l.comment)}</p>` : ''}
      </div>
      <button type="button" onclick="editarLivro(${index})" class="shrink-0 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded" aria-label="Editar ${escaparHtml(l.title)}">Editar</button>
    </li>
  `).join('');
}

function formatarData(value) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
}

function exportarAcervo() {
  const arquivo = {
    format: 'estantevirtual-acervo',
    version: 1,
    exportedAt: new Date().toISOString(),
    books: obterLivrosSalvos()
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
    if (!Array.isArray(importados) || importados.some(livro => !livro || typeof livro.title !== 'string' || !livro.title.trim())) {
      throw new Error('Formato de acervo inválido.');
    }

    const livros = obterLivrosSalvos();
    const chaves = new Set(livros.map(livro => livro.isbn
      ? `isbn:${livro.isbn}`
      : `livro:${livro.title.trim().toLocaleLowerCase('pt-BR')}|${(livro.author || '').trim().toLocaleLowerCase('pt-BR')}`));
    let adicionados = 0;
    importados.forEach(livro => {
      const chave = livro.isbn
        ? `isbn:${livro.isbn}`
        : `livro:${livro.title.trim().toLocaleLowerCase('pt-BR')}|${(livro.author || '').trim().toLocaleLowerCase('pt-BR')}`;
      if (!chaves.has(chave)) {
        livros.push({ genre: 'Não informado', niche: 'Sem nicho', rating: 0, comment: '', ...livro });
        chaves.add(chave);
        adicionados += 1;
      }
    });

    localStorage.setItem('meus_livros', JSON.stringify(livros));
    carregarListaSalva();
    alert(`${adicionados} livro(s) importado(s). Os livros repetidos foram ignorados.`);
  } catch (error) {
    alert(`Não foi possível importar o acervo: ${error.message}`);
  } finally {
    event.target.value = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  carregarListaSalva();
  aplicarFundo(localStorage.getItem('imagem_fundo') || '');
});