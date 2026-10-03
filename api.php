<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responder(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function lerLivros($arquivo): array
{
    rewind($arquivo);
    $conteudo = stream_get_contents($arquivo);
    if ($conteudo === false || $conteudo === '') {
        return [];
    }

    $livros = json_decode($conteudo, true);
    if (!is_array($livros)) {
        throw new RuntimeException('O arquivo do acervo está inválido.');
    }
    return $livros;
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($metodo === 'POST') {
    $https = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && $_SERVER['HTTPS'] !== 'off';
    session_set_cookie_params([
        'httponly' => true,
        'secure' => $https,
        'samesite' => 'Strict',
        'path' => '/',
    ]);
    session_start();
    if (($_SESSION['admin_authenticated'] ?? false) !== true) {
        responder(401, ['error' => 'Entre como administrador para alterar o acervo.']);
    }
    session_write_close();
}

try {
    $diretorio = getenv('ACERVO_STORAGE_DIR') ?: dirname(__DIR__) . '/estantevirtual-data';
    if (!is_dir($diretorio) && !mkdir($diretorio, 0700, true) && !is_dir($diretorio)) {
        throw new RuntimeException('Não foi possível criar a pasta privada do acervo.');
    }
    $arquivo = fopen($diretorio . '/livros.json', 'c+');
    if ($arquivo === false) {
        throw new RuntimeException('Não foi possível abrir o arquivo do acervo.');
    }

    $bloqueio = $metodo === 'GET' ? LOCK_SH : LOCK_EX;
    if (!flock($arquivo, $bloqueio)) {
        throw new RuntimeException('Não foi possível acessar o acervo.');
    }

    $livros = lerLivros($arquivo);
    foreach ($livros as &$livro) {
        if (empty($livro['id'])) {
            $livro['id'] = bin2hex(random_bytes(8));
        }
    }
    unset($livro);

    if ($metodo === 'GET') {
        $perfilPath = $diretorio . '/perfil.json';
        $perfil = [];
        if (is_file($perfilPath)) {
            $perfilLido = json_decode((string) file_get_contents($perfilPath), true);
            if (is_array($perfilLido)) {
                $perfil = $perfilLido;
            }
        }
        responder(200, ['books' => $livros, 'profile' => $perfil]);
    }

    if ($metodo !== 'POST') {
        header('Allow: GET, POST');
        responder(405, ['error' => 'Método não permitido.']);
    }

    $dados = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($dados)) {
        responder(400, ['error' => 'Requisição JSON inválida.']);
    }

    if (($dados['action'] ?? '') === 'save-profile') {
        $perfilRecebido = $dados['profile'] ?? null;
        if (!is_array($perfilRecebido)) {
            responder(400, ['error' => 'Os dados do perfil são inválidos.']);
        }
        $foto = $perfilRecebido['photo'] ?? '';
        $fundo = $perfilRecebido['background'] ?? '';
        $fundoInicial = $perfilRecebido['homeBackground'] ?? '';
        $fundoAcervo = $perfilRecebido['catalogBackground'] ?? '';
        $mensagemApresentacao = $perfilRecebido['introMessage'] ?? '';
        $tema = $perfilRecebido['theme'] ?? 'vitoriano';
        $instagram = $perfilRecebido['instagram'] ?? '';
        $tiktok = $perfilRecebido['tiktok'] ?? '';
        foreach ([
            'foto' => $foto,
            'fundo' => $fundo,
            'fundo da página inicial' => $fundoInicial,
            'fundo do acervo' => $fundoAcervo,
        ] as $campo => $imagem) {
            if (!is_string($imagem) || strlen($imagem) > 2500000 || ($imagem !== '' && !preg_match('#^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$#', $imagem))) {
                responder(400, ['error' => 'A imagem de ' . $campo . ' é inválida ou muito grande.']);
            }
        }
        $temasPermitidos = ['vitoriano', 'gold', 'gotico', 'sombrio', 'rock', 'jardim-secreto', 'oceano'];
        if (!is_string($mensagemApresentacao) || strlen($mensagemApresentacao) > 10000 || !is_string($tema) || !in_array($tema, $temasPermitidos, true)) {
            responder(400, ['error' => 'A mensagem ou as cores da interface são inválidas.']);
        }
        if (!is_string($instagram) || strlen($instagram) > 100 || !is_string($tiktok) || strlen($tiktok) > 100) {
            responder(400, ['error' => 'Os perfis sociais precisam ter até 100 caracteres.']);
        }
        $perfil = [
            'photo' => $foto,
            'background' => $fundo,
            'homeBackground' => $fundoInicial,
            'catalogBackground' => $fundoAcervo,
            'introMessage' => $mensagemApresentacao,
            'theme' => $tema,
            'instagram' => trim($instagram),
            'tiktok' => trim($tiktok),
        ];
        $perfilSalvo = json_encode($perfil, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (file_put_contents($diretorio . '/perfil.json', $perfilSalvo, LOCK_EX) === false) {
            throw new RuntimeException('Não foi possível gravar o perfil.');
        }
        responder(200, ['profile' => $perfil]);
    } elseif (($dados['action'] ?? '') === 'migrate-bookmarks') {
        $coresLegadas = [
            'black' => 'reading',
            'green' => '',
            'yellow' => 'favorite',
            'brown' => 'reviewed',
            'blue' => 'read',
        ];
        foreach ($livros as &$livro) {
            if ((int) ($livro['bookmarkSchemaVersion'] ?? 0) >= 2) {
                continue;
            }
            $corAntiga = $livro['bookmarkColor'] ?? '';
            $livro['bookmarkColor'] = $coresLegadas[$corAntiga] ?? '';
            $livro['bookmarkSchemaVersion'] = 2;
        }
        unset($livro);
    } elseif (($dados['action'] ?? '') === 'save') {
        $livro = $dados['book'] ?? null;
        if (!is_array($livro) || !is_string($livro['title'] ?? null) || trim($livro['title']) === '') {
            responder(400, ['error' => 'O livro precisa de um título.']);
        }

        $id = $dados['id'] ?? '';
        $livro['id'] = is_string($id) && $id !== '' ? $id : bin2hex(random_bytes(8));
        $atualizado = false;
        foreach ($livros as $indice => $existente) {
            if (($existente['id'] ?? '') === $livro['id']) {
                $livros[$indice] = $livro;
                $atualizado = true;
                break;
            }
        }
        if (!$atualizado) {
            $livros[] = $livro;
        }
    } elseif (($dados['action'] ?? '') === 'delete') {
        $id = $dados['id'] ?? '';
        if (!is_string($id) || $id === '') {
            responder(400, ['error' => 'O identificador do livro é inválido.']);
        }
        $livros = array_values(array_filter($livros, static fn (array $livro): bool => ($livro['id'] ?? '') !== $id));
    } elseif (($dados['action'] ?? '') === 'import') {
        if (!is_array($dados['books'] ?? null)) {
            responder(400, ['error' => 'A lista de livros é inválida.']);
        }
        $chaves = [];
        foreach ($livros as $existente) {
            $chave = !empty($existente['isbn'])
                ? 'isbn:' . $existente['isbn']
                : 'livro:' . mb_strtolower(trim($existente['title'] ?? ''), 'UTF-8') . '|' . mb_strtolower(trim($existente['author'] ?? ''), 'UTF-8');
            $chaves[$chave] = true;
        }
        $ids = array_fill_keys(array_column($livros, 'id'), true);
        foreach ($dados['books'] as $livro) {
            if (!is_array($livro) || !is_string($livro['title'] ?? null) || trim($livro['title']) === '') {
                continue;
            }
            $chave = !empty($livro['isbn'])
                ? 'isbn:' . $livro['isbn']
                : 'livro:' . mb_strtolower(trim($livro['title']), 'UTF-8') . '|' . mb_strtolower(trim($livro['author'] ?? ''), 'UTF-8');
            if (!isset($ids[$livro['id'] ?? '']) && !isset($chaves[$chave])) {
                $livro['id'] = $livro['id'] ?? bin2hex(random_bytes(8));
                $livros[] = $livro;
                $chaves[$chave] = true;
                $ids[$livro['id']] = true;
            }
        }
    } else {
        responder(400, ['error' => 'Ação de acervo desconhecida.']);
    }

    rewind($arquivo);
    if (!ftruncate($arquivo, 0) || fwrite($arquivo, json_encode($livros, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR)) === false || !fflush($arquivo)) {
        throw new RuntimeException('Não foi possível gravar o acervo.');
    }
    responder(200, ['books' => $livros]);
} catch (Throwable $erro) {
    error_log($erro->getMessage());
    responder(500, ['error' => 'Falha ao acessar o acervo. Confira as permissões de escrita da hospedagem.']);
} finally {
    if (isset($arquivo) && is_resource($arquivo)) {
        flock($arquivo, LOCK_UN);
        fclose($arquivo);
    }
}