<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responderIsbn(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$https = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params([
    'httponly' => true,
    'secure' => $https,
    'samesite' => 'Strict',
    'path' => '/',
]);
session_start();
if (($_SESSION['admin_authenticated'] ?? false) !== true) {
    responderIsbn(401, ['error' => 'Entre como administrador para buscar livros.']);
}
session_write_close();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    responderIsbn(405, ['error' => 'Método não permitido.']);
}

$payload = json_decode(file_get_contents('php://input') ?: '', true);
$isbn = is_array($payload) ? strtoupper((string) ($payload['isbn'] ?? '')) : '';
$isbn = preg_replace('/[^0-9X]/', '', $isbn) ?? '';
if (!preg_match('/^(?:[0-9]{9}[0-9X]|[0-9]{13})$/', $isbn)) {
    responderIsbn(400, ['error' => 'Informe um ISBN válido com 10 ou 13 dígitos.']);
}
if (!extension_loaded('curl') || !class_exists(DOMDocument::class)) {
    responderIsbn(503, ['error' => 'A busca ISBN Search requer as extensões cURL e DOM habilitadas no PHP.']);
}

$curl = curl_init('https://isbnsearch.org/isbn/' . rawurlencode($isbn));
if ($curl === false) {
    responderIsbn(502, ['error' => 'Não foi possível iniciar a consulta ISBN Search.']);
}

curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_USERAGENT => 'EstanteVirtual/1.0 (ISBN metadata lookup)',
    CURLOPT_HTTPHEADER => ['Accept: text/html'],
]);
$html = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$curlError = curl_error($curl);
curl_close($curl);

if (!is_string($html) || $status < 200 || $status >= 300) {
    error_log('ISBN Search lookup failed: HTTP ' . $status . ($curlError !== '' ? ' ' . $curlError : ''));
    responderIsbn(502, ['error' => 'ISBN Search não está disponível neste momento. Tente novamente.']);
}

$document = new DOMDocument();
$previousLibxmlState = libxml_use_internal_errors(true);
$loaded = $document->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
libxml_clear_errors();
libxml_use_internal_errors($previousLibxmlState);
if (!$loaded) {
    responderIsbn(502, ['error' => 'Não foi possível interpretar a página do ISBN Search.']);
}

$xpath = new DOMXPath($document);
$textFor = static function (string $query) use ($xpath): string {
    $node = $xpath->query($query)?->item(0);
    return $node instanceof DOMNode ? trim(preg_replace('/\s+/u', ' ', $node->textContent) ?? '') : '';
};
$title = $textFor('//div[contains(concat(" ", normalize-space(@class), " "), " bookinfo ")]//h1');
$coverNode = $xpath->query('//div[contains(concat(" ", normalize-space(@class), " "), " image ")]//img')?->item(0);
$cover = $coverNode instanceof DOMElement ? trim($coverNode->getAttribute('src')) : '';
if ($cover !== '' && str_starts_with($cover, '//')) {
    $cover = 'https:' . $cover;
}
if ($cover !== '' && !preg_match('#^https://#i', $cover)) {
    $cover = '';
}

$metadata = [];
foreach ($xpath->query('//div[contains(concat(" ", normalize-space(@class), " "), " bookinfo ")]//p') ?: [] as $paragraph) {
    if (!$paragraph instanceof DOMElement) {
        continue;
    }
    $labelNode = $xpath->query('.//strong', $paragraph)?->item(0);
    if (!$labelNode instanceof DOMNode) {
        continue;
    }
    $label = strtolower(rtrim(trim($labelNode->textContent), ':'));
    $value = trim(preg_replace('/\s+/u', ' ', str_replace($labelNode->textContent, '', $paragraph->textContent)) ?? '');
    $value = ltrim($value, ": \t\n\r\0\x0B");
    if ($value !== '') {
        $metadata[$label] = $value;
    }
}

if ($title === '') {
    responderIsbn(404, ['error' => 'ISBN não encontrado no ISBN Search.']);
}

responderIsbn(200, [
    'title' => $title,
    'authors' => [],
    'publisher' => $metadata['publisher'] ?? '',
    'categories' => [],
    'isbn' => $isbn,
    'image' => $cover,
]);
