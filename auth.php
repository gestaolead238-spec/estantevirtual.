<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responderAuth(int $status, array $body): never
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

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    responderAuth(200, [
        'authenticated' => ($_SESSION['admin_authenticated'] ?? false) === true,
        'email' => $_SESSION['admin_email'] ?? null,
    ]);
}

if ($method !== 'POST') {
    header('Allow: GET, POST');
    responderAuth(405, ['error' => 'Método não permitido.']);
}

$payload = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($payload)) {
    responderAuth(400, ['error' => 'Requisição inválida.']);
}

$action = $payload['action'] ?? '';
if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $cookie = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $cookie['path'],
            'domain' => $cookie['domain'],
            'secure' => $cookie['secure'],
            'httponly' => $cookie['httponly'],
            'samesite' => 'Strict',
        ]);
    }
    session_destroy();
    responderAuth(200, ['authenticated' => false]);
}

if ($action !== 'login') {
    responderAuth(400, ['error' => 'Ação de autenticação inválida.']);
}

$adminEmail = strtolower(trim((string) (getenv('ESTANTE_ADMIN_EMAIL') ?: 'sara.pessopani@gmail.com')));
$adminPassword = (string) (getenv('ESTANTE_ADMIN_PASSWORD') ?: '');
if ($adminEmail === '' || $adminPassword === '') {
    responderAuth(503, ['error' => 'O acesso administrativo ainda não foi configurado no servidor.']);
}

if (($_SESSION['login_blocked_until'] ?? 0) > time()) {
    responderAuth(429, ['error' => 'Muitas tentativas. Aguarde alguns minutos e tente novamente.']);
}

$email = strtolower(trim((string) ($payload['email'] ?? '')));
$password = (string) ($payload['password'] ?? '');
if (!hash_equals($adminEmail, $email) || !hash_equals($adminPassword, $password)) {
    $_SESSION['login_attempts'] = (int) ($_SESSION['login_attempts'] ?? 0) + 1;
    if ($_SESSION['login_attempts'] >= 8) {
        $_SESSION['login_blocked_until'] = time() + 300;
        $_SESSION['login_attempts'] = 0;
    }
    responderAuth(401, ['error' => 'E-mail ou senha incorretos.']);
}

session_regenerate_id(true);
$_SESSION = [
    'admin_authenticated' => true,
    'admin_email' => $adminEmail,
];
responderAuth(200, ['authenticated' => true]);
