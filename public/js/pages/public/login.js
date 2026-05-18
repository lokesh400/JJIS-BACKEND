/**
 * pages/login.js — Login page logic
 */
document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, redirect
  const user = (() => { try { return JSON.parse(sessionStorage.getItem('user') || 'null'); } catch { return null; } })();
  if (user) {
    window.location.href = user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard';
    return;
  }

  const form      = document.getElementById('login-form');
  const submitBtn = document.getElementById('submit-btn');
  const forgotModal = document.getElementById('forgot-modal');
  const forgotOpenBtn = document.getElementById('forgot-open-btn');
  const forgotCloseBtn = document.getElementById('forgot-close-btn');
  const fpStep1 = document.getElementById('fp-step1');
  const fpStep2 = document.getElementById('fp-step2');
  const fpStep3 = document.getElementById('fp-step3');
  const fpIdentifier = document.getElementById('fp-identifier');
  const fpNewPassword = document.getElementById('fp-new-password');
  const fpSendOtpBtn = document.getElementById('fp-send-otp-btn');
  const fpSetPasswordBtn = document.getElementById('fp-set-password-btn');
  let resetToken = '';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Signing in…';

    try {
      const data = await API.post('/auth/login', { email, password });
      sessionStorage.setItem('user', JSON.stringify(data.user));
      toast.success('Login successful!');
      window.location.href = data.user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard';
    } catch (err) {
      toast.error(err.message || 'Login failed');
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Sign In';
    }
  });

  function resetForgotUi() {
    resetToken = '';
    fpStep1.classList.remove('hidden');
    fpStep2.classList.add('hidden');
    fpStep3.classList.add('hidden');
    fpNewPassword.value = '';
  }

  forgotOpenBtn?.addEventListener('click', () => {
    resetForgotUi();
    forgotModal.classList.remove('hidden');
  });

  forgotCloseBtn?.addEventListener('click', () => {
    forgotModal.classList.add('hidden');
  });

  fpSendOtpBtn?.addEventListener('click', async () => {
    const identifier = fpIdentifier.value.trim();
    if (!identifier) return toast.error('Please enter email or username');
    try {
      await API.post('/auth/password-reset', { step: 'request_link', identifier });
      toast.success('Reset link sent if account exists');
      fpStep1.classList.add('hidden');
      fpStep2.classList.remove('hidden');
    } catch (err) {
      toast.error(err.message || 'Failed to send reset link');
    }
  });

  fpSetPasswordBtn?.addEventListener('click', async () => {
    const newPassword = fpNewPassword.value;
    if (!resetToken) return toast.error('Please verify OTP first');
    if (!newPassword || newPassword.length < 8) return toast.error('Password must be at least 8 characters');
    try {
      await API.post('/auth/password-reset', { step: 'set_new_password', resetToken, newPassword });
      toast.success('Password reset successful. Please login.');
      forgotModal.classList.add('hidden');
      resetForgotUi();
    } catch (err) {
      toast.error(err.message || 'Failed to reset password');
    }
  });

  const qsToken = new URLSearchParams(window.location.search).get('resetToken');
  if (qsToken) {
    resetToken = qsToken;
    forgotModal.classList.remove('hidden');
    fpStep1.classList.add('hidden');
    fpStep2.classList.add('hidden');
    fpStep3.classList.remove('hidden');
  }
});
