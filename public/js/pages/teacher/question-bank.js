document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('teacher');

  const chapterFilter = document.getElementById('chapter-filter');
  const topicFilter = document.getElementById('topic-filter');
  const refreshBtn = document.getElementById('refresh-btn');
  const loadingEl = document.getElementById('loading');
  const emptyEl = document.getElementById('empty');
  const listEl = document.getElementById('list');

  let chapters = [];
  let topicsByChapter = new Map();
  let questions = [];

  function setLoading(on) {
    loadingEl.classList.toggle('hidden', !on);
  }

  function renderTopicFilter() {
    const chapterId = chapterFilter.value;
    const topics = chapterId ? (topicsByChapter.get(chapterId) || []) : chapters.flatMap((c) => topicsByChapter.get(c._id) || []);
    const current = topicFilter.value;
    topicFilter.innerHTML = '<option value="">All Topics</option>' + topics.map((t) => `<option value="${t._id}">${t.name}</option>`).join('');
    if (current && topics.some((t) => t._id === current)) {
      topicFilter.value = current;
    }
  }

  async function loadFilters() {
    chapters = await API.get('/questions/teacher/chapters');
    chapterFilter.innerHTML = '<option value="">All Chapters</option>' + chapters.map((c) => `<option value="${c._id}">${c.name}</option>`).join('');

    topicsByChapter = new Map();
    await Promise.all(chapters.map(async (c) => {
      const topics = await API.get(`/questions/teacher/topics/${c._id}`);
      topicsByChapter.set(c._id, topics);
    }));

    renderTopicFilter();
  }

  function card(q) {
    const chapterTopics = topicsByChapter.get(q.chapter?._id) || [];
    const topicOptions = chapterTopics.map((t) => `<option value="${t._id}" ${q.topic?._id === t._id ? 'selected' : ''}>${t.name}</option>`).join('');

    return `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4" data-qid="${q._id}">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
          <img src="${q.imageUrl}" alt="Question" class="w-full max-h-36 object-contain rounded-lg border border-gray-100 bg-gray-50" />
          <div class="md:col-span-3 space-y-2">
            <p class="text-sm text-gray-500">Chapter: <span class="font-semibold text-gray-700">${q.chapter?.name || '-'}</span></p>
            <div class="flex flex-col md:flex-row gap-2 md:items-center">
              <label class="text-sm text-gray-500">Topic</label>
              <select class="topic-select px-3 py-2 border border-gray-300 rounded-lg" data-id="${q._id}">${topicOptions}</select>
              <button class="save-topic px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition" data-id="${q._id}">Update Topic</button>
            </div>
            <p class="update-msg text-xs text-green-600 hidden" data-msg="${q._id}">Updated</p>
          </div>
        </div>
      </div>
    `;
  }

  function renderQuestions() {
    const chapterId = chapterFilter.value;
    const topicId = topicFilter.value;

    const filtered = questions.filter((q) => {
      if (chapterId && q.chapter?._id !== chapterId) return false;
      if (topicId && q.topic?._id !== topicId) return false;
      return true;
    });

    if (!filtered.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = filtered.map(card).join('');
  }

  async function loadQuestions() {
    setLoading(true);
    try {
      questions = await API.get('/questions/teacher');
      renderQuestions();
    } catch (err) {
      toast.error('Failed to load questions: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  }

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.save-topic');
    if (!btn) return;

    const qid = btn.dataset.id;
    const select = listEl.querySelector(`.topic-select[data-id="${qid}"]`);
    const newTopic = select?.value;
    if (!newTopic) return;

    try {
      const updated = await API.patch(`/questions/teacher/${qid}/topic`, { topic: newTopic });
      const idx = questions.findIndex((q) => q._id === qid);
      if (idx !== -1) questions[idx] = updated;
      renderQuestions();
      const msg = listEl.querySelector(`[data-msg="${qid}"]`);
      if (msg) {
        msg.classList.remove('hidden');
        setTimeout(() => msg.classList.add('hidden'), 1200);
      }
      toast.success('Topic updated');
    } catch (err) {
      toast.error('Failed to update topic: ' + (err.message || ''));
    }
  });

  chapterFilter.addEventListener('change', () => {
    renderTopicFilter();
    renderQuestions();
  });

  topicFilter.addEventListener('change', renderQuestions);
  refreshBtn.addEventListener('click', loadQuestions);

  try {
    await loadFilters();
    await loadQuestions();
  } catch (err) {
    toast.error('Failed to initialize page: ' + (err.message || ''));
  }
});
