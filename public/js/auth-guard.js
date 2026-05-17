/**
 * auth-guard.js — session-based auth guard.
 *
 * Flow:
 *  1. requireAuth() reads user from sessionStorage (fast, synchronous).
 *  2. In the background it also calls /api/auth/me to confirm the server
 *     session is still valid; if the server returns 401 the page is
 *     immediately redirected to /login and sessionStorage is cleared.
 *
 * The HttpOnly session cookie is the true source of auth — sessionStorage
 * only caches the user object for UI rendering and is inaccessible to the
 * server.  Never store sensitive secrets here.
 */

function getUser() {
  try {
    const u = sessionStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

/**
 * requireAuth(role?)
 * Call at the top of every page script.
 * Redirects to /login if not logged in; redirects to role dashboard if wrong role.
 * Returns the user object if auth passes.
 * In the background, silently verifies the session with the server.
 */
function requireAuth(role) {
  const user = getUser();
  if (!user) {
    window.location.href = '/login';
    return null;
  }
  if (role && user.role !== role) {
    window.location.href = user.role === 'admin'
      ? '/admin/dashboard'
      : user.role === 'teacher'
        ? '/teacher/question-bank'
        : '/student/dashboard';
    return null;
  }

  // Background server-side session check
  fetch('/api/auth/me', { credentials: 'include' })
    .then(res => {
      if (res.status === 401) {
        sessionStorage.removeItem('user');
        window.location.href = '/login';
      }
    })
    .catch(() => { /* network error — don't force logout */ });

  return user;
}

/**
 * handleLogout — calls server to destroy session, then clears local cache.
 */
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
    });
  } catch (_) { /* ignore network errors — still clear local state */ }
  sessionStorage.removeItem('user');
  window.location.href = '/login';
}
