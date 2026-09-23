/* A page outside your territory, explained rather than broken.
 *
 * The sidebar already hides pages you cannot use, but hash navigation means
 * anyone can type /#admin. Without this they would land on a page firing
 * requests that all come back 403, and conclude the app is broken rather than
 * that the page is not theirs. The server still refuses every one of those
 * requests — this only replaces a wall of red errors with a sentence.
 */
import { useSession } from './SessionContext';
import SignIn from './SignIn';

const WHO = {
  'staff:read':   'the staffing manager',
  'staff:plan':   'the staffing manager',
  'supply:read':  'the stock manager',
  'supply:plan':  'the stock manager',
  'data:write':   'an administrator',
  admin:          'an administrator',
};

export default function RequireScope({ scope, anyScope, title, children }) {
  const { can, user, status } = useSession();
  const needed = anyScope || [scope];
  const allowed = needed.some((s) => can(s));

  if (allowed) return children;

  if (status === 'loading') {
    return <div className="content" style={{ color: 'var(--text-3)', padding: 24 }}>Checking your access…</div>;
  }

  const ask = WHO[needed[0]] || 'an administrator';

  return (
    <div className="content">
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-body">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {title || 'Not part of your area'}
          </div>
          <div style={{ fontSize: 'var(--step--1)', color: 'var(--text-3)', lineHeight: 1.65 }}>
            {user ? (
              <>
                You are signed in as <strong>{user.username}</strong> ({user.role}), and this
                page sits outside your area. It belongs to {ask}. Nothing is wrong — the
                sections you do cover are in the sidebar, and the assistant can still
                explain anything on them.
              </>
            ) : (
              <>This page needs a signed-in account with the right area. Sign in below.</>
            )}
          </div>
        </div>
      </div>
      {!user && <div style={{ marginTop: 14 }}><SignIn title="Sign in" /></div>}
    </div>
  );
}
