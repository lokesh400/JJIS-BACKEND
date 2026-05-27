/**
 * pages/admin/dpp-list.js — DPP Workspace operations with real-time frontend search.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuthAny(['admin', 'teacher', 'coordinator']);
  if (!user) return;

  const basePath = '/admin/tests'; // Edits are handled inside the standard test creator
  let allDpps = [];

  // Helper for normalising time value to match standard test formats
  function normalizeTimeValue(timeString) {
    if (!timeString) return '';
    return timeString.trim();
  }

  function buildScheduledAtIso(dateVal, timeVal) {
    if (!dateVal) return null;
    try {
      const combined = `${dateVal}T${timeVal || '00:00'}:00`;
      return new Date(combined).toISOString();
    } catch {
      return null;
    }
  }

  async function fetchDpps() {
    try {
      const data = await API.get('/tests/admin/dpps');
      allDpps = data || [];
      renderDpps(allDpps);
    } catch (err) {
      toast.error('Failed to load DPPs');
    } finally {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('dpps-grid').classList.remove('hidden');
    }
  }

  function renderDpps(dpps) {
    const el = document.getElementById('dpps-grid');
    if (!dpps.length) {
      el.innerHTML = '<div class="col-span-full bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">No Daily Practice Problems (DPPs) found.</div>';
      return;
    }

    el.innerHTML = dpps.map(d => {
      const schedLabel = d.scheduledAt
        ? `📅 ${new Date(d.scheduledAt).toLocaleString()}`
        : '📅 No schedule';
      const questionCount = d.sections ? d.sections.reduce((acc, s) => acc + (s.questions?.length || 0), 0) : 0;
      const editHref = `${basePath}/${d._id}`;

      return `
      <div class="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 p-5 md:p-6">
        <div class="flex flex-col gap-4">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div class="min-w-0">
              <h3 class="font-bold text-lg text-teal-900 truncate">${d.name}</h3>
              ${d.description ? `<p class="text-sm text-gray-500 mt-1 line-clamp-2">${d.description}</p>` : '<p class="text-sm text-gray-400 mt-1">No description added</p>'}
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2 py-0.5 text-xs rounded-full font-medium ${d.isPublished ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
                ${d.isPublished ? 'Published' : 'Draft'}
              </span>
              <span class="px-2 py-0.5 text-xs rounded-full font-medium bg-teal-100 text-teal-700">📝 DPP</span>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-sm text-gray-700"><span class="text-gray-400">Duration:</span> <span class="font-semibold">${d.duration} min</span></div>
            <div class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-sm text-gray-700"><span class="text-gray-400">Questions:</span> <span class="font-semibold">${questionCount}</span></div>
            <div class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-sm text-gray-700"><span class="text-gray-400">Schedule:</span> <span class="font-semibold">${d.scheduledAt ? new Date(d.scheduledAt).toLocaleDateString() : 'Not set'}</span></div>
          </div>
          <div class="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
            <div class="flex items-center gap-1.5">
              <button onclick="togglePublish('${d._id}', ${d.isPublished})"
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold border ${d.isPublished ? 'border-yellow-200 text-yellow-700 hover:bg-yellow-50' : 'border-green-200 text-green-700 hover:bg-green-50'} transition">
                ${d.isPublished ? 'Unpublish' : 'Publish'}
              </button>
              <button onclick="deleteDpp('${d._id}')"
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition">
                Delete
              </button>
            </div>
            <div class="flex items-center gap-2">
              <a href="${basePath}/${d._id}/download-pdf" target="_blank"
                 class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition flex items-center gap-1">
                📥 Print PDF
              </a>
              <a href="${editHref}"
                 class="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition flex items-center gap-1 shadow-sm">
                🔧 Edit Questions
              </a>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ── Frontend Search Filter ───────────────────────────────────────────
  const searchInput = document.getElementById('search-dpp');
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderDpps(allDpps);
      return;
    }
    const filtered = allDpps.filter(d => {
      const name = (d.name || '').toLowerCase();
      const desc = (d.description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
    renderDpps(filtered);
  });

  window.toggleCreate = function() {
    const wrap = document.getElementById('create-form-wrap');
    wrap.classList.toggle('hidden');
  };

  window.togglePublish = async function(id, current) {
    try {
      await API.put(`/tests/${id}`, { isPublished: !current });
      toast.success(current ? 'DPP unpublished' : 'DPP published!');
      fetchDpps();
    } catch { 
      toast.error('Failed to update publication status'); 
    }
  };

  window.deleteDpp = async function(id) {
    if (!confirm('Delete this DPP? All student submissions will also be deleted.')) return;
    try {
      await API.delete(`/tests/${id}`);
      toast.success('DPP deleted successfully');
      fetchDpps();
    } catch { 
      toast.error('Failed to delete DPP'); 
    }
  };

  document.getElementById('create-dpp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const scheduledDate = document.getElementById('dpp-scheduled-date').value;
      const scheduledTimeRaw = document.getElementById('dpp-scheduled-time').value;
      const scheduledTime = normalizeTimeValue(scheduledTimeRaw);

      if ((scheduledDate && !scheduledTime) || (!scheduledDate && scheduledTime)) {
        toast.error('Please select both scheduled date and time, or leave both blank.');
        return;
      }

      const scheduledAt = buildScheduledAtIso(scheduledDate, scheduledTime);
      const test = await API.post('/tests', {
        name:        document.getElementById('dpp-name').value.trim(),
        duration:    parseInt(document.getElementById('dpp-duration').value),
        description: document.getElementById('dpp-desc').value.trim(),
        mode:        'practice', // DPPs are always practice mode
        scheduledAt,
        syllabus:    '',
        testType:    'dpp',
        subject:     document.getElementById('sel-subject').value || null,
        chapter:     document.getElementById('sel-chapter').value || null,
        topic:       document.getElementById('sel-topic').value || null,
      });
      toast.success('DPP created successfully!');
      window.location.href = `${basePath}/${test._id}`;
    } catch (err) { 
      toast.error(err.message || 'Failed to create DPP'); 
    }
  });

  // ── Populate dynamic hierarchy dropdowns ───────────────────────────
  async function loadSubjects() {
    try {
      const subjects = await API.get('/subjects');
      const sel = document.getElementById('sel-subject');
      sel.innerHTML = '<option value="">Select Subject</option>' +
        subjects.map(s => `<option value="${s._id}">${s.name}</option>`).join('');

      const teacherSubjectId = (user.role === 'teacher' && Array.isArray(user.subjects) && user.subjects.length > 0)
        ? (typeof user.subjects[0] === 'object' ? user.subjects[0]._id : user.subjects[0])
        : null;

      if (teacherSubjectId) {
        sel.value = String(teacherSubjectId);
        if (user.role === 'teacher') {
          sel.disabled = true;
        }
        await loadChapters(teacherSubjectId);
      }
    } catch { 
      toast.error('Failed to load subjects'); 
    }
  }

  async function loadChapters(subjectId) {
    const sel = document.getElementById('sel-chapter');
    sel.innerHTML = '<option value="">Select Chapter</option>';
    document.getElementById('sel-topic').innerHTML = '<option value="">Select Topic</option>';
    if (!subjectId) return;
    try {
      const chapters = await API.get(`/chapters/subject/${subjectId}`);
      sel.innerHTML = '<option value="">Select Chapter</option>' +
        chapters.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    } catch { 
      toast.error('Failed to load chapters'); 
    }
  }

  async function loadTopics(chapterId) {
    const sel = document.getElementById('sel-topic');
    sel.innerHTML = '<option value="">Select Topic</option>';
    if (!chapterId) return;
    try {
      const topics = await API.get(`/topics/chapter/${chapterId}`);
      sel.innerHTML = '<option value="">Select Topic</option>' +
        topics.map(t => `<option value="${t._id}">${t.name}</option>`).join('');
    } catch { 
      toast.error('Failed to load topics'); 
    }
  }

  document.getElementById('sel-subject').addEventListener('change', e => loadChapters(e.target.value));
  document.getElementById('sel-chapter').addEventListener('change', e => loadTopics(e.target.value));

  await loadSubjects();
  await fetchDpps();
});
