/**
 * pages/admin-course.js
 * Course creation UI backed by Course model endpoints.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth('admin');
  if (!user) return;

  const modal = document.getElementById('create-course-modal');
  const openModalBtn = document.getElementById('open-create-course-modal');
  const closeModalBtn = document.getElementById('close-create-course-modal');
  const cancelBtn = document.getElementById('cancel-create-course');
  const backdrop = document.getElementById('course-modal-backdrop');
  const form = document.getElementById('create-course-form');
  const modalTitle = document.getElementById('course-modal-title');
  const submitBtn = document.getElementById('submit-create-course');
  const nameInput = document.getElementById('course-name');
  const descriptionInput = document.getElementById('course-description');
  const priceInput = document.getElementById('course-price');
  const madeForInput = document.getElementById('course-made-for');
  const imageInput = document.getElementById('course-image');
  const tagsInput = document.getElementById('course-tags');
  const publishedInput = document.getElementById('course-published');
  const courseList = document.getElementById('course-list');
  const courseCount = document.getElementById('course-count');

  let courses = [];

  function openModal() {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => nameInput.focus(), 0);
  }

  function openCreateModal() {
    openModal();
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');
    form.reset();
    modalTitle.textContent = 'Create New Course';
    submitBtn.textContent = 'Save Course';
  }
  function renderCourses() {
    courseCount.textContent = String(courses.length);

    if (!courses.length) {
      courseList.innerHTML = '<div class="p-10 text-center text-sm text-slate-400 italic">No courses yet. Create your first one.</div>';
      return;
    }

    courseList.innerHTML = courses.map((course, idx) => {
      const lectureCount = course.lectureCount || (course.lectures ? course.lectures.length : 0);
      const isPublished = course.isPublished;
      
      return `
      <div class="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition group cursor-pointer border-b border-slate-100 last:border-0" data-edit-id="${course._id}">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center shrink-0 shadow-sm">
            <i class="fas fa-graduation-cap text-xl text-blue-500"></i>
          </div>
          <div>
            <div class="flex items-center gap-2 mb-1">
              <h4 class="text-base font-bold text-slate-800 group-hover:text-blue-600 transition">${escapeHtml(course.name)}</h4>
              <span class="px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase ${isPublished ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">
                ${isPublished ? 'Published' : 'Draft'}
              </span>
            </div>
            <div class="flex items-center gap-3 mt-1.5">
              <span class="text-[11px] font-bold text-slate-500"><i class="fas fa-play-circle text-slate-400 mr-1"></i>${lectureCount} Lectures</span>
              <span class="text-[11px] font-bold text-slate-500"><i class="fas fa-rupee-sign text-slate-400 mr-1"></i>${course.price || 0}</span>
              <span class="text-[11px] font-bold text-slate-500 hidden md:inline"><i class="fas fa-calendar-alt text-slate-400 mr-1"></i>${formatDate(course.createdAt)}</span>
            </div>
          </div>
        </div>
        
        <div class="flex items-center gap-2 shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" data-delete-id="${course._id}" class="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 flex items-center justify-center transition shadow-sm" title="Delete Course">
            <i class="fas fa-trash-alt text-xs"></i>
          </button>
          <button type="button" data-edit-id="${course._id}" class="px-4 py-2 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white text-xs font-bold transition shadow-sm">
            Edit Course
          </button>
        </div>
      </div>
      `;
    }).join('');
  }


  async function deleteCourse(courseId) {
    const course = courses.find((item) => item._id === courseId);
    const title = course?.name || 'this course';
    if (!window.confirm(`Delete ${title}? This will remove all lectures in it.`)) return;

    try {
      await API.delete(`/courses/${courseId}`);
      toast.success('Course deleted successfully');
      await loadCourses();
    } catch (err) {
      toast.error(err.message || 'Failed to delete course');
    }
  }

  async function loadCourses() {
    try {
      courses = await API.get('/courses/admin/all');
      renderCourses();
    } catch (err) {
      courseList.innerHTML = '<div class="p-6 text-sm text-red-500">Failed to load courses.</div>';
      toast.error(err.message || 'Failed to load courses');
    }
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.textContent = isSubmitting ? 'Saving...' : 'Save Course';
  }

  openModalBtn.addEventListener('click', openCreateModal);
  closeModalBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  courseList.addEventListener('click', (event) => {
    const editBtn = event.target.closest('[data-edit-id]');
    if (editBtn) {
      window.location.href = `/admin/courses/${editBtn.dataset.editId}/edit`;
      return;
    }

    const deleteBtn = event.target.closest('[data-delete-id]');
    if (deleteBtn) {
      deleteCourse(deleteBtn.dataset.deleteId);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    if (!name) {
      toast.error('Course name is required');
      nameInput.focus();
      return;
    }

    const isDuplicate = courses.some((course) => {
      const sameName = course.name.toLowerCase() === name.toLowerCase();
      return sameName;
    });
    if (isDuplicate) {
      toast.error('Course already exists');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name,
        description: descriptionInput.value.trim(),
        price: Number(priceInput.value || 0),
        madeFor: madeForInput.value,
        image: imageInput.value.trim(),
        tags: tagsInput.value.trim(),
        isPublished: publishedInput.checked,
      };

      await API.post('/courses', payload);
      toast.success('Course created successfully');

      closeModal();
      await loadCourses();
    } catch (err) {
      toast.error(err.message || 'Failed to save course');
    } finally {
      setSubmitting(false);
    }
  });
  await loadCourses();
});

function formatDate(dateValue) {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
