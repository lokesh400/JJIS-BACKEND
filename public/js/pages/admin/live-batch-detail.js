// Admin Live Batch Detail Controller
const batchId = window.location.pathname.split('/').pop();

document.addEventListener('DOMContentLoaded', () => {
  initBatchDetailPage();
});

let allStudents = [];

async function initBatchDetailPage() {
  if (!batchId) return;

  try {
    // 1. Load Batch Info
    await loadBatchInfo();

    // 2. Load classes for this batch
    await loadBatchClasses();

    // 3. Load students for enrollment
    await loadStudentsList();

    // 4. Setup search filtering
    setupSearch();
  } catch (err) {
    showToast(err.message || 'Failed to initialize details page', 'error');
  }
}

async function loadBatchInfo() {
  try {
    const batch = await API.get(`/live-classes/batches/${batchId}`);
    document.getElementById('batch-title').textContent = batch.name;
    document.getElementById('batch-desc').textContent = batch.description || 'No description provided.';
  } catch (err) {
    showToast('Failed to load batch info.', 'error');
  }
}

async function loadBatchClasses() {
  const listEl = document.getElementById('classes-list');
  if (!listEl) return;

  try {
    const classes = await API.get('/live-classes/classes', { batchId });
    if (!classes || classes.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-8 text-gray-500 bg-white border border-gray-100 rounded-xl">
          No classes scheduled for this batch.
        </div>`;
      return;
    }

    listEl.innerHTML = classes.map(cls => {
      const dateStr = new Date(cls.scheduledAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = new Date(cls.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      let statusBadge = '';
      let actions = '';

      if (cls.status === 'scheduled') {
        statusBadge = `<span class="px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full">Scheduled</span>`;
        actions = `
          <button onclick="updateClassStatus('${cls._id}', 'live')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition">
            Go Live
          </button>
        `;
      } else if (cls.status === 'live') {
        statusBadge = `<span class="px-2.5 py-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-full animate-pulse">● LIVE</span>`;
        actions = `
          <a href="/classroom/${cls._id}" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition">
            Enter Room
          </a>
          <button onclick="updateClassStatus('${cls._id}', 'ended')" class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition">
            End Class
          </button>
        `;
      } else {
        statusBadge = `<span class="px-2.5 py-1 text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-full">Ended</span>`;
        actions = `
          <a href="/classroom/${cls._id}" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition">
            Watch Recording
          </a>
        `;
      }

      const notesDownload = cls.notesFile 
        ? `<div class="mt-2 text-xs text-gray-500 flex items-center gap-1">
             <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
             <span class="truncate">${escapeHtml(cls.notesFile.substring(cls.notesFile.indexOf('-') + 1))}</span>
           </div>`
        : '';

      return `
        <div class="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1.5">
              ${statusBadge}
              <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">${escapeHtml(cls.subjectId?.name || '')} • ${escapeHtml(cls.chapterId?.name || '')}</span>
            </div>
            <h4 class="font-bold text-gray-800 text-base truncate">${escapeHtml(cls.title)}</h4>
            <p class="text-gray-500 text-xs mt-1 line-clamp-2">${escapeHtml(cls.description || 'No description.')}</p>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                ${dateStr}
              </span>
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                ${timeStr}
              </span>
            </div>
            ${notesDownload}
          </div>
          <div class="flex items-center gap-2 self-start md:self-center">
            ${actions}
            <button onclick="deleteClass('${cls._id}')" class="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition" title="Delete Class">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="text-red-500 text-center py-5">Error: ${err.message}</div>`;
  }
}

async function loadStudentsList() {
  const container = document.getElementById('students-enroll-container');
  if (!container) return;

  try {
    // 1. Fetch all students from /api/auth/students
    const students = await API.get('/auth/students');
    allStudents = students;

    renderStudents(students);
  } catch (err) {
    container.innerHTML = `<div class="text-red-500 text-xs py-2">Error: ${err.message}</div>`;
  }
}

function renderStudents(students) {
  const container = document.getElementById('students-enroll-container');
  if (!container) return;

  if (!students || students.length === 0) {
    container.innerHTML = `<p class="text-gray-400 text-sm py-4 text-center">No students found.</p>`;
    return;
  }

  container.innerHTML = students.map(student => {
    // Check if enrolled
    const isEnrolled = student.batches && student.batches.some(bId => bId.toString() === batchId);
    
    return `
      <label class="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-100 rounded-xl cursor-pointer select-none transition">
        <input type="checkbox" name="enrolled_students" value="${student._id}" ${isEnrolled ? 'checked' : ''}
               class="student-cb w-4 h-4 text-garud-accent focus:ring-garud-accent border-gray-300 rounded"/>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold text-gray-800 truncate">${escapeHtml(student.name)}</p>
          <p class="text-xs text-gray-400 truncate">${escapeHtml(student.email)}</p>
        </div>
      </label>
    `;
  }).join('');
}

function setupSearch() {
  const searchInput = document.getElementById('student-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!term) {
      renderStudents(allStudents);
      return;
    }

    const filtered = allStudents.filter(s => 
      s.name.toLowerCase().includes(term) || 
      s.email.toLowerCase().includes(term)
    );
    renderStudents(filtered);
  });

  // Handle Select All / Unselect All
  window.selectAllStudents = (checked) => {
    const cbs = document.querySelectorAll('.student-cb');
    cbs.forEach(cb => cb.checked = checked);
  };
}

async function saveEnrollment() {
  const btn = document.getElementById('save-enroll-btn');
  if (btn) btn.disabled = true;

  const checkedBoxes = document.querySelectorAll('.student-cb:checked');
  const studentIds = Array.from(checkedBoxes).map(cb => cb.value);

  try {
    await API.post(`/live-classes/batches/${batchId}/enroll`, { studentIds });
    showToast('Batch enrollment updated successfully!', 'success');
    loadStudentsList();
  } catch (err) {
    showToast(err.message || 'Failed to update enrollment.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.saveEnrollment = saveEnrollment;

async function updateClassStatus(classId, status) {
  try {
    await API.post(`/live-classes/classes/${classId}/status/${status}`);
    showToast(`Class status updated to ${status}!`, 'success');
    loadBatchClasses();
  } catch (err) {
    showToast(err.message || 'Status update failed.', 'error');
  }
}
window.updateClassStatus = updateClassStatus;

async function deleteClass(classId) {
  if (!confirm('Are you sure you want to delete this scheduled class? This is irreversible.')) {
    return;
  }
  try {
    await API.delete(`/live-classes/classes/${classId}`);
    showToast('Class deleted successfully!', 'success');
    loadBatchClasses();
  } catch (err) {
    showToast(err.message || 'Delete failed.', 'error');
  }
}
window.deleteClass = deleteClass;

// Utility functions
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
