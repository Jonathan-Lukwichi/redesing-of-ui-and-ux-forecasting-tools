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

export function SessionProvider({ children }) {
  // Seeded with the read-only set so the sidebar does not flash empty on the
  // first paint. The server's answer replaces it a moment later and is
  // authoritative; this is only about avoiding a visible blink.
  const OPTIMISTIC_READ = ['forecast:read', 'data:read', 'staff:read',
                           'supply:read', 'actions:read', 'assistant'];
  const [state, setState] = useState({
    status: 'loading', user: null, scopes: OPTIMISTIC_READ,
    actionCategories: ['staff', 'supply', 'capacity'],
    mode: 'protected', configured: false,
  });

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setState({
        status: 'ready',
        user: me.user,
        // Signed in: your role's scopes. Not signed in: whatever this
        // deployment grants anonymously, straight from the server.
        scopes: me.user?.scopes || me.anonymous_scopes || [],
        actionCategories: me.user?.action_categories
          || me.anonymous_action_categories || [],
        mode: me.auth_mode,
        configured: me.auth_configured,
      });
    } catch {
      // The backend is unreachable. Treat it as signed-out rather than
      // guessing — an optimistic guess would show controls that then fail.
      // Backend unreachable. Keep the read-only shape so the shell still
      // renders and each page can show its own offline state, rather than
      // collapsing the whole navigation.
      setState({ status: 'offline', user: null, scopes: OPTIMISTIC_READ,
                 actionCategories: [], mode: 'protected', configured: false });
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
    // Roles are territory, not rank: ask for the SCOPE a surface needs, never
    // for a role name. Hiding a control here is a courtesy — the server gates
    // the same scope independently and refuses a forged request regardless.
    //
    // In `open` mode the server treats every caller as an admin, so the UI must
    // not hide things the server will happily serve.
    can: (scope) => state.mode === 'open' || (state.scopes || []).includes(scope),
    seesCategory: (category) => state.mode === 'open'
      || (state.actionCategories || []).includes(category),
  }), [state, signIn, signOut, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider');
  return ctx;
}
