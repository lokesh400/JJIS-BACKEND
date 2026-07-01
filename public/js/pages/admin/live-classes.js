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
