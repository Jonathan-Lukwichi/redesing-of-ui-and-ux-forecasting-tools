/* Who is signed in, and what this deployment's posture is.
 *
 * The app previously "gated" its admin area by comparing a string constant
 * that shipped inside the public JavaScript bundle. Anything the browser can
 * check, a user can bypass — so the real gate is server-side now, and this
 * context exists only to render the right surfaces. Hiding a button here is a
 * courtesy to the user, never a security control: every protected route
 * enforces its own role on the server, and will still refuse a forged request
 * even if the UI is rewritten in the console.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const SessionContext = createContext(null);

const ROLE_RANK = { viewer: 0, planner: 1, admin: 2 };

export function SessionProvider({ children }) {
  const [state, setState] = useState({
    status: 'loading', user: null, mode: 'protected', configured: false,
  });

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setState({
        status: 'ready',
        user: me.user,
        mode: me.auth_mode,
        configured: me.auth_configured,
      });
    } catch {
      // The backend is unreachable. Treat it as signed-out rather than
      // guessing — an optimistic guess would show controls that then fail.
      setState({ status: 'offline', user: null, mode: 'protected', configured: false });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = useCallback(async (username, password) => {
    const res = await api.auth.login(username, password);
    await refresh();
    return res.user;
  }, [refresh]);

  const signOut = useCallback(async () => {
    try { await api.auth.logout(); } finally { await refresh(); }
  }, [refresh]);

  const value = useMemo(() => ({
    ...state,
    signIn,
    signOut,
    refresh,
    // In `open` mode the server treats every caller as an admin, so the UI
    // must not hide things the server will happily serve.
    can: (role) => state.mode === 'open'
      || (ROLE_RANK[state.user?.role] ?? -1) >= (ROLE_RANK[role] ?? 99),
  }), [state, signIn, signOut, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider');
  return ctx;
}
