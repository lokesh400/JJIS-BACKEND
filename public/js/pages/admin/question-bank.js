/**
 * pages/question-bank.js
 */
document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth('admin');
  if (!user) return;

  let subjects = [];
  let activeSubject = null;
  let activeChapter = null;

  // Cache to store counts and prevent redundant network requests on highlights/re-renders
  const countsCache = {
    subjects: {},
    chapters: {},
    topics: {}
  };

  // ── Fetch helpers ─────────────────────────────────────────────────
  async function fetchSubjects() {
    try {
      subjects = await API.get('/subjects');
      renderSubjects();
      populateSubjectSelects();

      // Fetch and show subject question counts asynchronously
      subjects.forEach(async (s) => {
        if (countsCache.subjects[s._id] !== undefined) {
          const countEl = document.getElementById(`subject-count-${s._id}`);
          if (countEl) {
            countEl.textContent = `${countsCache.subjects[s._id]} Qs`;
            countEl.classList.remove('hidden');
          }
          return;
        }
        try {
          const res = await API.get(`/questions/count?subject=${s._id}`);
          countsCache.subjects[s._id] = res.count;
          const countEl = document.getElementById(`subject-count-${s._id}`);
          if (countEl) {
            countEl.textContent = `${res.count} Qs`;
            countEl.classList.remove('hidden');
          }
        } catch {}
      });
    } catch { toast.error('Failed to load subjects'); }
  }

  async function fetchChapters(subjectId) {
    try {
      const chapters = await API.get(`/chapters/subject/${subjectId}`);
      renderChapters(chapters);
      populateChapterSelect(chapters);

      // Fetch and show chapter question counts asynchronously
      chapters.forEach(async (c) => {
        if (countsCache.chapters[c._id] !== undefined) {
          const countEl = document.getElementById(`chapter-count-${c._id}`);
          if (countEl) {
            countEl.textContent = `${countsCache.chapters[c._id]} Qs`;
            countEl.classList.remove('hidden');
          }
          return;
        }
        try {
          const res = await API.get(`/questions/count?chapter=${c._id}`);
          countsCache.chapters[c._id] = res.count;
          const countEl = document.getElementById(`chapter-count-${c._id}`);
          if (countEl) {
            countEl.textContent = `${res.count} Qs`;
            countEl.classList.remove('hidden');
          }
        } catch {}
      });
    } catch { toast.error('Failed to load chapters'); }
  }

  async function fetchTopics(chapterId) {
    try {
      const topics = await API.get(`/topics/chapter/${chapterId}`);
      renderTopics(topics);

      // Fetch and show topic question counts asynchronously
      topics.forEach(async (t) => {
        if (countsCache.topics[t._id] !== undefined) {
          const countEl = document.getElementById(`topic-count-${t._id}`);
          if (countEl) {
            countEl.textContent = `${countsCache.topics[t._id]} Qs`;
            countEl.classList.remove('hidden');
          }
          return;
        }
        try {
          const res = await API.get(`/questions/count?topic=${t._id}`);
          countsCache.topics[t._id] = res.count;
          const countEl = document.getElementById(`topic-count-${t._id}`);
          if (countEl) {
            countEl.textContent = `${res.count} Qs`;
            countEl.classList.remove('hidden');
          }
        } catch {}
      });
    } catch { toast.error('Failed to load topics'); }
  }

  // ── Render helpers ────────────────────────────────────────────────
  function renderSubjects() {
    const el = document.getElementById('subjects-list');
    if (!subjects.length) {
      el.innerHTML = '<p class="p-4 text-sm text-gray-400">No subjects yet.</p>';
      return;
    }
    el.innerHTML = subjects.map(s => {
      const cached = countsCache.subjects[s._id];
      const badgeHtml = cached !== undefined
        ? `<span id="subject-count-${s._id}" class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">${cached} Qs</span>`
        : `<span id="subject-count-${s._id}" class="hidden text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">Loading...</span>`;

      return `
        <div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer
                    ${activeSubject?._id === s._id ? 'bg-blue-50' : ''}"
             onclick="selectSubject(${JSON.stringify(s).replace(/"/g,'&quot;')})">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-700">${s.name}</span>
            ${badgeHtml}
          </div>
          <button onclick="event.stopPropagation(); deleteSubject('${s._id}')"
                  class="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">✕</button>
        </div>`;
    }).join('');
  }

  function renderChapters(chapters) {
    const el = document.getElementById('chapters-list');
    if (!chapters.length) {
      el.innerHTML = '<p class="p-4 text-sm text-gray-400">No chapters yet.</p>';
      return;
    }
    el.innerHTML = chapters.map(c => {
      const cached = countsCache.chapters[c._id];
      const badgeHtml = cached !== undefined
        ? `<span id="chapter-count-${c._id}" class="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">${cached} Qs</span>`
        : `<span id="chapter-count-${c._id}" class="hidden text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">Loading...</span>`;

      return `
        <div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer
                    ${activeChapter?._id === c._id ? 'bg-green-50' : ''}"
             onclick="selectChapter(${JSON.stringify(c).replace(/"/g,'&quot;')})">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-700">${c.name}</span>
            ${badgeHtml}
          </div>
          <button onclick="event.stopPropagation(); deleteChapter('${c._id}')"
                  class="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">✕</button>
        </div>`;
    }).join('');
  }

  function renderTopics(topics) {
    const el = document.getElementById('topics-list');
    if (!topics.length) {
      el.innerHTML = '<p class="p-4 text-sm text-gray-400">No topics yet.</p>';
      return;
    }
    el.innerHTML = topics.map(t => {
      const cached = countsCache.topics[t._id];
      const badgeHtml = cached !== undefined
        ? `<span id="topic-count-${t._id}" class="text-xs bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full font-semibold">${cached} Qs</span>`
        : `<span id="topic-count-${t._id}" class="hidden text-xs bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full font-semibold">Loading...</span>`;

      return `
        <div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-700">${t.name}</span>
            ${badgeHtml}
          </div>
          <button onclick="deleteTopic('${t._id}')"
                  class="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">✕</button>
        </div>`;
    }).join('');
  }

  function populateSubjectSelects() {
    const opts = '<option value="">Select Subject</option>' +
      subjects.map(s => `<option value="${s._id}">${s.name}</option>`).join('');
    document.getElementById('chapter-subject-select').innerHTML = opts;
  }

  function populateChapterSelect(chapters) {
    const opts = '<option value="">Select Chapter</option>' +
      chapters.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    document.getElementById('topic-chapter-select').innerHTML = opts;
  }

  // ── Global handlers (called from inline onclick) ──────────────────
  window.selectSubject = function(s) {
    activeSubject = s;
    activeChapter = null;
    document.getElementById('chapters-title').textContent = `— ${s.name}`;
    document.getElementById('topics-title').textContent = '';
    document.getElementById('topics-list').innerHTML = '<p class="p-4 text-sm text-gray-400">Select a chapter</p>';
    fetchChapters(s._id);
    renderSubjects(); // re-render to update highlight
  };

  window.selectChapter = function(c) {
    activeChapter = c;
    document.getElementById('topics-title').textContent = `— ${c.name}`;
    fetchTopics(c._id);
    // re-render chapters to update highlight
    if (activeSubject) fetchChapters(activeSubject._id);
  };

  window.deleteSubject = async function(id) {
    if (!confirm('Delete this subject? This may affect related chapters and topics.')) return;
    try {
      await API.delete(`/subjects/${id}`);
      delete countsCache.subjects[id];
      if (activeSubject?._id === id) { activeSubject = null; activeChapter = null; }
      fetchSubjects();
      toast.success('Subject deleted');
    } catch { toast.error('Failed to delete subject'); }
  };

  window.deleteChapter = async function(id) {
    if (!confirm('Delete this chapter?')) return;
    try {
      await API.delete(`/chapters/${id}`);
      delete countsCache.chapters[id];
      if (activeChapter?._id === id) { activeChapter = null; document.getElementById('topics-list').innerHTML = ''; }
      if (activeSubject) fetchChapters(activeSubject._id);
      toast.success('Chapter deleted');
    } catch { toast.error('Failed to delete chapter'); }
  };

  window.deleteTopic = async function(id) {
    if (!confirm('Delete this topic?')) return;
    try {
      await API.delete(`/topics/${id}`);
      delete countsCache.topics[id];
      if (activeChapter) fetchTopics(activeChapter._id);
      toast.success('Topic deleted');
    } catch { toast.error('Failed to delete topic'); }
  };

  // ── Form handlers ─────────────────────────────────────────────────
  document.getElementById('add-subject-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-subject').value.trim();
    if (!name) return;
    try {
      await API.post('/subjects', { name });
      document.getElementById('new-subject').value = '';
      fetchSubjects();
      toast.success('Subject added!');
    } catch (err) { toast.error(err.message || 'Failed'); }
  });

  document.getElementById('add-chapter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name    = document.getElementById('new-chapter').value.trim();
    const subject = document.getElementById('chapter-subject-select').value;
    if (!name || !subject) return toast.error('Select subject first');
    try {
      await API.post('/chapters', { name, subject });
      document.getElementById('new-chapter').value = '';
      delete countsCache.subjects[subject]; // Reset subject cache as new chapter might change state (though Q count remains 0, good practice)
      if (activeSubject?._id === subject) fetchChapters(subject);
      toast.success('Chapter added!');
    } catch (err) { toast.error(err.message || 'Failed'); }
  });

  document.getElementById('add-topic-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name    = document.getElementById('new-topic').value.trim();
    const chapter = document.getElementById('topic-chapter-select').value;
    if (!name || !chapter) return toast.error('Select chapter first');
    try {
      await API.post('/topics', { name, chapter });
      document.getElementById('new-topic').value = '';
      if (activeChapter?._id === chapter) fetchTopics(chapter);
      toast.success('Topic added!');
    } catch (err) { toast.error(err.message || 'Failed'); }
  });

  // Init
  await fetchSubjects();
});
