# estantevirtual.

## Hospedagem

O site mostra o acervo publicamente em modo de leitura. Para cadastrar, editar, excluir e importar livros, entre pela página `admin.html`; as alterações também são protegidas no servidor por uma sessão PHP.

O frontend usa React, TypeScript e Vite. Para desenvolver, instale o Node.js, execute `npm ci` e inicie `npm run dev`. `npm run build` valida os tipos e gera em `dist/` as páginas otimizadas e os endpoints `api.php`, `auth.php` e `isbn-lookup.php`. Para gerar o pacote de publicação, execute `npm run build:zip`; o arquivo `dist.zip` será criado na raiz do projeto com o conteúdo de `dist/`.

Para publicar, envie o conteúdo de `dist/` para a pasta pública do site e configure o servidor para executar os arquivos PHP; habilite também as extensões PHP cURL e DOM para a busca ISBN Search. A home e o catálogo são públicos; `admin.html` autentica e `admin-tools.html` oferece as ferramentas administrativas protegidas pela sessão PHP. O e-mail inicial é `sara.pessopani@gmail.com`; ele pode ser alterado com `ESTANTE_ADMIN_EMAIL`. Defina a variável privada `ESTANTE_ADMIN_PASSWORD` no ambiente do PHP. Não coloque a senha em arquivos públicos, no JavaScript ou no repositório. Troque qualquer senha fraca antes da hospedagem.

A busca por ISBN consulta ISBN Search e combina os resultados com Google Books e os registros de edição e obra do Open Library. O endpoint Open Library `https://openlibrary.org/isbn/{ISBN}.json` é usado para complementar autor, assuntos, editora e capa quando disponíveis.

O acervo e o perfil público são criados automaticamente em `estantevirtual-data/livros.json` e `estantevirtual-data/perfil.json`, fora da pasta pública. A conta do PHP precisa ter permissão para criar e gravar nessa pasta. O `GET` de `api.php` permite a leitura pública; as operações `POST` exigem uma sessão administrativa válida.

Para desenvolvimento local, defina as variáveis de ambiente no terminal antes de iniciar `php -S localhost:8000`. O PHP embutido não carrega alterações de ambiente depois de iniciado; reinicie o servidor após configurá-las. Em hospedagem, configure-as no ambiente PHP/FPM disponibilizado pelo provedor e habilite HTTPS para proteger as credenciais em trânsito.

O campo interno de resenha continua armazenado na propriedade `comment` para preservar os registros existentes; a interface o apresenta como “Resenha”. A interface não exibe mais a contagem de páginas nem o campo “Páginas”; valores antigos permanecem nos dados para manter compatibilidade com acervos já cadastrados.