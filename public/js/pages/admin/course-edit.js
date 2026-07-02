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
  
  // Prompt Modal Helper
  function showPromptModal(title, label, defaultValue, onSave) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-slate-900/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm';
    
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden transform scale-100 animate-fade-in-up">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-800">${escapeHtml(title)}</h3>
          <button type="button" class="close-btn text-slate-400 hover:text-slate-600 font-bold">✕</button>
        </div>
        <div class="p-5">
          <label class="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">${escapeHtml(label)}</label>
          <input type="text" class="prompt-input w-full px-3 py-2 border border-slate-200 focus:border-blue-500 rounded-lg text-sm font-semibold focus:outline-none" value="${escapeHtml(defaultValue)}" />
        </div>
        <div class="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button type="button" class="cancel-btn px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition">Cancel</button>
          <button type="button" class="save-btn px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition shadow-sm flex items-center gap-1">
            Save
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const input = modal.querySelector('.prompt-input');
    input.focus();
    input.select();

    const close = () => modal.remove();

    modal.querySelector('.close-btn').addEventListener('click', close);
    modal.querySelector('.cancel-btn').addEventListener('click', close);

    const handleSave = async () => {
      const val = input.value.trim();
      if (!val) return toast.error('Value cannot be empty');
      
      const saveBtn = modal.querySelector('.save-btn');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      
      try {
        await onSave(val);
        close();
      } catch (err) {
        toast.error(err.message || 'Error saving');
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Save';
      }
    };

    modal.querySelector('.save-btn').addEventListener('click', handleSave);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSave(); });
  }

  // Lecture Modal Helper
  function showLectureModal(lecture, activeSubjectId, activeChapterId, onSaved) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-slate-900/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto';
    
    let tempPdfs = JSON.parse(JSON.stringify(lecture.pdfs || []));

    const renderPdfsList = (container) => {
      container.innerHTML = '';
      if (tempPdfs.length === 0) {
        container.innerHTML = '<p class="text-[11px] text-slate-400 italic">No notes attached.</p>';
        return;
      }
      tempPdfs.forEach((pdf, pIndex) => {
        const row = document.createElement('div');
        row.className = 'flex flex-col sm:flex-row items-center gap-2 bg-white p-2 rounded-lg border border-slate-200';
        row.innerHTML = `
          <i class="fas fa-file-pdf text-red-500 text-sm hidden sm:block mx-1"></i>
          <input type="text" class="pdf-title w-full sm:flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none focus:border-blue-500" placeholder="Doc Title" value="${escapeHtml(pdf.title)}" />
          <input type="url" class="pdf-link w-full sm:flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none focus:border-blue-500" placeholder="URL" value="${escapeHtml(pdf.link)}" />
          <button type="button" class="remove-pdf-btn text-slate-400 hover:text-red-500 p-1 w-full sm:w-auto text-right"><i class="fas fa-times"></i></button>
        `;
        
        row.querySelector('.pdf-title').addEventListener('input', (e) => tempPdfs[pIndex].title = e.target.value.trim());
        row.querySelector('.pdf-link').addEventListener('input', (e) => tempPdfs[pIndex].link = e.target.value.trim());
        row.querySelector('.remove-pdf-btn').addEventListener('click', () => {
          tempPdfs.splice(pIndex, 1);
          renderPdfsList(container);
        });

        container.appendChild(row);
      });
    };

    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 class="text-sm font-bold text-slate-800">Edit Lecture</h3>
          <button type="button" class="close-btn text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
        </div>
        
        <div class="p-6 space-y-5">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label class="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Lecture Title</label>
              <input type="text" id="lec-title" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-blue-500" value="${escapeHtml(lecture.title)}" />
            </div>
            <div>
              <label class="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Video Link (YouTube)</label>
              <input type="url" id="lec-link" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-blue-500" value="${escapeHtml(lecture.videoLink)}" />
            </div>
          </div>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label class="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
              <select id="lec-status" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-blue-500 bg-white">
                <option value="ended" ${lecture.status === 'ended' ? 'selected' : ''}>Recorded / Ended</option>
                <option value="live" ${lecture.status === 'live' ? 'selected' : ''}>Live Session</option>
                <option value="scheduled" ${lecture.status === 'scheduled' ? 'selected' : ''}>Scheduled Session</option>
                <option value="cancelled" ${lecture.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Scheduled Date & Time</label>
              <input type="datetime-local" id="lec-time" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-blue-500" value="${formatForDateTimeInput(lecture.scheduledAt)}" />
            </div>
          </div>
          
          <div class="border border-slate-200 rounded-xl p-4 bg-slate-50">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">PDF Attachments</span>
              <button type="button" id="add-pdf-btn" class="px-3 py-1.5 bg-white border border-slate-200 shadow-sm hover:bg-slate-100 rounded-lg text-[10px] font-bold transition">+ Add PDF</button>
            </div>
            <div id="pdf-container" class="space-y-2"></div>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button type="button" class="cancel-btn px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition">Cancel</button>
          <button type="button" class="save-btn px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition shadow-sm flex items-center gap-2">
            Save Lecture
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    
    const pdfContainer = modal.querySelector('#pdf-container');
    renderPdfsList(pdfContainer);

    modal.querySelector('#add-pdf-btn').addEventListener('click', () => {
      tempPdfs.push({ title: '', link: '' });
      renderPdfsList(pdfContainer);
    });

    const close = () => modal.remove();
    modal.querySelector('.close-btn').addEventListener('click', close);
    modal.querySelector('.cancel-btn').addEventListener('click', close);

    modal.querySelector('.save-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

      const updateData = {
        title: modal.querySelector('#lec-title').value.trim(),
        videoLink: modal.querySelector('#lec-link').value.trim(),
        status: modal.querySelector('#lec-status').value,
        scheduledAt: modal.querySelector('#lec-time').value ? new Date(modal.querySelector('#lec-time').value) : new Date(),
        pdfs: tempPdfs.filter(p => p.title || p.link)
      };

      try {
        await API.put(`/courses/${courseId}/subjects/${activeSubjectId}/chapters/${activeChapterId}/lectures/${lecture._id}`, updateData);
        Object.assign(lecture, updateData);
        toast.success('Lecture updated successfully');
        onSaved();
        close();
      } catch (err) {
        toast.error(err.message || 'Failed to update lecture');
        btn.disabled = false;
        btn.innerHTML = 'Save Lecture';
      }
    });
  }

  function renderCurriculumWorkspace() {
    workspace.innerHTML = '';
    actionContainer.innerHTML = '';

    updateTotalLecturesCount();

    if (currentView === 'subjects') {
      backBtn.classList.add('hidden');
      viewTitle.textContent = 'Course Subjects';
      breadcrumbs.innerHTML = `
        <span class="text-slate-400">Syllabus</span>
        <i class="fas fa-chevron-right text-[8px] text-slate-300 mx-1"></i>
        <span class="text-slate-800 font-bold">Subjects</span>
      `;

      actionContainer.innerHTML = `
        <button type="button" id="add-subject-confirm" class="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-sm transition">
          <i class="fas fa-spinner fa-spin hidden mr-1" id="add-subject-spinner"></i> + Add Subject
        </button>
      `;

      const performAddSubject = async () => {
        const btn = actionContainer.querySelector('#add-subject-confirm');
        const spinner = actionContainer.querySelector('#add-subject-spinner');
        btn.disabled = true; spinner.classList.remove('hidden');
        try {
          const res = await API.post(`/courses/${courseId}/subjects/granular`, { name: 'New Subject' });
          subjects.push(res);
          renderCurriculumWorkspace();
          toast.success('Subject added');
        } catch(err) {
          toast.error(err.message || 'Failed to add subject');
        } finally {
          btn.disabled = false; spinner.classList.add('hidden');
        }
      };
      actionContainer.querySelector('#add-subject-confirm').addEventListener('click', performAddSubject);

      const grid = document.createElement('div');
      
      if (subjects.length === 0) {
        grid.className = "w-full text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl";
        grid.innerHTML = `<p class="text-slate-400 text-xs italic">No subjects added yet. Click "+ Add Subject" to begin.</p>`;
      } else {
        grid.className = "flex flex-col gap-4";
        
        subjects.forEach((subject, sIndex) => {
          const card = document.createElement('div');
          card.className = "bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between group";
          
          let lectureCount = 0;
          let docCount = 0;
          if (subject.chapters) {
            subject.chapters.forEach(c => {
              if (c.lectures) {
                lectureCount += c.lectures.length;
                c.lectures.forEach(l => {
                  if (l.pdfs) docCount += l.pdfs.length;
                });
              }
            });
          }

          card.innerHTML = `
            <div class="flex items-center gap-4 flex-1">
              <div class="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <i class="fas fa-folder text-blue-500 text-lg"></i>
              </div>
              <div>
                <h4 class="text-base font-bold text-slate-800 group-hover:text-blue-600 transition">${escapeHtml(subject.name || 'Untitled')}</h4>
                <div class="flex items-center gap-4 mt-1">
                  <span class="text-[11px] font-bold text-slate-500"><i class="fas fa-book-open mr-1 text-slate-400"></i>${subject.chapters ? subject.chapters.length : 0} Chapters</span>
                  <span class="text-[11px] font-bold text-slate-500"><i class="fas fa-play-circle mr-1 text-slate-400"></i>${lectureCount} Lectures</span>
                  <span class="text-[11px] font-bold text-slate-500"><i class="fas fa-file-pdf mr-1 text-slate-400"></i>${docCount} Documents</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button type="button" class="edit-subject-btn w-9 h-9 rounded-lg bg-slate-50 hover:bg-slate-200 text-slate-600 transition flex items-center justify-center border border-slate-200" title="Edit Name">
                <i class="fas fa-pen text-xs"></i>
              </button>
              <button type="button" class="delete-subject-btn w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition flex items-center justify-center border border-red-100" title="Delete Subject">
                <i class="fas fa-trash-alt text-xs"></i>
              </button>
              <i class="fas fa-chevron-right text-slate-300 ml-2 group-hover:text-blue-500 transition"></i>
            </div>
          `;

          card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return; // Ignore if clicking action buttons
            currentView = 'chapters';
            selectedSubjectIndex = sIndex;
            renderCurriculumWorkspace();
          });

          card.querySelector('.edit-subject-btn').addEventListener('click', (e) => {
            showPromptModal('Rename Subject', 'Subject Name', subject.name, async (newName) => {
              await API.put(`/courses/${courseId}/subjects/${subject._id}`, { name: newName });
              subject.name = newName;
              renderCurriculumWorkspace();
              toast.success('Subject renamed');
            });
          });

          card.querySelector('.delete-subject-btn').addEventListener('click', async (e) => {
            if (window.confirm(`Delete subject "${subject.name || 'Untitled'}" and all of its contents?`)) {
              const btn = e.currentTarget;
              btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i>';
              try {
                await API.delete(`/courses/${courseId}/subjects/${subject._id}`);
                subjects.splice(sIndex, 1);
                renderCurriculumWorkspace();
                toast.success('Subject deleted');
              } catch(err) {
                toast.error(err.message || 'Failed to delete subject');
                btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash-alt text-xs"></i>';
              }
            }
          });

          grid.appendChild(card);
        });
      }
      workspace.appendChild(grid);

    } else if (currentView === 'chapters') {
      const activeSubject = subjects[selectedSubjectIndex];

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

      actionContainer.innerHTML = `
        <button type="button" id="add-chapter-confirm" class="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-sm transition">
          <i class="fas fa-spinner fa-spin hidden mr-1" id="add-chapter-spinner"></i> + Add Chapter
        </button>
      `;

      const performAddChapter = async () => {
        const btn = actionContainer.querySelector('#add-chapter-confirm');
        const spinner = actionContainer.querySelector('#add-chapter-spinner');
        btn.disabled = true; spinner.classList.remove('hidden');
        try {
          const res = await API.post(`/courses/${courseId}/subjects/${activeSubject._id}/chapters`, { name: 'New Chapter' });
          activeSubject.chapters = activeSubject.chapters || [];
          activeSubject.chapters.push(res);
          renderCurriculumWorkspace();
          toast.success('Chapter added');
        } catch(err) {
          toast.error(err.message || 'Failed to add chapter');
        } finally {
          btn.disabled = false; spinner.classList.add('hidden');
        }
      };
      actionContainer.querySelector('#add-chapter-confirm').addEventListener('click', performAddChapter);

      const chapters = activeSubject.chapters || [];
      const grid = document.createElement('div');

      if (chapters.length === 0) {
        grid.className = "w-full text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl";
        grid.innerHTML = `<p class="text-slate-400 text-xs italic">No chapters added to this subject yet.</p>`;
      } else {
        grid.className = "flex flex-col gap-4";
        
        chapters.forEach((chapter, cIndex) => {
          const card = document.createElement('div');
          card.className = "bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between group";
          
          const lectureCount = chapter.lectures ? chapter.lectures.length : 0;
          let docCount = 0;
          if (chapter.lectures) {
            chapter.lectures.forEach(l => { if(l.pdfs) docCount += l.pdfs.length; });
          }
          const chapterNumStr = String(cIndex + 1).padStart(2, '0');

          card.innerHTML = `
            <div class="flex items-center gap-4 flex-1">
              <div class="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                <span class="text-[10px] font-extrabold text-indigo-500">CH ${chapterNumStr}</span>
              </div>
              <div>
                <h4 class="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition">${escapeHtml(chapter.name || 'Untitled')}</h4>
                <div class="flex items-center gap-4 mt-1">
                  <span class="text-[11px] font-bold text-slate-500"><i class="fas fa-play-circle mr-1 text-slate-400"></i>${lectureCount} Lectures</span>
                  <span class="text-[11px] font-bold text-slate-500"><i class="fas fa-file-pdf mr-1 text-slate-400"></i>${docCount} Documents</span>
                </div>
              </div>
            </div>
            
            <div class="flex items-center gap-2 shrink-0">
              <button type="button" class="edit-chapter-btn w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-200 text-slate-600 transition flex items-center justify-center border border-slate-200" title="Edit Name">
                <i class="fas fa-pen text-[10px]"></i>
              </button>
              <button type="button" class="delete-chapter-btn w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition flex items-center justify-center border border-red-100" title="Delete Chapter">
                <i class="fas fa-trash-alt text-[10px]"></i>
              </button>
              <i class="fas fa-chevron-right text-slate-300 ml-2 group-hover:text-blue-500 transition"></i>
            </div>
          `;

          card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            currentView = 'lectures';
            selectedChapterIndex = cIndex;
            renderCurriculumWorkspace();
          });

          card.querySelector('.edit-chapter-btn').addEventListener('click', (e) => {
            showPromptModal('Rename Chapter', 'Chapter Name', chapter.name, async (newName) => {
              await API.put(`/courses/${courseId}/subjects/${activeSubject._id}/chapters/${chapter._id}`, { name: newName });
              chapter.name = newName;
              renderCurriculumWorkspace();
              toast.success('Chapter renamed');
            });
          });

          card.querySelector('.delete-chapter-btn').addEventListener('click', async (e) => {
            if (window.confirm(`Delete chapter "${chapter.name || 'Untitled'}" and all of its lectures?`)) {
              const btn = e.currentTarget;
              btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin text-[10px]"></i>';
              try {
                await API.delete(`/courses/${courseId}/subjects/${activeSubject._id}/chapters/${chapter._id}`);
                activeSubject.chapters.splice(cIndex, 1);
                renderCurriculumWorkspace();
                toast.success('Chapter deleted');
              } catch(err) {
                toast.error(err.message || 'Failed to delete chapter');
                btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash-alt text-[10px]"></i>';
              }
            }
          });

          grid.appendChild(card);
        });
      }
      workspace.appendChild(grid);

    } else if (currentView === 'lectures') {
      const activeSubject = subjects[selectedSubjectIndex];
      const activeChapter = activeSubject.chapters[selectedChapterIndex];

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

      actionContainer.innerHTML = `
        <button type="button" id="add-lecture-confirm" class="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-sm transition">
          <i class="fas fa-spinner fa-spin hidden mr-1" id="add-lecture-spinner"></i> + Add Lecture
        </button>
      `;

      actionContainer.querySelector('#add-lecture-confirm').addEventListener('click', async () => {
        const btn = actionContainer.querySelector('#add-lecture-confirm');
        const spinner = actionContainer.querySelector('#add-lecture-spinner');
        btn.disabled = true; spinner.classList.remove('hidden');
        try {
          const res = await API.post(`/courses/${courseId}/subjects/${activeSubject._id}/chapters/${activeChapter._id}/lectures`, { 
            title: 'New Lecture',
            videoLink: '',
            status: 'ended',
            scheduledAt: new Date(),
            pdfs: []
          });
          activeChapter.lectures = activeChapter.lectures || [];
          activeChapter.lectures.push(res);
          renderCurriculumWorkspace();
          toast.success('Lecture added');
        } catch(err) {
          toast.error(err.message || 'Failed to add lecture');
        } finally {
          btn.disabled = false; spinner.classList.add('hidden');
        }
      });

      const lectures = activeChapter.lectures || [];
      const grid = document.createElement('div');

      if (lectures.length === 0) {
        grid.className = "w-full text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl";
        grid.innerHTML = `<p class="text-slate-400 text-xs italic">No lectures added to this chapter yet.</p>`;
      } else {
        grid.className = "flex flex-col gap-3";
        
        lectures.forEach((lecture, lIndex) => {
          const card = document.createElement('div');
          card.className = "relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between p-4 group";
          
          const isLive = lecture.status === 'live';
          const isCancelled = lecture.status === 'cancelled';
          const badgeColor = isLive ? 'bg-red-500' : isCancelled ? 'bg-slate-400' : 'bg-green-500';
          const docCount = lecture.pdfs ? lecture.pdfs.length : 0;

          card.innerHTML = `
            <div class="absolute left-0 top-0 bottom-0 w-1 ${badgeColor}"></div>
            <div class="flex items-center gap-4 flex-1 pl-2">
              <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0">
                <span class="text-xs font-bold text-slate-500">${lIndex + 1}</span>
              </div>
              <div>
                <h4 class="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition">${escapeHtml(lecture.title || 'Untitled')}</h4>
                <div class="flex items-center gap-3 mt-1">
                  <span class="text-[10px] font-bold text-slate-500 uppercase"><i class="fas fa-circle text-[8px] mr-1 ${isLive ? 'text-red-500' : isCancelled ? 'text-slate-300' : 'text-slate-400'}"></i>${lecture.status}</span>
                  <span class="text-[10px] font-bold text-slate-500"><i class="fas fa-calendar-alt mr-1 text-slate-400"></i>${new Date(lecture.scheduledAt).toLocaleString()}</span>
                  <span class="text-[10px] font-bold text-slate-500"><i class="fas fa-file-pdf mr-1 text-slate-400"></i>${docCount} Attachments</span>
                </div>
              </div>
            </div>
            
            <div class="flex items-center gap-2 shrink-0">
              <button type="button" class="delete-lecture-btn w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition flex items-center justify-center border border-red-100" title="Delete Lecture">
                <i class="fas fa-trash-alt text-[10px]"></i>
              </button>
              <button type="button" class="edit-lecture-btn px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-bold text-xs border border-blue-100 hover:bg-blue-100 transition shadow-sm ml-2">
                Edit Details
              </button>
            </div>
          `;

          card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            showLectureModal(lecture, activeSubject._id, activeChapter._id, () => renderCurriculumWorkspace());
          });

          card.querySelector('.edit-lecture-btn').addEventListener('click', (e) => {
            showLectureModal(lecture, activeSubject._id, activeChapter._id, () => renderCurriculumWorkspace());
          });

          card.querySelector('.delete-lecture-btn').addEventListener('click', async (e) => {
            if (window.confirm(`Delete lecture "${lecture.title || 'Untitled'}"?`)) {
              const btn = e.currentTarget;
              btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin text-[10px]"></i>';
              try {
                await API.delete(`/courses/${courseId}/subjects/${activeSubject._id}/chapters/${activeChapter._id}/lectures/${lecture._id}`);
                activeChapter.lectures.splice(lIndex, 1);
                renderCurriculumWorkspace();
                toast.success('Lecture deleted');
              } catch(err) {
                toast.error(err.message || 'Failed to delete lecture');
                btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash-alt text-[10px]"></i>';
              }
            }
          });

          grid.appendChild(card);
        });
      }
      workspace.appendChild(grid);
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
    renderCourseTests();

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
        tests: (currentCourse.tests || []).map(t => t._id)
      };

      await API.put(`/courses/${courseId}`, payload);
      toast.success('Course updated successfully');
      hideModal();
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
  const closeModalCancelBtn = document.getElementById('close-modal-cancel-btn');

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
  if (closeModalCancelBtn) {
    closeModalCancelBtn.addEventListener('click', hideModal);
  }
  if (detailsModal) {
    detailsModal.addEventListener('click', (e) => {
      if (e.target === detailsModal) {
        hideModal();
      }
    });
  }

  // Tests Logic
  const addTestBtn = document.getElementById('add-test-btn');
  const addTestModal = document.getElementById('add-test-modal');
  const closeTestModalBtn = document.getElementById('close-test-modal-btn');
  const availableTestsSelect = document.getElementById('available-tests-select');
  const confirmAddTestBtn = document.getElementById('confirm-add-test-btn');
  const courseTestsList = document.getElementById('course-tests-list');
  let availableTests = [];

  const hideTestModal = () => {
    if (addTestModal) addTestModal.classList.add('hidden');
  };

  if (addTestBtn && addTestModal) {
    addTestBtn.addEventListener('click', async () => {
      addTestModal.classList.remove('hidden');
      availableTestsSelect.innerHTML = '<option value="">Loading tests...</option>';
      try {
        const tests = await API.get('/tests/admin/all');
        availableTests = tests.filter(t => t.isPublished); // Only show published tests
        if (availableTests.length === 0) {
          availableTestsSelect.innerHTML = '<option value="">No published tests found</option>';
        } else {
          availableTestsSelect.innerHTML = '<option value="">-- Select a Test to Attach --</option>' + 
            availableTests.map(t => `<option value="${t._id}">${escapeHtml(t.name)} (${t.duration} mins, ${t.testType})</option>`).join('');
        }
      } catch (err) {
        availableTestsSelect.innerHTML = '<option value="">Failed to load tests</option>';
      }
    });
  }

  if (closeTestModalBtn) closeTestModalBtn.addEventListener('click', hideTestModal);
  if (addTestModal) addTestModal.addEventListener('click', (e) => {
    if (e.target === addTestModal) hideTestModal();
  });

  if (confirmAddTestBtn) {
    confirmAddTestBtn.addEventListener('click', () => {
      const selectedId = availableTestsSelect.value;
      if (!selectedId) {
        toast.error('Please select a test');
        return;
      }
      
      currentCourse.tests = currentCourse.tests || [];
      if (currentCourse.tests.find(t => t._id === selectedId)) {
        toast.error('Test is already attached to this course');
        return;
      }

      const testToAdd = availableTests.find(t => t._id === selectedId);
      if (testToAdd) {
        currentCourse.tests.push(testToAdd);
        renderCourseTests();
        hideTestModal();
        toast.success('Test attached (Make sure to click Update Course)');
      }
    });
  }

  function renderCourseTests() {
    if (!courseTestsList) return;
    const tests = currentCourse.tests || [];
    
    if (tests.length === 0) {
      courseTestsList.innerHTML = `<div class="text-center py-6 border border-dashed border-slate-200 rounded-xl bg-white"><p class="text-slate-400 text-xs">No tests attached to this course.</p></div>`;
      return;
    }

    courseTestsList.innerHTML = tests.map((test, index) => `
      <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex items-center justify-between gap-3">
        <div class="flex flex-col">
          <span class="text-xs font-bold text-slate-800">${escapeHtml(test.name)}</span>
          <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">${test.duration} mins • ${test.testType}</span>
        </div>
        <button type="button" class="remove-test-btn p-2 border border-red-100 hover:bg-red-50 text-red-500 rounded-lg transition shadow-2xs" data-index="${index}">
          <i class="fas fa-trash-alt text-xs"></i>
        </button>
      </div>
    `).join('');

    courseTestsList.querySelectorAll('.remove-test-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        const testName = tests[index].name;
        if (window.confirm(`Remove test "${testName}" from this course?`)) {
          tests.splice(index, 1);
          renderCourseTests();
          toast.success('Test removed (Make sure to click Update Course)');
        }
      });
    });
  }

  // Tab Switching Logic
  const tabContainer = document.getElementById('tab-container');
  const sectionCurriculum = document.getElementById('section-curriculum');
  const sectionTests = document.getElementById('section-tests');

  if (tabContainer) {
    const tabBtns = tabContainer.querySelectorAll('button[data-tab]');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        
        // Update styling
        tabBtns.forEach(b => {
          b.classList.remove('border-blue-600', 'text-blue-600');
          b.classList.add('border-transparent', 'text-slate-500');
        });
        btn.classList.remove('border-transparent', 'text-slate-500');
        btn.classList.add('border-blue-600', 'text-blue-600');

        // Toggle sections
        if (tab === 'content') {
          sectionCurriculum.classList.remove('hidden');
          sectionTests.classList.add('hidden');
        } else {
          sectionCurriculum.classList.add('hidden');
          sectionTests.classList.remove('hidden');
        }
      });
    });
  }

  await loadCourse();
});
