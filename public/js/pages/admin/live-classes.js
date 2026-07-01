// Admin Live Classes Controller
document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth('admin');
  if (!user) return;
  initLiveClassesPage();
});

async function initLiveClassesPage() {
  const listEl = document.getElementById('batches-list');
  const loadingEl = document.getElementById('loading-batches');
  if (!listEl) return;

  try {
    if (loadingEl) loadingEl.classList.remove('hidden');
    listEl.classList.add('hidden');

    const courses = await API.get('/courses/admin/all');
    
    if (loadingEl) loadingEl.classList.add('hidden');
    listEl.classList.remove('hidden');

    if (!courses || courses.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-10 bg-white rounded-2xl border border-gray-100 p-6">
          <p class="text-gray-400">No courses created yet.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = courses.map(course => {
      if (!course) return '';
      
      const lecturesCount = Array.isArray(course.lectures) ? course.lectures.length : 0;
      const liveLectures = Array.isArray(course.lectures) 
        ? course.lectures.filter(l => l && l.status === 'live').length 
        : 0;
      const scheduledLectures = Array.isArray(course.lectures)
        ? course.lectures.filter(l => l && l.status === 'scheduled').length
        : 0;

      return `
        <div class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div class="flex justify-between items-start gap-2">
              <h3 class="font-bold text-gray-800 text-lg truncate" title="${escapeHtml(course.name)}">${escapeHtml(course.name)}</h3>
            </div>
            <p class="text-gray-500 text-sm mt-2 line-clamp-2">${escapeHtml(course.description || 'No description')}</p>
            <div class="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div class="bg-slate-50 p-2 rounded-lg border border-slate-100">
                <p class="text-slate-400">Total Lectures</p>
                <p class="font-bold text-slate-800 mt-0.5">${lecturesCount}</p>
              </div>
              <div class="bg-red-50 p-2 rounded-lg border border-red-100">
                <p class="text-red-400 font-semibold">Live</p>
                <p class="font-bold text-red-800 mt-0.5">${liveLectures}</p>
              </div>
              <div class="bg-amber-50 p-2 rounded-lg border border-amber-100">
                <p class="text-amber-500 font-semibold">Scheduled</p>
                <p class="font-bold text-amber-800 mt-0.5">${scheduledLectures}</p>
              </div>
            </div>
          </div>
          <div class="mt-5 pt-4 border-t border-gray-100 flex gap-2">
            <a href="/admin/courses/${course._id}/edit" class="w-full text-center py-2.5 px-3 bg-garud-highlight hover:opacity-90 text-white rounded-xl font-bold text-xs shadow-sm transition block">
              Manage Lectures & Live Sessions
            </a>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    if (loadingEl) loadingEl.classList.add('hidden');
    listEl.innerHTML = `<div class="text-red-500 text-center py-5">Error: ${err.message}</div>`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Global Active Live Classes Modal Logic
document.addEventListener('DOMContentLoaded', () => {
  const fabBtn = document.getElementById('fab-active-live');
  const fabCount = document.getElementById('fab-active-count');
  const modal = document.getElementById('active-live-modal');
  const closeBtn = document.getElementById('close-active-modal-btn');
  const listEl = document.getElementById('active-live-list');
  const loadingEl = document.getElementById('active-live-loading');
  const emptyEl = document.getElementById('active-live-empty');

  let activeLectures = [];

  const fetchActiveLive = async () => {
    try {
      const res = await API.get('/courses/admin/live/active');
      activeLectures = res || [];
      if (activeLectures.length > 0) {
        fabBtn.classList.remove('hidden');
        fabCount.textContent = activeLectures.length;
      } else {
        fabBtn.classList.add('hidden');
      }
    } catch (err) {
      console.error('Failed to fetch active live classes:', err);
    }
  };

  const renderActiveLive = () => {
    loadingEl.classList.add('hidden');
    
    if (activeLectures.length === 0) {
      listEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');

    listEl.innerHTML = activeLectures.map(lecture => `
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span class="text-[10px] font-bold uppercase tracking-wider text-red-500">Live</span>
            <span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full truncate max-w-[120px]">${escapeHtml(lecture.courseName)}</span>
          </div>
          <h4 class="font-bold text-slate-800 text-sm truncate">${escapeHtml(lecture.lectureTitle)}</h4>
          <p class="text-xs text-slate-500 truncate">${escapeHtml(lecture.subjectName)} • ${escapeHtml(lecture.chapterName)}</p>
        </div>
        <button type="button" class="end-live-btn px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-lg transition border border-red-200 shadow-sm shrink-0" 
          data-course="${lecture.courseId}" 
          data-subject="${lecture.subjectIndex}" 
          data-chapter="${lecture.chapterIndex}" 
          data-lecture="${lecture.lectureIndex}">
          End Class
        </button>
      </div>
    `).join('');

    // Attach end button listeners
    listEl.querySelectorAll('.end-live-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm('Are you sure you want to end this live class? This will mark the lecture status as "Ended".')) return;
        
        const btnEl = e.currentTarget;
        const cId = btnEl.getAttribute('data-course');
        const sIdx = btnEl.getAttribute('data-subject');
        const cIdx = btnEl.getAttribute('data-chapter');
        const lIdx = btnEl.getAttribute('data-lecture');

        btnEl.disabled = true;
        btnEl.textContent = 'Ending...';

        try {
          await API.patch(`/courses/admin/${cId}/lecture/${sIdx}/${cIdx}/${lIdx}/status`, { status: 'ended' });
          toast.success('Live class ended successfully');
          
          // Re-fetch everything
          await fetchActiveLive();
          renderActiveLive();
          initLiveClassesPage(); // Refresh dashboard cards too
          
          // If no active live classes left, close modal
          if (activeLectures.length === 0) {
            setTimeout(() => {
              if(modal) modal.classList.add('hidden');
            }, 1000);
          }
        } catch (err) {
          btnEl.disabled = false;
          btnEl.textContent = 'End Class';
          toast.error(err.message || 'Failed to end live class');
        }
      });
    });
  };

  if (fabBtn) {
    fabBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
      loadingEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      emptyEl.classList.add('hidden');
      
      fetchActiveLive().then(renderActiveLive);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  // Initial fetch
  fetchActiveLive();
});
