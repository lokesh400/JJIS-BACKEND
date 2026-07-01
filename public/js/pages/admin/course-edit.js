document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth('admin');
  if (!user) return;

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const courseId = pathParts[2];

  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const editorState = document.getElementById('editor-state');

  const pageTitle = document.getElementById('page-title');
  const deleteBtn = document.getElementById('delete-course-btn');
  const form = document.getElementById('edit-course-form');
  const saveBtn = document.getElementById('save-course-btn');

  const nameInput = document.getElementById('course-name');
  const descriptionInput = document.getElementById('course-description');
  const priceInput = document.getElementById('course-price');
  const madeForInput = document.getElementById('course-made-for');
  const imageInput = document.getElementById('course-image');
  const tagsInput = document.getElementById('course-tags');
  const publishedInput = document.getElementById('course-published');

  const metaLectures = document.getElementById('meta-lectures');
  const metaPurchases = document.getElementById('meta-purchases');
  const metaCreatedBy = document.getElementById('meta-created-by');
  const metaUpdatedAt = document.getElementById('meta-updated-at');

  // Navigation & Workspace elements
  const backBtn = document.getElementById('curriculum-back-btn');
  const viewTitle = document.getElementById('curriculum-view-title');
  const breadcrumbs = document.getElementById('curriculum-breadcrumbs');
  const actionContainer = document.getElementById('curriculum-action-container');
  const workspace = document.getElementById('curriculum-workspace');

  let currentCourse = null;
  let subjects = []; // Curriculum State Array

  // View state machine
  let currentView = 'subjects'; // 'subjects' | 'chapters' | 'lectures'
  let selectedSubjectIndex = null;
  let selectedChapterIndex = null;

  function setLoading(isLoading) {
    loadingState.classList.toggle('hidden', !isLoading);
  }

  function showError(message) {
    setLoading(false);
    editorState.classList.add('hidden');
    errorState.classList.remove('hidden');
    errorState.textContent = message;
  }

  function showEditor() {
    setLoading(false);
    errorState.classList.add('hidden');
    editorState.classList.remove('hidden');
  }

  function formatDate(dateValue) {
    if (!dateValue) return '-';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function escapeHtml(value) {
    if (!value) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatForDateTimeInput(dateValue) {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  // ── View Switcher Actions ───────────────────────────────────────────

  backBtn.addEventListener('click', () => {
    if (currentView === 'lectures') {
      currentView = 'chapters';
      selectedChapterIndex = null;
    } else if (currentView === 'chapters') {
      currentView = 'subjects';
      selectedSubjectIndex = null;
    }
    renderCurriculumWorkspace();
  });

  // ── Curriculum UI Renderer ───────────────────────────────────────────
  
  function renderCurriculumWorkspace() {
    workspace.innerHTML = '';
    actionContainer.innerHTML = '';

    // Calculate total lectures
    updateTotalLecturesCount();

    if (currentView === 'subjects') {
      // Setup Navigation Header
      backBtn.classList.add('hidden');
      viewTitle.textContent = 'Course Subjects';
      breadcrumbs.innerHTML = `
        <span class="text-slate-400">Syllabus</span>
        <i class="fas fa-chevron-right text-[8px] text-slate-300 mx-1"></i>
        <span class="text-slate-800 font-bold">Subjects</span>
      `;

      // Render Add Subject inline form
      const addForm = document.createElement('div');
      addForm.className = 'flex gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm';
      addForm.innerHTML = `
        <input type="text" id="new-subject-name" placeholder="Add Subject Name (e.g. Physics)" class="flex-grow px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-slate-400" />
        <button type="button" id="add-subject-confirm" class="px-4 py-2 bg-garud-accent text-white rounded-xl text-xs font-bold hover:opacity-90 shadow-sm transition">Add Subject</button>
      `;
      workspace.appendChild(addForm);

      const addBtn = addForm.querySelector('#add-subject-confirm');
      const addInput = addForm.querySelector('#new-subject-name');
      const performAdd = () => {
        const name = addInput.value.trim();
        if (!name) {
          toast.error('Subject name is required');
          return;
        }
        subjects.push({ name, chapters: [] });
        renderCurriculumWorkspace();
      };
      addBtn.addEventListener('click', performAdd);
      addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performAdd(); });

      // Render Subjects List
      if (subjects.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center py-8 bg-white border border-dashed border-slate-200 rounded-2xl';
        empty.innerHTML = `<p class="text-slate-400 text-xs">No subjects added yet. Add one above.</p>`;
        workspace.appendChild(empty);
      } else {
        subjects.forEach((subject, sIndex) => {
          const row = document.createElement('div');
          row.className = 'bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex items-center justify-between gap-3';
          row.innerHTML = `
            <input type="text" class="subject-name-input px-3.5 py-2 border border-slate-100 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-800 flex-grow" value="${escapeHtml(subject.name)}" placeholder="Subject Name" />
            <div class="flex items-center gap-2">
              <button type="button" class="view-chapters-btn px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition shadow-2xs">
                View Chapters (${subject.chapters ? subject.chapters.length : 0})
              </button>
              <button type="button" class="delete-subject-btn p-2 border border-red-100 hover:bg-red-50 text-red-500 rounded-xl transition shadow-2xs">
                <i class="fas fa-trash-alt text-xs"></i>
              </button>
            </div>
          `;

          // Change Name in State
          row.querySelector('.subject-name-input').addEventListener('input', (e) => {
            subject.name = e.target.value;
          });

          // Delete Subject
          row.querySelector('.delete-subject-btn').addEventListener('click', () => {
            const confirmed = window.confirm(`Delete subject "${subject.name || 'Untitled'}" and all of its chapters?`);
            if (confirmed) {
              subjects.splice(sIndex, 1);
              renderCurriculumWorkspace();
            }
          });

          // Navigate to Chapters
          row.querySelector('.view-chapters-btn').addEventListener('click', () => {
            currentView = 'chapters';
            selectedSubjectIndex = sIndex;
            renderCurriculumWorkspace();
          });

          workspace.appendChild(row);
        });
      }

    } else if (currentView === 'chapters') {
      const activeSubject = subjects[selectedSubjectIndex];

      // Setup Navigation Header
      backBtn.classList.remove('hidden');
      viewTitle.textContent = `Chapters: ${activeSubject.name || 'Untitled'}`;
      breadcrumbs.innerHTML = `
        <span class="text-slate-400">Syllabus</span>
        <i class="fas fa-chevron-right text-[8px] text-slate-300 mx-1"></i>
        <a href="javascript:void(0)" class="text-slate-400 hover:underline" id="breadcrumb-subjects">Subjects</a>
        <i class="fas fa-chevron-right text-[8px] text-slate-300 mx-1"></i>
        <span class="text-slate-800 font-bold">${escapeHtml(activeSubject.name)}</span>
      `;

      document.getElementById('breadcrumb-subjects').addEventListener('click', () => {
        currentView = 'subjects';
        selectedSubjectIndex = null;
        renderCurriculumWorkspace();
      });

      // Render Add Chapter inline form
      const addForm = document.createElement('div');
      addForm.className = 'flex gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm';
      addForm.innerHTML = `
        <input type="text" id="new-chapter-name" placeholder="Add Chapter Name (e.g. Kinematics)" class="flex-grow px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-slate-400" />
        <button type="button" id="add-chapter-confirm" class="px-4 py-2 bg-garud-accent text-white rounded-xl text-xs font-bold hover:opacity-90 shadow-sm transition">Add Chapter</button>
      `;
      workspace.appendChild(addForm);

      const addBtn = addForm.querySelector('#add-chapter-confirm');
      const addInput = addForm.querySelector('#new-chapter-name');
      const performAdd = () => {
        const name = addInput.value.trim();
        if (!name) {
          toast.error('Chapter name is required');
          return;
        }
        activeSubject.chapters = activeSubject.chapters || [];
        activeSubject.chapters.push({ name, lectures: [] });
        renderCurriculumWorkspace();
      };
      addBtn.addEventListener('click', performAdd);
      addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performAdd(); });

      // Render Chapters List
      const chapters = activeSubject.chapters || [];
      if (chapters.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center py-8 bg-white border border-dashed border-slate-200 rounded-2xl';
        empty.innerHTML = `<p class="text-slate-400 text-xs">No chapters added to this subject yet. Add one above.</p>`;
        workspace.appendChild(empty);
      } else {
        chapters.forEach((chapter, cIndex) => {
          const row = document.createElement('div');
          row.className = 'bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex items-center justify-between gap-3';
          row.innerHTML = `
            <input type="text" class="chapter-name-input px-3.5 py-2 border border-slate-100 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-800 flex-grow" value="${escapeHtml(chapter.name)}" placeholder="Chapter Name" />
            <div class="flex items-center gap-2">
              <button type="button" class="view-lectures-btn px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition shadow-2xs">
                Manage Lectures (${chapter.lectures ? chapter.lectures.length : 0})
              </button>
              <button type="button" class="delete-chapter-btn p-2 border border-red-100 hover:bg-red-50 text-red-500 rounded-xl transition shadow-2xs">
                <i class="fas fa-trash-alt text-xs"></i>
              </button>
            </div>
          `;

          // Change Name in State
          row.querySelector('.chapter-name-input').addEventListener('input', (e) => {
            chapter.name = e.target.value;
          });

          // Delete Chapter
          row.querySelector('.delete-chapter-btn').addEventListener('click', () => {
            const confirmed = window.confirm(`Delete chapter "${chapter.name || 'Untitled'}" and all of its lectures?`);
            if (confirmed) {
              activeSubject.chapters.splice(cIndex, 1);
              renderCurriculumWorkspace();
            }
          });

          // Navigate to Lectures
          row.querySelector('.view-lectures-btn').addEventListener('click', () => {
            currentView = 'lectures';
            selectedChapterIndex = cIndex;
            renderCurriculumWorkspace();
          });

          workspace.appendChild(row);
        });
      }

    } else if (currentView === 'lectures') {
      const activeSubject = subjects[selectedSubjectIndex];
      const activeChapter = activeSubject.chapters[selectedChapterIndex];

      // Setup Navigation Header
      backBtn.classList.remove('hidden');
      viewTitle.textContent = `Lectures: ${activeChapter.name || 'Untitled'}`;
      breadcrumbs.innerHTML = `
        <span class="text-slate-400">Syllabus</span>
        <i class="fas fa-chevron-right text-[8px] text-slate-300 mx-1"></i>
        <a href="javascript:void(0)" class="text-slate-400 hover:underline" id="breadcrumb-subjects">Subjects</a>
        <i class="fas fa-chevron-right text-[8px] text-slate-300 mx-1"></i>
        <a href="javascript:void(0)" class="text-slate-400 hover:underline" id="breadcrumb-chapters">${escapeHtml(activeSubject.name)}</a>
        <i class="fas fa-chevron-right text-[8px] text-slate-300 mx-1"></i>
        <span class="text-slate-800 font-bold">${escapeHtml(activeChapter.name)}</span>
      `;

      document.getElementById('breadcrumb-subjects').addEventListener('click', () => {
        currentView = 'subjects';
        selectedSubjectIndex = null;
        selectedChapterIndex = null;
        renderCurriculumWorkspace();
      });

      document.getElementById('breadcrumb-chapters').addEventListener('click', () => {
        currentView = 'chapters';
        selectedChapterIndex = null;
        renderCurriculumWorkspace();
      });

      // Top Action: Add Lecture Row button
      const topAction = document.createElement('div');
      topAction.className = 'flex justify-end';
      topAction.innerHTML = `
        <button type="button" id="add-lecture-confirm" class="px-4 py-2.5 bg-garud-accent text-white rounded-xl text-xs font-bold hover:opacity-90 shadow-sm transition">
          + Add New Lecture Link
        </button>
      `;
      workspace.appendChild(topAction);

      topAction.querySelector('#add-lecture-confirm').addEventListener('click', () => {
        activeChapter.lectures = activeChapter.lectures || [];
        activeChapter.lectures.push({
          title: '',
          videoLink: '',
          status: 'ended',
          scheduledAt: new Date(),
          pdfs: []
        });
        renderCurriculumWorkspace();
      });

      // Render Lectures List
      const lectures = activeChapter.lectures || [];
      if (lectures.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center py-8 bg-white border border-dashed border-slate-200 rounded-2xl';
        empty.innerHTML = `<p class="text-slate-400 text-xs">No lectures added to this chapter yet. Click "+ Add New Lecture Link" above.</p>`;
        workspace.appendChild(empty);
      } else {
        lectures.forEach((lecture, lIndex) => {
          const card = document.createElement('div');
          card.className = 'bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-sm relative';
          card.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Lecture ${lIndex + 1}</span>
              <button type="button" class="remove-lecture-btn px-2.5 py-1.5 rounded-xl border border-red-100 hover:bg-red-50 text-red-500 text-2xs font-bold transition">
                Delete Lecture
              </button>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Lecture Title</label>
                <input type="text" class="lecture-title-input px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none" placeholder="e.g. Intro to Trigonometry" value="${escapeHtml(lecture.title)}" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">YouTube Video Link</label>
                <input type="url" class="lecture-link-input px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none" placeholder="https://youtube.com/watch?v=..." value="${escapeHtml(lecture.videoLink)}" />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Session Status</label>
                <select class="lecture-status-input w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white focus:outline-none">
                  <option value="ended" ${lecture.status === 'ended' ? 'selected' : ''}>Recorded / Ended</option>
                  <option value="live" ${lecture.status === 'live' ? 'selected' : ''}>Live Session</option>
                  <option value="scheduled" ${lecture.status === 'scheduled' ? 'selected' : ''}>Scheduled Session</option>
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Scheduled Date/Time</label>
                <input type="datetime-local" class="lecture-time-input w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none" value="${formatForDateTimeInput(lecture.scheduledAt)}" />
              </div>
            </div>
            
            <!-- PDFs Section -->
            <div class="border border-slate-100 rounded-2xl p-3 bg-slate-50/70 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">PDF Attachments & Notes</span>
                <button type="button" class="add-pdf-btn px-2.5 py-1 bg-slate-700 text-white rounded-lg text-2xs font-bold hover:bg-slate-800 transition shadow-2xs">+ Add PDF</button>
              </div>
              <div class="pdfs-list space-y-2"></div>
            </div>
          `;

          // Inputs Change Events
          card.querySelector('.lecture-title-input').addEventListener('input', (e) => {
            lecture.title = e.target.value;
          });
          card.querySelector('.lecture-link-input').addEventListener('input', (e) => {
            lecture.videoLink = e.target.value;
          });
          card.querySelector('.lecture-status-input').addEventListener('change', (e) => {
            lecture.status = e.target.value;
          });
          card.querySelector('.lecture-time-input').addEventListener('change', (e) => {
            lecture.scheduledAt = e.target.value ? new Date(e.target.value) : new Date();
          });

          // Delete Lecture
          card.querySelector('.remove-lecture-btn').addEventListener('click', () => {
            const confirmed = window.confirm(`Delete lecture "${lecture.title || 'Untitled'}"?`);
            if (confirmed) {
              activeChapter.lectures.splice(lIndex, 1);
              renderCurriculumWorkspace();
            }
          });

          // Add PDF
          card.querySelector('.add-pdf-btn').addEventListener('click', () => {
            lecture.pdfs = lecture.pdfs || [];
            lecture.pdfs.push({ title: '', link: '' });
            renderCurriculumWorkspace();
          });

          const pdfsList = card.querySelector('.pdfs-list');
          const pdfs = lecture.pdfs || [];

          if (pdfs.length === 0) {
            pdfsList.innerHTML = `<p class="text-2xs text-slate-400 italic">No PDF documents attached.</p>`;
          } else {
            pdfs.forEach((pdf, pIndex) => {
              const pdfRow = document.createElement('div');
              pdfRow.className = 'grid grid-cols-[1fr_1.4fr_auto] gap-2 items-center';
              pdfRow.innerHTML = `
                <input type="text" class="pdf-title-input px-3 py-1.5 border border-slate-200 rounded-lg text-xs" placeholder="Document Title" value="${escapeHtml(pdf.title)}" />
                <input type="url" class="pdf-link-input px-3 py-1.5 border border-slate-200 rounded-lg text-xs" placeholder="Zenodo / PDF URL" value="${escapeHtml(pdf.link)}" />
                <button type="button" class="remove-pdf-btn text-red-500 hover:text-red-600 font-bold text-xs p-1">✕</button>
              `;

              pdfRow.querySelector('.pdf-title-input').addEventListener('input', (e) => {
                pdf.title = e.target.value;
              });
              pdfRow.querySelector('.pdf-link-input').addEventListener('input', (e) => {
                pdf.link = e.target.value;
              });
              pdfRow.querySelector('.remove-pdf-btn').addEventListener('click', () => {
                lecture.pdfs.splice(pIndex, 1);
                renderCurriculumWorkspace();
              });

              pdfsList.appendChild(pdfRow);
            });
          }

          workspace.appendChild(card);
        });
      }
    }
  }

  function updateTotalLecturesCount() {
    let count = 0;
    subjects.forEach(s => {
      if (s && Array.isArray(s.chapters)) {
        s.chapters.forEach(c => {
          if (c && Array.isArray(c.lectures)) {
            count += c.lectures.length;
          }
        });
      }
    });
    metaLectures.textContent = String(count);
  }

  // ── Form Hydration ───────────────────────────────────────────────────

  function hydrateForm(course) {
    pageTitle.textContent = `Edit Course: ${course.name || ''}`;
    nameInput.value = course.name || '';
    descriptionInput.value = course.description || '';
    priceInput.value = String(course.price || 0);
    madeForInput.value = course.madeFor || 'other';
    imageInput.value = course.image || '';
    tagsInput.value = Array.isArray(course.tags) ? course.tags.join(', ') : '';
    publishedInput.checked = !!course.isPublished;

    // Load curriculum subjects
    subjects = Array.isArray(course.subjects) ? JSON.parse(JSON.stringify(course.subjects)) : [];
    
    // Always start at Subjects view
    currentView = 'subjects';
    selectedSubjectIndex = null;
    selectedChapterIndex = null;
    
    renderCurriculumWorkspace();

    metaPurchases.textContent = String(Array.isArray(course.purchasedBy) ? course.purchasedBy.length : 0);
    metaCreatedBy.textContent = course.createdBy?.name || '-';
    metaUpdatedAt.textContent = formatDate(course.updatedAt);
  }

  function setSubmitting(isSubmitting) {
    saveBtn.disabled = isSubmitting;
    saveBtn.textContent = isSubmitting ? 'Updating...' : 'Update Course';
  }

  async function loadCourse() {
    setLoading(true);
    try {
      currentCourse = await API.get(`/courses/admin/${courseId}`);
      hydrateForm(currentCourse);
      showEditor();
    } catch (error) {
      showError(error.message || 'Failed to load course');
    }
  }

  deleteBtn.addEventListener('click', async () => {
    if (!currentCourse) return;

    const confirmed = window.confirm(`Delete ${currentCourse.name}? This will remove all syllabus subjects and lectures.`);
    if (!confirmed) return;

    try {
      await API.delete(`/courses/${courseId}`);
      toast.success('Course deleted successfully');
      window.location.href = '/admin/live-classes';
    } catch (error) {
      toast.error(error.message || 'Failed to delete course');
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

      await API.put(`/courses/${courseId}`, payload);
      await API.put(`/courses/${courseId}/subjects`, { subjects });
      toast.success('Course updated successfully');
      await loadCourse();
    } catch (error) {
      toast.error(error.message || 'Failed to update course');
    } finally {
      setSubmitting(false);
    }
  });

  // Details Modal Interactions
  const editDetailsBtn = document.getElementById('edit-details-btn');
  const detailsModal = document.getElementById('details-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const saveModalBtn = document.getElementById('save-modal-btn');

  if (editDetailsBtn && detailsModal) {
    editDetailsBtn.addEventListener('click', () => {
      detailsModal.classList.remove('hidden');
    });
  }

  const hideModal = () => {
    if (detailsModal) detailsModal.classList.add('hidden');
  };

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', hideModal);
  }
  if (saveModalBtn) {
    saveModalBtn.addEventListener('click', hideModal);
  }
  if (detailsModal) {
    detailsModal.addEventListener('click', (e) => {
      if (e.target === detailsModal) {
        hideModal();
      }
    });
  }

  await loadCourse();
});
