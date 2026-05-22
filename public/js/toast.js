/**
 * toast.js — lightweight premium toast notification system
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  // Add base modern-toast and type classes
  el.className = `modern-toast toast-${type}`;

  // Get dynamic SVG icon based on type
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `
      <div class="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
        <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    `;
  } else if (type === 'error') {
    iconSvg = `
      <div class="flex-shrink-0 w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
        <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    `;
  } else {
    iconSvg = `
      <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
        <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
    `;
  }

  el.innerHTML = `
    ${iconSvg}
    <div style="flex: 1; font-family: sans-serif; font-size: 14px; font-weight: 600; color: rgba(255, 255, 255, 0.95); line-height: 1.4;">${message}</div>
    <button style="background: none; border: none; cursor: pointer; color: rgba(255, 255, 255, 0.3); transition: color 0.15s; margin-left: 4px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 4px;">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
    </button>
  `;

  // Append to container
  container.appendChild(el);

  // Trigger entering transition in next tick
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.classList.add('show');
    }, 10);
  });

  // Auto remove after duration
  const removeTimeout = setTimeout(() => {
    dismissToast();
  }, 3500);

  function dismissToast() {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }

  // Allow manual dismiss
  el.querySelector('button').addEventListener('click', (e) => {
    e.preventDefault();
    clearTimeout(removeTimeout);
    dismissToast();
  });
}

const toast = {
  success: (msg) => showToast(msg, 'success'),
  error:   (msg) => showToast(msg, 'error'),
  info:    (msg) => showToast(msg, 'info'),
};
