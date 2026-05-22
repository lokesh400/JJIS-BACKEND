/**
 * pages/question-upload.js
 */
document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuthAny(['admin', 'coordinator']);
  if (!user) return;

  // ── Populate dropdowns ────────────────────────────────────────────
  async function loadSubjects() {
    try {
      const subjects = await API.get('/subjects');
      const sel = document.getElementById('sel-subject');
      sel.innerHTML = '<option value="">Select Subject</option>' +
        subjects.map(s => `<option value="${s._id}">${s.name}</option>`).join('');
    } catch { toast.error('Failed to load subjects'); }
  }

  async function loadChapters(subjectId) {
    const sel = document.getElementById('sel-chapter');
    sel.innerHTML = '<option value="">Select Chapter</option>';
    document.getElementById('sel-topic').innerHTML = '<option value="">Select Topic</option>';
    if (!subjectId) return;
    try {
      const chapters = await API.get(`/chapters/subject/${subjectId}`);
      sel.innerHTML = '<option value="">Select Chapter</option>' +
        chapters.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    } catch { toast.error('Failed to load chapters'); }
  }

  async function loadTopics(chapterId) {
    const sel = document.getElementById('sel-topic');
    sel.innerHTML = '<option value="">Select Topic</option>';
    if (!chapterId) return;
    try {
      const topics = await API.get(`/topics/chapter/${chapterId}`);
      sel.innerHTML = '<option value="">Select Topic</option>' +
        topics.map(t => `<option value="${t._id}">${t.name}</option>`).join('');
    } catch { toast.error('Failed to load topics'); }
  }

  document.getElementById('sel-subject').addEventListener('change', e => loadChapters(e.target.value));
  document.getElementById('sel-chapter').addEventListener('change', e => loadTopics(e.target.value));

  // Paste-mode type toggle
  document.getElementById('sel-type').addEventListener('change', (e) => {
    const type = e.target.value;
    document.getElementById('mcq-options').classList.toggle('hidden', type !== 'mcq');
    document.getElementById('msq-options').classList.toggle('hidden', type !== 'msq');
    document.getElementById('numerical-options').classList.toggle('hidden', type !== 'numerical');
  });

  // ── Filename parser ───────────────────────────────────────────────
  // Format: "{qNum}-{answer}.ext"
  //   answer = A/B/C/D             → MCQ        (e.g. 1-A.jpg)
  //   answer = A,B  or  A,B,C …  → MSQ        (e.g. 2-A,B,C.jpg)
  //   answer = number              → Numerical  (e.g. 3-120.jpg)
  function parseFilename(filename) {
    const base    = filename.replace(/\.[^/.]+$/, '').trim(); // strip extension
    const dashIdx = base.indexOf('-');
    if (dashIdx === -1) return null;
    const qNum   = base.slice(0, dashIdx).trim();
    const answer = base.slice(dashIdx + 1).trim();
    if (!answer) return null;

    // MSQ: two or more comma-separated option letters, e.g. "A,B" or "A,B,C"
    if (/^[A-Da-d](,[A-Da-d])+$/.test(answer)) {
      const opts = answer.split(',').map(o => o.toUpperCase());
      return { qNum, type: 'msq', correctOptions: opts };
    }
    // MCQ: single letter
    if (/^[A-Da-d]$/.test(answer)) {
      return { qNum, type: 'mcq', correctOption: answer.toUpperCase() };
    }
    // Numerical
    const num = parseFloat(answer);
    if (!isNaN(num)) {
      return { qNum, type: 'numerical', correctNumericalAnswer: num };
    }
    return null; // unrecognised format
  }

  // ── Badge helper (reused by file-list preview and live upload rows) ─
  function parsedBadge(parsed) {
    if (parsed.type === 'msq') {
      return `<span class="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">MSQ · ${parsed.correctOptions.join(',')}</span>`;
    }
    if (parsed.type === 'mcq') {
      return `<span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">MCQ · ${parsed.correctOption}</span>`;
    }
    return `<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Num · ${parsed.correctNumericalAnswer}</span>`;
  }

  // ── Tab switching ─────────────────────────────────────────────────
  let pastedFile = null;
  let imageTab   = 'file';

  window.setImageTab = function(tab) {
    imageTab = tab;
    document.getElementById('zone-file')           .classList.toggle('hidden', tab !== 'file');
    document.getElementById('zone-paste')          .classList.toggle('hidden', tab !== 'paste');
    document.getElementById('manual-answer-fields').classList.toggle('hidden', tab !== 'paste');
    document.getElementById('tab-file') .className = `flex-1 py-1.5 transition ${tab === 'file'  ? 'bg-garud-accent text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`;
    document.getElementById('tab-paste').className = `flex-1 py-1.5 transition ${tab === 'paste' ? 'bg-garud-accent text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`;
    updateSubmitBtn();
    if (tab === 'paste') document.getElementById('paste-zone').focus();
  };

  function updateSubmitBtn() {
    const btn   = document.getElementById('upload-btn');
    if (imageTab === 'file') {
      const files = document.getElementById('question-image').files;
      const valid = Array.from(files).filter(f => parseFilename(f.name)).length;
      btn.textContent = valid > 1 ? `Upload ${valid} Questions` : 'Upload Question';
    } else {
      btn.textContent = 'Upload Question';
    }
  }

  // ── File list preview (multi-file mode) ───────────────────────────
  document.getElementById('question-image').addEventListener('change', () => {
    pastedFile = null;
    renderFileList();
    updateSubmitBtn();
  });

  function renderFileList() {
    const files  = Array.from(document.getElementById('question-image').files);
    const listEl = document.getElementById('file-list-preview');
    if (!files.length) { listEl.innerHTML = ''; return; }

    listEl.innerHTML = files.map((f, i) => {
      const parsed = parseFilename(f.name);
      if (parsed) {
        return `
          <div class="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs">
            <span class="text-green-500 font-bold flex-shrink-0">&#x2713;</span>
            <span class="text-gray-700 truncate flex-1" title="${f.name}">${f.name}</span>
            ${parsedBadge(parsed)}
          </div>`;
      } else {
        return `
          <div class="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs">
            <span class="text-red-400 font-bold flex-shrink-0">&#x2717;</span>
            <span class="text-gray-500 truncate flex-1" title="${f.name}">${f.name}</span>
            <span class="text-red-400 flex-shrink-0">Unrecognised format — will skip</span>
          </div>`;
      }
    }).join('');
  }

  // ── Paste from clipboard ──────────────────────────────────────────
  function showPastePreview(src, name) {
    const preview = document.getElementById('image-preview');
    preview.src = src;
    preview.classList.remove('hidden');
    const fn = document.getElementById('paste-filename');
    if (name) { fn.textContent = name; fn.classList.remove('hidden'); }
    else fn.classList.add('hidden');
  }

  document.getElementById('paste-zone').addEventListener('paste', handlePaste);
  document.addEventListener('paste', (e) => { if (imageTab === 'paste') handlePaste(e); });

  function handlePaste(e) {
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        pastedFile = new File([blob], `pasted-${Date.now()}.png`, { type: blob.type });
        showPastePreview(URL.createObjectURL(blob), pastedFile.name);
        document.getElementById('paste-zone').innerHTML =
          `<span class="text-2xl">&#x2705;</span>
           <span class="text-sm text-green-600 font-medium mt-1">Image pasted! Ready to upload.</span>
           <span class="text-xs text-gray-400 mt-0.5">Paste again to replace</span>`;
        return;
      }
    }
    toast.error('No image found in clipboard. Copy an image first.');
  }

  // ── Upload helper for one file ────────────────────────────────────
  async function uploadOne(file, parsed, subject, chapter, topic) {
    const fd = new FormData();
    fd.append('image',   file);
    fd.append('type',    parsed.type);
    fd.append('subject', subject);
    fd.append('chapter', chapter);
    fd.append('topic',   topic);
    if (parsed.type === 'mcq') {
      fd.append('correctOption', parsed.correctOption);
    } else if (parsed.type === 'msq') {
      // send as comma-separated string; backend splits on ','
      fd.append('correctOptions', parsed.correctOptions.join(','));
    } else {
      fd.append('correctNumericalAnswer', parsed.correctNumericalAnswer);
    }
    return API.postForm('/questions', fd);
  }

  // ── Recent list (array-backed, never mutated via querySelector) ───
  const uploadedQuestions = [];

  function renderRecentList() {
    const el = document.getElementById('recent-list');
    if (!uploadedQuestions.length) {
      el.innerHTML = '<p class="text-sm text-gray-400">No uploads yet in this session.</p>';
      return;
    }
    el.innerHTML = uploadedQuestions.slice().reverse().map(q => {
      const correctDisplay = q.type === 'msq'
        ? (q.correctOptions || []).join(', ')
        : (q.correctOption ?? q.correctNumericalAnswer);
      const typeBg = q.type === 'msq' ? 'bg-orange-100 text-orange-700'
                   : q.type === 'mcq' ? 'bg-purple-100 text-purple-700'
                   : 'bg-blue-100 text-blue-700';
      return `
      <div class="flex gap-3 border border-gray-200 rounded-lg p-3">
        <img src="${q.imageUrl}" class="w-20 h-14 object-contain rounded border bg-gray-50"/>
        <div class="text-xs text-gray-600">
          <p class="font-semibold"><span class="px-1.5 py-0.5 rounded ${typeBg}">${q.type.toUpperCase()}</span></p>
          <p class="text-gray-400 mt-1">Correct: <strong>${correctDisplay}</strong></p>
        </div>
      </div>`;
    }).join('');
  }

  function addToRecentList(question) {
    uploadedQuestions.push(question);
    renderRecentList();
  }

  // ── Form submit ───────────────────────────────────────────────────
  document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn     = document.getElementById('upload-btn');
    const subject = document.getElementById('sel-subject').value;
    const chapter = document.getElementById('sel-chapter').value;
    const topic   = document.getElementById('sel-topic').value;
    if (!subject || !chapter || !topic) return toast.error('Select subject, chapter and topic');

    // ── Paste mode: single upload ──────────────────────────────────
    if (imageTab === 'paste') {
      if (!pastedFile) return toast.error('Please paste an image first');
      const type = document.getElementById('sel-type').value;
      btn.disabled = true; btn.textContent = 'Uploading…';
      try {
        // Collect MSQ checked options
        const msqChecked = type === 'msq'
          ? Array.from(document.querySelectorAll('.msq-check:checked')).map(cb => cb.value)
          : [];
        if (type === 'msq' && msqChecked.length < 2) {
          btn.disabled = false; btn.textContent = 'Upload Question';
          return toast.error('MSQ requires at least 2 correct options selected');
        }
        const parsed = {
          type,
          correctOption:          type === 'mcq' ? document.getElementById('sel-correct-option').value : undefined,
          correctOptions:         type === 'msq' ? msqChecked : undefined,
          correctNumericalAnswer: type === 'numerical' ? parseFloat(document.getElementById('inp-numerical').value) : undefined,
        };
        const question = await uploadOne(pastedFile, parsed, subject, chapter, topic);
        toast.success('Question uploaded!');
        addToRecentList(question);
        // Reset paste
        pastedFile = null;
        document.getElementById('image-preview').classList.add('hidden');
        document.getElementById('paste-filename').classList.add('hidden');
        document.getElementById('inp-numerical').value = '';
        document.getElementById('paste-zone').innerHTML =
          `<span class="text-3xl mb-2">&#x1F4CB;</span>
           <span class="text-sm text-gray-500">Click here, then <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Ctrl+V</kbd> to paste</span>
           <span class="text-xs text-gray-400 mt-1">Works with screenshots &amp; copied images</span>`;
      } catch (err) {
        toast.error(err.message || 'Upload failed');
      } finally {
        btn.disabled = false; btn.textContent = 'Upload Question';
      }
      return;
    }

    // ── File mode: multi-file sequential upload ────────────────────
    const files      = Array.from(document.getElementById('question-image').files);
    const validFiles = files.map(f => ({ file: f, parsed: parseFilename(f.name) })).filter(x => x.parsed);

    if (!validFiles.length) return toast.error('No valid files. Check filename format (e.g. 1-A.jpg or 1-120.jpg)');

    btn.disabled = true;
    let done = 0, failed = 0;

    // Show a live status list for each file
    const statusEl = document.getElementById('file-list-preview');
    const statusMap = {};
    validFiles.forEach(({ file }, i) => {
      statusMap[i] = `row-${i}`;
    });
    statusEl.innerHTML = validFiles.map(({ file, parsed }, i) => {
      const badge = parsedBadge(parsed);
      return `<div id="row-${i}" class="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs">
        <span id="row-icon-${i}" class="flex-shrink-0">&#x23F3;</span>
        <span class="text-gray-700 truncate flex-1">${file.name}</span>
        ${badge}
        <span id="row-status-${i}" class="flex-shrink-0 text-gray-400">Pending</span>
      </div>`;
    }).join('');

    for (let i = 0; i < validFiles.length; i++) {
      const { file, parsed } = validFiles[i];
      document.getElementById(`row-status-${i}`).textContent = 'Uploading…';
      document.getElementById(`row-icon-${i}`).textContent   = '⏫';
      btn.textContent = `Uploading ${i + 1} / ${validFiles.length}…`;
      try {
        const question = await uploadOne(file, parsed, subject, chapter, topic);
        addToRecentList(question);
        done++;
        document.getElementById(`row-status-${i}`).textContent = '✅ Done';
        document.getElementById(`row-icon-${i}`).textContent   = '✅';
        document.getElementById(`row-${i}`).className = 'flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs';
      } catch (err) {
        failed++;
        document.getElementById(`row-status-${i}`).textContent = '❌ Failed';
        document.getElementById(`row-icon-${i}`).textContent   = '❌';
        document.getElementById(`row-${i}`).className = 'flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs';
        console.error(`Failed: ${file.name}`, err.message);
      }
    }

    // Reset
    document.getElementById('question-image').value = '';
    document.getElementById('file-list-preview').innerHTML = '';
    btn.disabled = false;
    btn.textContent = 'Upload Question';

    if (failed === 0) {
      toast.success(`${done} question${done !== 1 ? 's' : ''} uploaded successfully!`);
    } else {
      toast.error(`${done} uploaded, ${failed} failed. Check console for details.`);
    }
  });

  await loadSubjects();
});
