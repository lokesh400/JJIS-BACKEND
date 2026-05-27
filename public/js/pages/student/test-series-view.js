/**
 * pages/test-series-view.js
 */
document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth('student');
  if (!user) return;

  const seriesId = window.location.pathname.split('/')[3]; // /student/test-series/:id
  let series    = null;
  let purchased = false;

  async function loadRazorpay() {
    return new Promise(resolve => {
      if (document.getElementById('razorpay-script')) return resolve(true);
      const s = document.createElement('script');
      s.id      = 'razorpay-script';
      s.src     = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload  = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  async function fetchData() {
    try {
      const [s, pRes] = await Promise.all([
        API.get(`/test-series/published/${seriesId}`),
        API.get(`/purchase/check?itemType=TestSeries&itemId=${seriesId}`),
      ]);
      series    = s;
      purchased = !!pRes.purchased;
      render();
    } catch {
      toast.error('Failed to load test series');
      window.location.href = '/student/purchase-series';
    } finally {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('main-content').classList.remove('hidden');
    }
  }

  function render() {
    const price = series.price || 0;

    document.getElementById('series-name').textContent = series.name;
    const desc = document.getElementById('series-desc');
    if (series.description) { desc.textContent = series.description; desc.classList.remove('hidden'); }

    // Purchase actions
    const actions = document.getElementById('purchase-actions');
    if (purchased && price > 0) {
      actions.innerHTML = `<span class="px-6 py-2 bg-green-500 text-white rounded-lg font-semibold inline-block">Purchased</span>`;
    } else if (!purchased && price > 0) {
      actions.innerHTML = `
        <button onclick="handlePurchase()"
                class="mt-1 px-6 py-2 bg-transparent border border-garud-highlight text-garud-highlight rounded-lg font-semibold hover:bg-gray-100 transition">
          Purchase Series ₹${price}
        </button>`;
    } else if (!purchased && price === 0) {
      actions.innerHTML = `
        <button onclick="handleFreeAccess()"
                class="mt-1 px-6 py-2 bg-garud-accent text-white rounded-lg font-semibold hover:opacity-90 transition">
          Claim Free Access
        </button>`;
    }

    // Progress
    const total    = series.tests.length;
    const submitted = series.tests.filter(t => t.isSubmitted).length;
    const pct       = total > 0 ? Math.round((submitted / total) * 100) : 0;
    document.getElementById('progress-text').textContent = `${submitted} / ${total} completed`;
    document.getElementById('progress-bar').style.width  = `${pct}%`;

    // Tests
    const listEl = document.getElementById('tests-list');
    listEl.innerHTML = series.tests.map((t, i) => {
      const canAttempt  = purchased || price === 0;
      const isSubmitted = t.isSubmitted;
      const isPractice  = t.mode === 'practice';
      const isJee       = t.testType === 'jee-advanced';
      const isDpp       = t.testType === 'dpp';
      const attemptBase = isJee ? 'jee-test' : 'test';
      const now         = new Date();
      const isLocked    = t.scheduledAt && new Date(t.scheduledAt) > now;
      const modeLabel   = isPractice ? '🔁 Practice' : '🎯 Real';
      const modeColor   = isPractice ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
      const schedText   = t.scheduledAt
        ? `📅 ${new Date(t.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
        : '';

      let actionBtn;
      if (isLocked) {
        const timeStr = new Date(t.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
        actionBtn = `<span class="text-sm text-amber-600 font-medium">🔒 Opens at ${timeStr}</span>`;
      } else if (isSubmitted && !isPractice) {
        // Real mode already submitted
        actionBtn = `<button onclick="window.location.href='/student/results/${t._id}'"
                        class="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition">
                  ✅ View Results
                </button>`;
      } else if (isSubmitted && isPractice) {
        // Practice mode: can retry AND view last result
        actionBtn = `<div class="flex gap-2">
          <button onclick="window.location.href='/student/results/${t._id}'"
                  class="px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition">
            Last Result
          </button>
          ${canAttempt
            ? `<button onclick="window.location.href='/student/${attemptBase}/${seriesId}/${t._id}'"
                      class="px-3 py-2 bg-garud-highlight text-white rounded-lg text-sm font-medium hover:opacity-90 transition">
                🔁 Retry
              </button>`
            : ''}
        </div>`;
      } else if (canAttempt) {
        actionBtn = `<button onclick="window.location.href='/student/${attemptBase}/${seriesId}/${t._id}'"
                          class="px-4 py-2 bg-garud-highlight text-white rounded-lg text-sm font-medium hover:opacity-90 transition">
                    ▶ Start
                  </button>`;
      } else {
        actionBtn = `<span class="text-sm text-gray-400">🔒 Locked</span>`;
      }

      const syllabusHTML = t.syllabus
        ? `<details class="mt-2 ml-14"><summary class="text-xs text-garud-accent cursor-pointer font-medium select-none">📋 View Syllabus</summary><ul class="mt-1.5 space-y-0.5 pl-1">${t.syllabus.split('\n').filter(l => l.trim()).map(l => `<li class="text-xs text-gray-600">• ${l.trim()}</li>`).join('')}</ul></details>`
        : '';

      return `
        <div class="bg-white rounded-xl shadow-sm p-4">
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-4 flex-1 min-w-0">
              <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0
                          ${isSubmitted && !isPractice ? 'bg-green-500' : isLocked ? 'bg-amber-400' : 'bg-garud-highlight'}">
                ${i + 1}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="font-semibold text-gray-800">${t.name}</p>
                  <span class="px-1.5 py-0.5 text-xs rounded-full font-medium ${modeColor}">${modeLabel}</span>
                  ${isJee ? '<span class="px-1.5 py-0.5 text-xs rounded-full font-medium bg-orange-100 text-orange-700">⚡ JEE Advanced</span>' : ''}
                  ${isDpp ? '<span class="px-1.5 py-0.5 text-xs rounded-full font-medium bg-emerald-100 text-emerald-700">📝 DPP</span>' : ''}
                </div>
                <div class="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-400">
                  <span>⏱ ${t.duration} min</span>
                  <span>📝 ${t.totalQuestions || 0} questions</span>
                  <span>📂 ${t.sectionCount || 0} sections</span>
                  ${schedText ? `<span>${schedText}</span>` : ''}
                </div>
                ${t.description ? `<p class="text-xs text-gray-400 mt-0.5 truncate">${t.description}</p>` : ''}
              </div>
            </div>
            <div class="flex-shrink-0">${actionBtn}</div>
          </div>
          ${syllabusHTML}
        </div>`;
    }).join('') || '<p class="text-gray-400 text-sm">No tests in this series.</p>';
  }

  window.handlePurchase = async function() {
    const ok = await loadRazorpay();
    if (!ok) return toast.error('Failed to load payment gateway');
    try {
      const data = await API.post('/payments/create-order', { seriesId });
      const options = {
        key:      data.razorpayKeyId || '',
        amount:   data.amount,
        currency: data.currency || 'INR',
        name:     series.name,
        description: series.description,
        order_id: data.orderId,
        handler: async (resp) => {
          await API.post('/payments/verify', {
            seriesId,
            paymentId: resp.razorpay_payment_id,
            orderId: resp.razorpay_order_id,
            signature: resp.razorpay_signature,
          });
          toast.success('Payment successful! Access granted.');
          const pRes = await API.get(`/purchase/check?itemType=TestSeries&itemId=${seriesId}`);
          purchased = !!pRes.purchased;
          render();
        },
        prefill: { name: user.name, email: user.email },
        theme: { color: '#e94560' },
      };
      new window.Razorpay(options).open();
    } catch (err) { toast.error(err.message || 'Payment failed'); }
  };

  window.handleFreeAccess = async function() {
    try {
      await API.post('/payments/free-access', { seriesId });
      toast.success('Access granted!');
      const pRes = await API.get(`/purchase/check?itemType=TestSeries&itemId=${seriesId}`);
      purchased = !!pRes.purchased;
      render();
    } catch (err) { toast.error(err.message || 'Failed to claim free access'); }
  };

  await fetchData();
});
