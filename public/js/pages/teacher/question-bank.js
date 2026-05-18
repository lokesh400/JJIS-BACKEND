document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('teacher');

  const chapterFilter = document.getElementById('chapter-filter');
  const topicFilter = document.getElementById('topic-filter');
  const refreshBtn = document.getElementById('refresh-btn');
  const loadMoreBtn = document.getElementById('load-more-btn');
  const hintEl = document.getElementById('hint');
  const loadingEl = document.getElementById('loading');
  const emptyEl = document.getElementById('empty');
  const listEl = document.getElementById('list');

  let chapters = [];
  let topicsByChapter = new Map();
  let questions = [];
  let page = 1;
  const limit = 10;
  let hasMore = false;

  function setLoading(on) {
    loadingEl.classList.toggle('hidden', !on);
  }

  function hasActiveFilters() {
    return Boolean(chapterFilter.value && topicFilter.value);
  }

  function renderTopicFilter() {
    const chapterId = chapterFilter.value;
    const topics = chapterId ? (topicsByChapter.get(chapterId) || []) : [];
    topicFilter.innerHTML = '<option value="">Select Topic</option>' + topics.map((t) => `<option value="${t._id}">${t.name}</option>`).join('');
    const current = topicFilter.value;
    if (current && topics.some((t) => t._id === current)) {
      topicFilter.value = current;
    }
  }

  async function loadFilters() {
    chapters = await API.get('/questions/teacher/chapters');
    chapterFilter.innerHTML = '<option value="">Select Chapter</option>' + chapters.map((c) => `<option value="${c._id}">${c.name}</option>`).join('');

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
    const difficulty = q.difficulty || 'unassigned';
    const difficultyOptions = ['unassigned', 'easy', 'medium', 'hard']
      .map((level) => `<option value="${level}" ${difficulty === level ? 'selected' : ''}>${level.charAt(0).toUpperCase() + level.slice(1)}</option>`)
      .join('');

    return `
      <article class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 sm:p-4 md:p-5" data-qid="${q._id}">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
          <div class="lg:col-span-5 xl:col-span-4">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-2">
              <img src="${q.imageUrl}" alt="Question" class="w-full h-56 sm:h-64 md:h-72 object-contain rounded-lg" />
            </div>
          </div>
          <div class="lg:col-span-7 xl:col-span-8 space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">Chapter</span>
              <p class="text-sm sm:text-base text-slate-700 font-medium">${q.chapter?.name || '-'}</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-end">
              <div class="md:col-span-7">
                <label class="block text-xs font-medium text-slate-500 mb-1">Topic</label>
                <select class="topic-select w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" data-id="${q._id}">${topicOptions}</select>
              </div>
              <div class="md:col-span-5">
                <button class="save-topic w-full px-3 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition" data-id="${q._id}">Update Topic</button>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-end">
              <div class="md:col-span-7">
                <label class="block text-xs font-medium text-slate-500 mb-1">Difficulty</label>
                <select class="difficulty-select w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" data-id="${q._id}">${difficultyOptions}</select>
              </div>
              <div class="md:col-span-5">
                <button class="save-difficulty w-full px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition" data-id="${q._id}">Update Difficulty</button>
              </div>
            </div>

            <p class="update-msg text-xs font-medium text-emerald-600 hidden" data-msg="${q._id}">Updated</p>
          </div>
        </div>
      </article>
    `;
  }

  function renderQuestions() {
    if (!questions.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      loadMoreBtn.classList.add('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = questions.map(card).join('');
    loadMoreBtn.classList.toggle('hidden', !hasMore);
  }

  function resetQuestionState() {
    questions = [];
    page = 1;
    hasMore = false;
    listEl.innerHTML = '';
    emptyEl.classList.add('hidden');
    loadMoreBtn.classList.add('hidden');
  }

  function renderIdleState() {
    hintEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    listEl.innerHTML = '';
    loadMoreBtn.classList.add('hidden');
  }

  async function loadQuestions({ append = false } = {}) {
    if (!hasActiveFilters()) {
      resetQuestionState();
      renderIdleState();
      return;
    }

    hintEl.classList.add('hidden');
    setLoading(true);
    try {
      const chapterId = chapterFilter.value;
      const topicId = topicFilter.value;
      const data = await API.get(`/questions/teacher?chapter=${encodeURIComponent(chapterId)}&topic=${encodeURIComponent(topicId)}&page=${page}&limit=${limit}`);
      const items = Array.isArray(data?.items) ? data.items : [];
      hasMore = Boolean(data?.hasMore);
      questions = append ? [...questions, ...items] : items;
      renderQuestions();
    } catch (err) {
      toast.error('Failed to load questions: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  }

  listEl.addEventListener('click', async (e) => {
    const topicBtn = e.target.closest('.save-topic');
    if (topicBtn) {
      const qid = topicBtn.dataset.id;
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
      return;
    }

    const difficultyBtn = e.target.closest('.save-difficulty');
    if (!difficultyBtn) return;

    const qid = difficultyBtn.dataset.id;
    const select = listEl.querySelector(`.difficulty-select[data-id="${qid}"]`);
    const difficulty = select?.value || 'unassigned';
    try {
      const updated = await API.patch(`/questions/teacher/${qid}/difficulty`, { difficulty });
      const idx = questions.findIndex((q) => q._id === qid);
      if (idx !== -1) questions[idx] = updated;
      renderQuestions();
      const msg = listEl.querySelector(`[data-msg="${qid}"]`);
      if (msg) {
        msg.classList.remove('hidden');
        setTimeout(() => msg.classList.add('hidden'), 1200);
      }
      toast.success('Difficulty updated');
    } catch (err) {
      toast.error('Failed to update difficulty: ' + (err.message || ''));
    }
  });

  chapterFilter.addEventListener('change', () => {
    renderTopicFilter();
    resetQuestionState();
    renderIdleState();
  });

  topicFilter.addEventListener('change', async () => {
    page = 1;
    questions = [];
    await loadQuestions();
  });

  refreshBtn.addEventListener('click', async () => {
    page = 1;
    questions = [];
    await loadQuestions();
  });

  loadMoreBtn.addEventListener('click', async () => {
    if (!hasMore) return;
    page += 1;
    await loadQuestions({ append: true });
  });

  try {
    await loadFilters();
    renderIdleState();
  } catch (err) {
    toast.error('Failed to initialize page: ' + (err.message || ''));
  }
});
