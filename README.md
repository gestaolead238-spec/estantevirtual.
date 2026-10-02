# estantevirtual.

## Hospedagem

O site mostra o acervo publicamente em modo de leitura. Para cadastrar, editar, excluir e importar livros, entre pela página `admin.html`; as alterações também são protegidas no servidor por uma sessão PHP.

Publique `index.html`, `biblioteca.html`, `admin.html`, `admin-tools.html`, `app.js`, `api.php` e `auth.php` na pasta pública e configure o PHP para executar nessa pasta. A home apresenta a biblioteca; o botão de boas-vindas abre o catálogo público em cards; o painel de gestão fica em uma rota própria protegida por sessão. O e-mail inicial é `sara.pessopani@gmail.com`; ele pode ser alterado com `ESTANTE_ADMIN_EMAIL`. Defina a variável privada `ESTANTE_ADMIN_PASSWORD` no ambiente do PHP. Não coloque a senha em arquivos públicos, no JavaScript ou no repositório. A senha informada durante o desenvolvimento é fraca e deve ser trocada antes da hospedagem.

O arquivo do acervo é criado automaticamente em `estantevirtual-data/livros.json`, fora da pasta pública. A conta do PHP precisa ter permissão para criar e gravar nessa pasta. O `GET` de `api.php` permite a leitura pública; as operações `POST` exigem uma sessão administrativa válida.

Para desenvolvimento local, defina as variáveis de ambiente no terminal antes de iniciar `php -S localhost:8000`. O PHP embutido não carrega alterações de ambiente depois de iniciado; reinicie o servidor após configurá-las. Em hospedagem, configure-as no ambiente PHP/FPM disponibilizado pelo provedor e habilite HTTPS para proteger as credenciais em trânsito.

O campo interno de resenha continua armazenado na propriedade `comment` para preservar os registros existentes; a interface o apresenta como “Resenha”.