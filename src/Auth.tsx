import { useEffect, useState } from 'react';
import { BookOpen, LoaderCircle, LockKeyhole } from 'lucide-react';
import { fetchSession, login } from './api';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchSession().then((session) => {
      if (active && session.authenticated) window.location.replace('./admin-tools.html');
    }).catch(() => {
      if (active) setMessage('Não foi possível confirmar a sessão com o servidor.');
    });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await login(email, password);
      window.location.assign('./admin-tools.html');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <a className="auth-brand" href="./index.html"><BookOpen size={25} />Estante Da Sara</a>
        <div className="auth-heading"><span><LockKeyhole size={19} /></span><p className="eyebrow">Área administrativa</p><h1>Entrar no acervo</h1><p>Acesse sua conta para gerenciar os livros.</p></div>
        <form onSubmit={(event) => void submit(event)}>
          <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {message && <p className="auth-error" role="alert">{message}</p>}
          <button type="submit" className="primary-button" disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />}{busy ? 'Verificando…' : 'Entrar'}</button>
        </form>
        <a className="auth-back" href="./index.html">Voltar à biblioteca</a>
      </section>
    </main>
  );
}
