/**
 * sidebar.js — builds the sidebar navigation and wires up mobile menu.
 * Depends on: auth-guard.js (getUser)
 */

const ADMIN_LINKS = [
  { href: '/admin/dashboard',    label: 'Dashboard',     icon: iconHome() },
  { href: '/teacher/question-bank', label: 'Edit Question', icon: iconDB() },
  { href: '/admin/question-bank',label: 'Question Bank', icon: iconDB() },
  { href: '/admin/upload',       label: 'Upload',        icon: iconUpload() },
  { href: '/admin/tests',        label: 'Tests',         icon: iconFile() },
  { href: '/admin/dpp',          label: 'DPPs',          icon: iconLayers() },
  { href: '/admin/test-series',  label: 'Test Series',   icon: iconLayers() },
  { href: '/admin/courses/create/new', label: 'Create Course', icon: iconBook() },
  { href: '/admin/battleground', label: 'Battleground', icon: iconFlag() },
  { href: '/admin/reports',      label: 'Reports',       icon: iconFlag() },
  { href: '/admin/manage-team',  label: 'Manage Team',   icon: iconUsers() },
  { href: '/admin/manage-students', label: 'Manage Students', icon: iconAcademic() },
];

const STUDENT_LINKS = [
  { href: '/student/dashboard',      label: 'Dashboard',       icon: iconHome() },
  { href: '/student/purchase-series',label: 'Purchase Series', icon: iconLayers() },
  { href: '/student/purchase-courses',label: 'Purchase Courses', icon: iconBook() },
  { href: '/student/study',          label: 'Study',           icon: iconBook() },
  { href: '/student/battleground',   label: 'Battleground',    icon: iconFlag() },
  { href: '/student/battleground-prizes', label: 'Battleground Prizes', icon: iconTrophy() },
  { href: '/student/purchases',      label: 'My Purchases',    icon: iconFile() },
  // { href: '/student/tests',          label: 'My Tests',        icon: iconBook() },
];

const TEACHER_LINKS = [
  { href: '/teacher/question-bank', label: 'Edit Question', icon: iconDB() },
  { href: '/teacher/tests', label: 'Tests', icon: iconFile() },
];

const COORDINATOR_LINKS = [
  { href: '/admin/dpp',          label: 'DPPs',          icon: iconFile() },
  { href: '/admin/upload', label: 'Upload Questions', icon: iconUpload() },
];

function buildSidebar() {
  const user = getUser();
  if (!user) return;

  const nav    = document.getElementById('sidebar-nav');
  const avatar = document.getElementById('user-avatar');
  const name   = document.getElementById('user-name');
  const role   = document.getElementById('user-role');

  if (!nav) return;

  if (avatar) avatar.textContent = user.name.charAt(0).toUpperCase();
  if (name)   name.textContent   = user.name;
  if (role)   role.textContent   = user.role;

  // Populate top navbar
  const navUser   = document.getElementById('navbar-user');
  const navName   = document.getElementById('navbar-username');
  const navRole   = document.getElementById('navbar-role');
  const navAvatar = document.getElementById('navbar-avatar');
  if (navUser)   { navUser.classList.remove('hidden'); navUser.classList.add('flex'); }
  if (navName)   navName.textContent   = user.name;
  if (navRole)   navRole.textContent   = user.role;
  if (navAvatar) navAvatar.textContent = user.name.charAt(0).toUpperCase();

  const links = user.role === 'admin'
    ? ADMIN_LINKS
    : user.role === 'teacher'
      ? TEACHER_LINKS
      : user.role === 'coordinator'
        ? COORDINATOR_LINKS
      : STUDENT_LINKS;
  const curr  = window.location.pathname;

  nav.innerHTML = links.map(link => {
    const isActive = curr === link.href || curr.startsWith(link.href + '/');
    return `
      <a href="${link.href}"
         onclick="closeSidebar()"
         class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                ${isActive
                  ? 'bg-garud-highlight text-white shadow-lg shadow-garud-highlight/20'
                  : 'text-white/55 hover:bg-white/10 hover:text-white'}">
        ${link.icon}
        <span>${link.label}</span>
      </a>`;
  }).join('');
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('-translate-x-full');
  if (overlay) overlay.classList.remove('hidden');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.add('-translate-x-full');
  if (overlay) overlay.classList.add('hidden');
}

// ── SVG Icon helpers ──────────────────────────────────────────────────
function iconHome()   { return svgWrap('M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H15v-5.25a.75.75 0 00-.75-.75h-4.5a.75.75 0 00-.75.75V21.75H3.75A.75.75 0 013 21V9.75z'); }
function iconDB()     { return svgWrap('M4 7c0-1.1 3.6-2 8-2s8 .9 8 2v2c0 1.1-3.6 2-8 2s-8-.9-8-2V7zm0 5v5c0 1.1 3.6 2 8 2s8-.9 8-2v-5c-1.8 1-4.6 1.5-8 1.5S5.8 13 4 12z'); }
function iconUpload() { return svgWrap('M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12'); }
function iconFile()   { return svgWrap('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'); }
function iconLayers() { return svgWrap('M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'); }
function iconBook()   { return svgWrap('M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'); }
function iconFlag()   { return svgWrap('M3 3v18M3 6l9-3 9 3v9l-9 3-9-3V6z'); }
function iconTrophy() { return svgWrap('M8 21h8M12 17v4m-5-14V4a1 1 0 011-1h8a1 1 0 011 1v3m-10 0a3 3 0 11-6 0V6h6m10 1a3 3 0 106 0V6h-6m-8 5a4 4 0 008 0V7H9v4z'); }
function iconUsers()  { return svgWrap('M17 20h5v-2a4 4 0 00-5-3.87M17 20H7m10 0v-2c0-.653-.126-1.277-.356-1.848M7 20H2v-2a4 4 0 015-3.87M7 20v-2c0-.653.126-1.277.356-1.848m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'); }
function iconAcademic() { return svgWrap('M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.22 4 2.22V20'); }
function svgWrap(d)   {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="${d}"/>
  </svg>`;
}

// Run once DOM is ready
document.addEventListener('DOMContentLoaded', buildSidebar);
