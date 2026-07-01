// Student Live Classes Controller
document.addEventListener('DOMContentLoaded', () => {
  initStudentLiveClasses();
});

async function initStudentLiveClasses() {
  const container = document.getElementById('student-classes-container');
  if (!container) return;

  try {
    const classes = await API.get('/live-classes/classes');
    
    if (!classes || classes.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
          <div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </div>
          <h3 class="font-bold text-gray-800 text-lg">No Live Classes Available</h3>
          <p class="text-gray-400 text-sm mt-1 max-w-sm mx-auto">You aren't enrolled in any active batches, or no classes are scheduled yet.</p>
        </div>`;
      return;
    }

    // Categorize
    const liveClasses = classes.filter(c => c.status === 'live');
    const scheduledClasses = classes.filter(c => c.status === 'scheduled');
    const endedClasses = classes.filter(c => c.status === 'ended');

    let html = '';

    // 1. Live Panel
    if (liveClasses.length > 0) {
      html += `
        <div class="mb-8">
          <h3 class="text-lg font-black text-gray-800 mb-4 flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
            Active Live Sessions
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${liveClasses.map(cls => renderClassCard(cls, 'live')).join('')}
          </div>
        </div>
      `;
    }

    // 2. Scheduled Panel
    if (scheduledClasses.length > 0) {
      html += `
        <div class="mb-8">
          <h3 class="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            Upcoming Scheduled Classes
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${scheduledClasses.map(cls => renderClassCard(cls, 'scheduled')).join('')}
          </div>
        </div>
      `;
    }

    // 3. Recorded Panel
    if (endedClasses.length > 0) {
      html += `
        <div class="mb-8">
          <h3 class="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Recorded & Ended Classes
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${endedClasses.map(cls => renderClassCard(cls, 'ended')).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="text-red-500 text-center py-8">Failed to load classes: ${err.message}</div>`;
  }
}

function renderClassCard(cls, type) {
  const dateStr = new Date(cls.scheduledAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = new Date(cls.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let actionButton = '';
  let badge = '';

  if (type === 'live') {
    badge = `<span class="px-2.5 py-0.5 text-2xs font-extrabold text-red-700 bg-red-50 border border-red-200 rounded-full uppercase tracking-wider animate-pulse flex items-center gap-1">● Live</span>`;
    actionButton = `
      <a href="/student/course/${cls.courseId}/player?lectureId=${cls._id}" class="w-full text-center py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm shadow-sm transition block">
        Join Live Room
      </a>
    `;
  } else if (type === 'scheduled') {
    badge = `<span class="px-2.5 py-0.5 text-2xs font-extrabold text-amber-700 bg-amber-50 border border-amber-200 rounded-full uppercase tracking-wider">Scheduled</span>`;
    actionButton = `
      <button disabled class="w-full py-2.5 px-4 bg-gray-100 text-gray-400 rounded-xl font-bold text-sm cursor-not-allowed transition block">
        Starts at ${timeStr}
      </button>
    `;
  } else {
    badge = `<span class="px-2.5 py-0.5 text-2xs font-extrabold text-gray-700 bg-gray-50 border border-gray-200 rounded-full uppercase tracking-wider">Recorded</span>`;
    actionButton = `
      <a href="/student/course/${cls.courseId}/player?lectureId=${cls._id}" class="w-full text-center py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-sm transition block">
        Watch Recording
      </a>
    `;
  }

  const notesSection = cls.notesFile
    ? `<div class="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
         <span class="text-xs text-gray-400 flex items-center gap-1 min-w-0">
           <svg class="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
           <span class="truncate">${escapeHtml(cls.notesFile.substring(cls.notesFile.indexOf('-') + 1))}</span>
         </span>
         <a href="/api/live-classes/download/${cls._id}" download class="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1">
           <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
           Notes
         </a>
       </div>`
    : '';

  return `
    <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
      <div>
        <div class="flex justify-between items-start gap-2 mb-2">
          ${badge}
          <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">${escapeHtml(cls.subjectId?.name || '')}</span>
        </div>
        <h4 class="font-extrabold text-gray-800 text-lg truncate mb-1">${escapeHtml(cls.title)}</h4>
        <p class="text-gray-400 text-xs truncate mb-3">Chapter: ${escapeHtml(cls.chapterId?.name || '')}</p>
        <p class="text-gray-500 text-sm line-clamp-2 mb-4">${escapeHtml(cls.description || 'No description provided.')}</p>
        <div class="flex items-center gap-4 text-xs text-gray-400 mb-5">
          <span class="flex items-center gap-1 font-semibold">
            <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            ${dateStr}
          </span>
          <span class="flex items-center gap-1 font-semibold">
            <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            ${timeStr}
          </span>
        </div>
      </div>
      <div>
        ${actionButton}
        ${notesSection}
      </div>
    </div>
  `;
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
