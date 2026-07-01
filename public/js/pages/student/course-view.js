document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth('student');
  if (!user) return;

  const courseId = window.location.pathname.split('/')[3];
  
  // DOM Elements
  const courseNameEl = document.getElementById('course-name');
  const courseDescEl = document.getElementById('course-desc');
  const breadcrumbEl = document.getElementById('breadcrumb-container');
  const tabContainerEl = document.getElementById('tab-container');
  const dynamicGridEl = document.getElementById('dynamic-grid');
  const loadingEl = document.getElementById('loading');
  const mainContentEl = document.getElementById('main-content');
  const purchaseActionsEl = document.getElementById('purchase-actions');

  // State
  let course = null;
  let currentView = 'course'; // 'course' | 'subject' | 'chapter'
  let activeSubject = null;
  let activeChapter = null;
  
  // Tab State
  let courseTab = 'Subjects'; // 'Subjects' | 'Tests'
  let chapterTab = 'Lectures'; // 'Lectures' | 'DPP'

  // Initialize
  async function init() {
    try {
      const [courseResponse] = await Promise.all([
        API.get(`/courses/published/${courseId}`),
      ]);
      course = courseResponse;
      render();
    } catch (error) {
      if (error.status === 403) {
        toast.error('Purchase this course first to access it.');
      } else {
        toast.error(error.message || 'Failed to load course');
      }
      window.location.href = '/student/purchase-courses';
    } finally {
      loadingEl.classList.add('hidden');
      mainContentEl.classList.remove('hidden');
    }
  }

  // Master Render Function
  function render() {
    // Header setup
    courseNameEl.textContent = course.name;
    if (course.description) {
      courseDescEl.textContent = course.description;
      courseDescEl.classList.remove('hidden');
    }
    purchaseActionsEl.innerHTML = '<span class="px-3 py-1.5 bg-emerald-400/20 border border-emerald-300/40 text-emerald-100 rounded-lg text-xs font-semibold backdrop-blur">Access Granted</span>';

    renderBreadcrumbs();

    if (currentView === 'course') {
      renderCourseTabs();
      if (courseTab === 'Subjects') renderSubjectsGrid();
      else renderTests();
    } 
    else if (currentView === 'subject') {
      tabContainerEl.innerHTML = ''; // No tabs for subject view
      renderChaptersGrid();
    } 
    else if (currentView === 'chapter') {
      renderChapterTabs();
      if (chapterTab === 'Lectures') renderLecturesList();
      else renderDPPPlaceholder();
    }
  }

  // Navigation / Breadcrumbs
  function renderBreadcrumbs() {
    if (currentView === 'course') {
      breadcrumbEl.classList.add('hidden');
      return;
    }

    breadcrumbEl.classList.remove('hidden');
    
    let html = `<button data-nav="course" class="hover:text-white transition">Subjects</button>`;
    
    if (currentView === 'subject' || currentView === 'chapter') {
      html += `<span>›</span> <button data-nav="subject" class="hover:text-white transition">${escapeHtml(activeSubject.name)}</button>`;
    }
    if (currentView === 'chapter') {
      html += `<span>›</span> <span class="text-white">${escapeHtml(activeChapter.name)}</span>`;
    }

    breadcrumbEl.innerHTML = html;
  }

  breadcrumbEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    const target = btn.dataset.nav;
    if (target === 'course') {
      currentView = 'course';
      activeSubject = null;
      activeChapter = null;
    } else if (target === 'subject') {
      currentView = 'subject';
      activeChapter = null;
    }
    render();
  });

  // -------------- Tabs Rendering --------------
  function renderTabs(tabsArray, activeState, onClickHandler) {
    tabContainerEl.innerHTML = tabsArray.map(tab => {
      const isActive = tab === activeState;
      const baseClass = "px-1 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer";
      const stateClass = isActive ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300";
      return `<button data-tab="${tab}" class="${baseClass} ${stateClass}">${tab}</button>`;
    }).join('');

    // Attach listeners
    tabContainerEl.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        onClickHandler(btn.dataset.tab);
      });
    });
  }

  function renderCourseTabs() {
    renderTabs(['Subjects', 'Tests'], courseTab, (selected) => {
      courseTab = selected;
      render();
    });
  }

  function renderChapterTabs() {
    renderTabs(['Lectures', 'DPP'], chapterTab, (selected) => {
      chapterTab = selected;
      render();
    });
  }

  // -------------- Course View (Subjects Grid) --------------
  function renderSubjectsGrid() {
    const subjects = Array.isArray(course.subjects) ? course.subjects : [];
    
    if (subjects.length === 0) {
      dynamicGridEl.innerHTML = `<p class="text-slate-500 text-sm italic text-center py-8">No subjects available for this course.</p>`;
      return;
    }

    dynamicGridEl.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 xl:gap-5";
    
    dynamicGridEl.innerHTML = subjects.map((sub, index) => {
      const acronym = sub.name ? sub.name.substring(0, 2).toUpperCase() : 'SU';
      const progressPct = 0;

      return `
        <div data-subject-id="${sub._id || index}" class="subject-card group cursor-pointer bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <span class="text-blue-700 font-bold text-sm">${acronym}</span>
            </div>
            <h3 class="font-bold text-slate-800 text-sm line-clamp-2 leading-snug flex-1">${escapeHtml(sub.name)}</h3>
          </div>
          
          <div class="mt-4 flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-green-500 rounded-full" style="width: ${progressPct}%"></div>
            </div>
            <span class="text-[11px] font-bold text-slate-500">${progressPct}%</span>
            <svg class="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to subject cards
    dynamicGridEl.querySelectorAll('.subject-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = card.dataset.subjectId;
        activeSubject = subjects.find((s, i) => String(s._id || i) === String(idx));
        currentView = 'subject';
        render();
      });
    });
  }

  function renderTests() {
    const tests = Array.isArray(course.tests) ? course.tests : [];
    
    if (tests.length === 0) {
      dynamicGridEl.className = "w-full";
      dynamicGridEl.innerHTML = `
        <div class="mt-10 flex flex-col items-center justify-center p-10 bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
          <svg class="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h4 class="text-lg font-bold text-slate-700">No Tests Found</h4>
          <p class="text-sm text-slate-500 text-center mt-1">There are no tests available for this course yet.</p>
        </div>
      `;
      return;
    }

    dynamicGridEl.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 xl:gap-5";
    dynamicGridEl.innerHTML = tests.map((test, index) => {
      const scheduledDate = test.scheduledAt ? dayjs(test.scheduledAt).format('MMM D, YYYY') : 'Available Now';
      
      return `
        <div class="test-card group bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-full">
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold px-2 py-1 bg-orange-100 text-orange-600 rounded-md uppercase tracking-wider">${escapeHtml(test.testType || 'TEST')}</span>
              <span class="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-md flex items-center gap-1">
                <i class="far fa-clock"></i> ${test.duration} mins
              </span>
            </div>
            <h3 class="font-bold text-slate-800 text-base line-clamp-2 leading-snug mb-1">${escapeHtml(test.name)}</h3>
            ${test.syllabus ? `<p class="text-xs text-slate-500 line-clamp-1 mb-2">${escapeHtml(test.syllabus)}</p>` : ''}
            <div class="text-xs text-slate-500 mt-2 font-semibold">
              <i class="far fa-calendar-alt mr-1 text-slate-400"></i> ${scheduledDate}
            </div>
          </div>
          <div class="mt-5">
            <a href="/student/test/${test._id}/instruction" class="w-full block text-center px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg transition shadow-sm">
              Attempt Test
            </a>
          </div>
        </div>
      `;
    }).join('');
  }

  // -------------- Subject View (Chapters Grid) --------------
  function renderChaptersGrid() {
    const chapters = Array.isArray(activeSubject.chapters) ? activeSubject.chapters : [];

    if (chapters.length === 0) {
      dynamicGridEl.innerHTML = `<p class="text-slate-500 text-sm italic text-center py-8">No chapters found for this subject.</p>`;
      return;
    }

    dynamicGridEl.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-5";

    dynamicGridEl.innerHTML = chapters.map((chap, index) => {
      const lectureCount = Array.isArray(chap.lectures) ? chap.lectures.length : 0;
      const chapterNumStr = String(index + 1).padStart(2, '0');
      const chapId = chap._id || index;

      return `
        <div data-chapter-id="${chapId}" class="chapter-card group cursor-pointer bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <span class="text-xs font-extrabold text-blue-700 tracking-wide mb-2 inline-block">CH - ${chapterNumStr}</span>
            <div class="flex items-center justify-between gap-3">
              <h3 class="font-bold text-slate-800 text-base line-clamp-2 leading-snug flex-1">${escapeHtml(chap.name || `Chapter ${index + 1}`)}</h3>
              <svg class="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
          <div class="mt-4">
            <span class="text-xs font-semibold text-slate-500">Lecture: 0/${lectureCount}</span>
          </div>
        </div>
      `;
    }).join('');

    dynamicGridEl.querySelectorAll('.chapter-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = card.dataset.chapterId;
        activeChapter = chapters.find((c, i) => String(c._id || i) === String(idx));
        currentView = 'chapter';
        render();
      });
    });
  }

  // -------------- Chapter View (Lectures/DPP) --------------
  function renderLecturesList() {
    const lectures = Array.isArray(activeChapter.lectures) ? activeChapter.lectures : [];

    if (lectures.length === 0) {
      dynamicGridEl.className = "w-full";
      dynamicGridEl.innerHTML = `<p class="text-slate-500 text-sm italic text-center py-8">No lessons found in this chapter.</p>`;
      return;
    }

    dynamicGridEl.className = "grid grid-cols-1 md:grid-cols-2 gap-5";

    dynamicGridEl.innerHTML = lectures.map((lesson, index) => {
      let dateStr = 'Available';
      if (lesson.scheduledAt) {
        dateStr = dayjs(lesson.scheduledAt).format('D MMM YYYY');
      }

      const hasVideo = !!String(lesson.videoLink || '').trim();
      const pdfs = Array.isArray(lesson.pdfs) ? lesson.pdfs : [];
      const hasNotes = pdfs.length > 0;

      // Disable buttons if not available
      const watchDisabledAttr = hasVideo ? '' : 'disabled';
      const watchClass = hasVideo 
        ? 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200' 
        : 'bg-slate-100 text-slate-400 border-transparent cursor-not-allowed opacity-60';
      
      const notesDisabledAttr = hasNotes ? '' : 'disabled';
      const notesClass = hasNotes 
        ? 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200' 
        : 'bg-slate-100 text-slate-400 border-transparent cursor-not-allowed opacity-60';

      return `
        <div class="relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm pt-[4px]">
          <!-- Top Progress Bar -->
          <div class="top-progress-wrap"><div class="top-progress-fill" style="width: 0%"></div></div>
          
          <div class="p-5">
            <div class="flex items-start gap-4 mb-5">
              <div class="relative shrink-0">
                <img src="/images/placeholders/course-placeholder.jpg" onerror="this.src='https://placehold.co/100x100?text=Lec'" alt="Thumbnail" class="w-16 h-16 rounded-lg object-cover bg-slate-100 border border-slate-200">
                <div class="play-badge">
                  <svg class="w-3 h-3 ml-[2px]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div class="flex-1 min-w-0 pt-1">
                <p class="text-[11px] font-semibold text-slate-500 mb-1">Lecture • ${dateStr}</p>
                <h3 class="font-bold text-sm text-slate-900 leading-snug line-clamp-2">${escapeHtml(lesson.title)}</h3>
                <p class="text-xs font-semibold text-slate-400 mt-1.5">2h:00m</p>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <button 
                data-play="${lesson._id}" 
                ${watchDisabledAttr}
                class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[13px] font-bold transition ${watchClass}"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Watch
              </button>
              <button 
                data-notes="${lesson._id}" 
                ${notesDisabledAttr}
                class="flex-1 py-2.5 rounded-lg border text-[13px] font-bold transition ${notesClass}"
              >
                Notes & more
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach Action Listeners
    dynamicGridEl.querySelectorAll('[data-play]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.play;
        window.location.href = `/student/course/${courseId}/player?lectureId=${encodeURIComponent(id)}&tab=video`;
      });
    });

    dynamicGridEl.querySelectorAll('[data-notes]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.notes;
        window.location.href = `/student/course/${courseId}/player?lectureId=${encodeURIComponent(id)}&tab=attachments`;
      });
    });
  }

  function renderDPPPlaceholder() {
    dynamicGridEl.className = "w-full";
    dynamicGridEl.innerHTML = `
      <div class="mt-10 flex flex-col items-center justify-center p-10 bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
        <svg class="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        <h4 class="text-lg font-bold text-slate-700">DPP Coming Soon</h4>
        <p class="text-sm text-slate-500 text-center mt-1">Daily Practice Problems will be available here.</p>
      </div>
    `;
  }

  // Utilities
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Start execution
  await init();
});
