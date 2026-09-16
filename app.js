let html5QrCode = null;
let currentCoverUrl = "";

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
      // Puxa o gênero principal retornado pela API (se existir)
      const generosApi = Array.isArray(info.categories) ? info.categories.filter(Boolean).join(", ") : info.categories || "";
      const autores = Array.isArray(info.authors) ? info.authors.join(", ") : info.authors || "";
      
      // Puxa a imagem da capa
      currentCoverUrl = info.image
        ? info.image.replace('http://', 'https://')
        : info.imageLinks 
        ? info.imageLinks.thumbnail.replace('http://', 'https://') 
        : "https://via.placeholder.com/128x192?text=Sem+Capa";

      // Preenche os campos do formulário automaticamente
      document.getElementById('field-title').value = info.title || "";
      document.getElementById('field-author').value = autores;
      document.getElementById('field-genre').value = generosApi;
      document.getElementById('field-isbn').value = isbn;
      document.getElementById('field-niche').value = ""; // Fica em branco para você preencher
      document.getElementById('book-cover').src = currentCoverUrl;

      // Exibe o formulário
      document.getElementById('form-card').classList.remove('hidden');
  }
}

function cancelarCadastro() {
  document.getElementById('form-card').classList.add('hidden');
}

// Salvar Dados no Armazenamento Local
function salvarLivro() {
  const title = document.getElementById('field-title').value.trim();
  const author = document.getElementById('field-author').value.trim();
  const genre = document.getElementById('field-genre').value.trim();
  const niche = document.getElementById('field-niche').value.trim();
  const isbn = document.getElementById('field-isbn').value.trim();

  if (!title) {
    alert("O livro precisa de um título!");
    return;
  }

  const novoLivro = {
    title,
    author,
    genre: genre || "Não informado",
    niche: niche ? `Nicho ${niche}` : "Sem nicho",
    isbn,
    cover: currentCoverUrl
  };

  const livrosSalvos = JSON.parse(localStorage.getItem('meus_livros') || '[]');
  livrosSalvos.push(novoLivro);
  localStorage.setItem('meus_livros', JSON.stringify(livrosSalvos));

  cancelarCadastro();
  carregarListaSalva();
}

// Carregar Lista do Acervo
function carregarListaSalva() {
  const livros = JSON.parse(localStorage.getItem('meus_livros') || '[]');
  const listEl = document.getElementById('books-list');
  document.getElementById('total-books').innerText = livros.length;

  if (livros.length === 0) {
    listEl.innerHTML = '<li class="py-2 text-sm text-gray-500 text-center">Nenhum livro cadastrado ainda.</li>';
    return;
  }

  listEl.innerHTML = livros.map(l => `
    <li class="py-3 flex gap-3 items-center text-sm">
      <img src="${l.cover}" class="w-10 h-14 object-cover rounded shadow-sm bg-gray-100">
      <div class="flex-1">
        <p class="font-semibold text-gray-800 leading-tight">${l.title}</p>
        <p class="text-xs text-gray-500">${l.author}</p>
        <div class="flex gap-2 mt-1">
          <span class="inline-block bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded font-medium">${l.genre}</span>
          <span class="inline-block bg-amber-50 text-amber-700 text-[10px] px-2 py-0.5 rounded font-medium">📍 ${l.niche}</span>
        </div>
      </div>
    </li>
  `).join('');
}

document.addEventListener('DOMContentLoaded', carregarListaSalva);