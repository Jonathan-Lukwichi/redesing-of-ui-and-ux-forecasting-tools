/* Sign-in panel. Deliberately plain: the server decides everything, this just
 * collects two fields and reports what the server said. */
import { useState } from 'react';
import { useSession } from './SessionContext';

export default function SignIn({ title = 'Sign in', sub, onDone }) {
  const { signIn, configured, mode } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!configured && mode !== 'open') {
    return (
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="card-body">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No accounts configured</div>
          <div style={{ fontSize: 'var(--step--1)', color: 'var(--text-3)', lineHeight: 1.6 }}>
            This deployment has no user accounts, so protected features are unavailable.
            An operator sets <code>AUTH_USERS</code> (see <code>api/.env.example</code>).
            Access is closed rather than open until they do.
          </div>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await signIn(username, password);
      onDone?.();
    } catch (err) {
      setError(err.detail?.message || err.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" style={{ maxWidth: 420 }} onSubmit={submit}>
      <div className="card-body">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
        {sub && (
          <div style={{ fontSize: 'var(--step--1)', color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.6 }}>
            {sub}
          </div>
        )}
        <label htmlFor="hf-user" className="sr-only">Username</label>
        <input id="hf-user" className="input" autoComplete="username" value={username}
               onChange={(e) => setUsername(e.target.value)} placeholder="Username"
               style={{ width: '100%', marginBottom: 8 }} required />
        <label htmlFor="hf-pass" className="sr-only">Password</label>
        <input id="hf-pass" className="input" type="password" autoComplete="current-password"
               value={password} onChange={(e) => setPassword(e.target.value)}
               placeholder="Password" style={{ width: '100%' }} required />
        {error && (
          <div role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--step--1)', marginTop: 10 }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}
                style={{ marginTop: 12, width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}
