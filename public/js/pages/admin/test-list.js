/**
 * pages/test-list.js
 */
document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuthAny(['admin', 'teacher']);
  if (!user) return;
  const basePath = user.role === 'teacher' ? '/teacher/tests' : '/admin/tests';
  const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

  function normalizeTimeValue(rawValue) {
    const value = (rawValue || '').trim();
    if (!value) return '';
    return TIME_24H_REGEX.test(value) ? value : null;
  }

  function buildScheduledAtIso(dateValue, timeValue) {
    if (!dateValue || !timeValue) return null;
    // Construct local datetime then convert to ISO for consistent server storage.
    const localDateTime = new Date(`${dateValue}T${timeValue}`);
    if (Number.isNaN(localDateTime.getTime())) return null;
    return localDateTime.toISOString();
  }


  let tests = [];

  async function fetchTests() {
    try {
      tests = await API.get('/tests/admin/all');
      renderTests();
    } catch { toast.error('Failed to load tests'); }
    finally {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('tests-list').classList.remove('hidden');
    }
  }

  function renderTests() {
    const el = document.getElementById('tests-list');
    if (!tests.length) {
      el.innerHTML = '<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">No tests yet. Create one above.</div>';
      return;
    }
    el.innerHTML = tests.map(t => {
      const modeLabel  = t.mode === 'practice' ? '🔁 Practice' : '🎯 Real';
      const modeColor  = t.mode === 'practice' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
      const isJee      = t.testType === 'jee-advanced';
      const canManageAdminActions = user.role === 'admin';
      const schedLabel = t.scheduledAt
        ? `📅 ${new Date(t.scheduledAt).toLocaleString()}`
        : '📅 No schedule';
      const editHref = `${basePath}/${t._id}`;
      return `
      <div class="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 p-5 md:p-6">
        <div class="flex flex-col gap-4">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div class="min-w-0">
              <h3 class="font-bold text-lg text-gray-900 truncate">${t.name}</h3>
              ${t.description ? `<p class="text-sm text-gray-500 mt-1 line-clamp-2">${t.description}</p>` : '<p class="text-sm text-gray-400 mt-1">No description added</p>'}
            </div>
            <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 text-xs rounded-full font-medium ${t.isPublished ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
              ${t.isPublished ? 'Published' : 'Draft'}
            </span>
            <span class="px-2 py-0.5 text-xs rounded-full font-medium ${modeColor}">${modeLabel.replace('🔁 ', '').replace('🎯 ', '')}</span>
            ${isJee ? '<span class="px-2 py-0.5 text-xs rounded-full font-medium bg-orange-100 text-orange-700">⚡ JEE Advanced</span>' : ''}
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-sm text-gray-700"><span class="text-gray-400">Duration:</span> <span class="font-semibold">${t.duration} min</span></div>
            <div class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-sm text-gray-700"><span class="text-gray-400">Questions:</span> <span class="font-semibold">${t.sections.reduce((a,s)=>a+s.questions.length,0)}</span></div>
            <div class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-sm text-gray-700"><span class="text-gray-400">Schedule:</span> <span class="font-semibold">${t.scheduledAt ? new Date(t.scheduledAt).toLocaleDateString() : 'Not set'}</span></div>
          </div>
          <p class="text-xs text-gray-400">${schedLabel}</p>
        </div>
        <div class="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
          <button onclick="window.location.href='${editHref}'"
                  class="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">Edit</button>
          ${canManageAdminActions ? `
          <button onclick="window.location.href='/admin/tests/${t._id}/download-pdf'"
                  class="px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition">PDF</button>
          <button onclick="window.location.href='/admin/tests/${t._id}/answer-key'"
                  class="px-3 py-2 text-sm bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition">Answer Key</button>
          ` : ''}
          <button onclick="window.location.href='/admin/tests/${t._id}/auto-generator'"
                  class="px-3 py-2 text-sm bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition">Auto Generator</button>
          ${canManageAdminActions ? `
          <button onclick="window.location.href='/admin/tests/${t._id}/results'"
                  class="px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition">Results</button>
          <button onclick="togglePublish('${t._id}', ${t.isPublished})"
                  class="px-3 py-2 text-sm ${t.isPublished ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' : 'bg-green-50 text-green-700 hover:bg-green-100'} rounded-lg transition">
            ${t.isPublished ? 'Unpublish' : 'Publish'}
          </button>
          <button onclick="deleteTest('${t._id}')"
                  class="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition">Delete</button>
          ` : ''}
        </div>
      </div>`;
    }).join('');
  }

  window.toggleCreate = function(type = 'standard') {
    const wrap = document.getElementById('create-form-wrap');
    const badge = document.getElementById('create-type-badge');
    const typeField = document.getElementById('test-type-field');
    const isHidden = wrap.classList.contains('hidden');
    if (isHidden) {
      // Open form for the requested type
      typeField.value = type;
      if (type === 'jee-advanced') {
        badge.textContent = '⚡ JEE Advanced (MCQ + MSQ + Numerical)';
        badge.className = 'px-2 py-0.5 text-xs rounded-full font-semibold bg-orange-100 text-orange-700';
      } else {
        badge.textContent = 'Standard (MCQ + Numerical)';
        badge.className = 'px-2 py-0.5 text-xs rounded-full font-semibold bg-gray-100 text-gray-600';
      }
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }
  };

  window.togglePublish = async function(id, current) {
    try {
      await API.put(`/tests/${id}`, { isPublished: !current });
      toast.success(current ? 'Test unpublished' : 'Test published!');
      fetchTests();
    } catch { toast.error('Failed to update'); }
  };

  window.deleteTest = async function(id) {
    if (!confirm('Delete this test? All student attempts will also be deleted.')) return;
    try {
      await API.delete(`/tests/${id}`);
      toast.success('Test deleted');
      fetchTests();
    } catch { toast.error('Failed to delete'); }
  };

  document.getElementById('create-test-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const scheduledDate = document.getElementById('test-scheduled-date').value;
      const scheduledTimeRaw = document.getElementById('test-scheduled-time').value;
      const scheduledTime = normalizeTimeValue(scheduledTimeRaw);
      const testType      = document.getElementById('test-type-field').value;

      if (scheduledTime === null) {
        toast.error('Invalid time format. Use HH:MM in 24-hour format, e.g. 14:30.');
        return;
      }

      if ((scheduledDate && !scheduledTime) || (!scheduledDate && scheduledTime)) {
        toast.error('Please select both scheduled date and time, or leave both blank.');
        return;
      }

      const scheduledAt   = buildScheduledAtIso(scheduledDate, scheduledTime);
      const test = await API.post('/tests', {
        name:        document.getElementById('test-name').value.trim(),
        duration:    parseInt(document.getElementById('test-duration').value),
        description: document.getElementById('test-desc').value.trim(),
        mode:        document.getElementById('test-mode').value,
        scheduledAt,
        syllabus:    document.getElementById('test-syllabus').value.trim(),
        testType,
      });
      toast.success('Test created!');
      // JEE Advanced → open in JEE creator; standard → standard creator
      const redirect = `${basePath}/${test._id}`;
      window.location.href = redirect;
    } catch (err) { toast.error(err.message || 'Failed to create test'); }
  });

  await fetchTests();
});
