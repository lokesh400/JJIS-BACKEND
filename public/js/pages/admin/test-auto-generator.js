document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuthAny(['admin', 'teacher']);
  if (!user) return;

  const testId = window.__TEST_ID__;
  let test = null;
  let teacherSubjectId = null;
  let subjects = [];
  const sectionRules = {};
  const chapterCache = {};
  let modalCtx = null;

  function esc(v) { return String(v || '').replace(/[&<>'\"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  async function renderSections() {
    const host = document.getElementById('sections');
    host.innerHTML = test.sections.map((s, i) => {
      const rules = sectionRules[s._id] || [];
      return `
      <div class="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <button onclick="toggleSection('${s._id}')" class="w-full px-4 py-3 text-left bg-gray-50 flex items-center justify-between">
          <span class="font-semibold">${esc(s.name)} <span class="text-xs text-gray-400">(${rules.length} rules)</span></span>
          <span id="arrow-${s._id}" class="text-gray-500">${i===0 ? '▼' : '▶'}</span>
        </button>
        <div id="body-${s._id}" class="p-4 space-y-3 ${i===0 ? '' : 'hidden'}">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select id="subject-${s._id}" class="border rounded-lg p-2" ${teacherSubjectId ? 'disabled' : ''}><option value="">Select Subject</option>${subjects.map(sub => `<option value="${sub._id}" ${teacherSubjectId && String(sub._id) === String(teacherSubjectId) ? 'selected' : ''}>${esc(sub.name)}</option>`).join('')}</select>
            <select id="chapter-${s._id}" class="border rounded-lg p-2"><option value="">Select Chapter</option></select>
            <button onclick="startAddRule('${s._id}')" class="bg-indigo-600 text-white rounded-lg px-3 py-2">Add Rule</button>
          </div>
          <div id="rules-${s._id}" class="space-y-2">${rules.map((r, idx) => `
            <div class="border rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2">
              <span>${esc(r.subjectName)} / ${esc(r.chapterName)} / ${(r.questionType || 'all').toUpperCase()} / H:${r.hardCount} M:${r.mediumCount} E:${r.easyCount}</span>
              <button onclick="removeRule('${s._id}', ${idx})" class="text-red-600">Remove</button>
            </div>`).join('') || '<p class="text-sm text-gray-400">No rules added yet.</p>'}
          </div>
        </div>
      </div>`;
    }).join('');

    for (const s of test.sections) {
      if (teacherSubjectId) {
        const subjectEl = document.getElementById(`subject-${s._id}`);
        if (subjectEl) {
          subjectEl.value = String(teacherSubjectId);
          const chapterEl = document.getElementById(`chapter-${s._id}`);
          chapterEl.innerHTML = '<option value="">Loading...</option>';
          if (!chapterCache[teacherSubjectId]) chapterCache[teacherSubjectId] = await API.get(`/chapters/subject/${teacherSubjectId}`);
          chapterEl.innerHTML = '<option value="">Select Chapter</option>' + chapterCache[teacherSubjectId].map(ch => `<option value="${ch._id}">${esc(ch.name)}</option>`).join('');
        }
      }
      document.getElementById(`subject-${s._id}`).addEventListener('change', async (e) => {
        const sid = e.target.value;
        const chapterEl = document.getElementById(`chapter-${s._id}`);
        chapterEl.innerHTML = '<option value="">Loading...</option>';
        if (!sid) { chapterEl.innerHTML = '<option value="">Select Chapter</option>'; return; }
        if (!chapterCache[sid]) chapterCache[sid] = await API.get(`/chapters/subject/${sid}`);
        chapterEl.innerHTML = '<option value="">Select Chapter</option>' + chapterCache[sid].map(ch => `<option value="${ch._id}">${esc(ch.name)}</option>`).join('');
      });
    }
  }

  window.toggleSection = (sectionId) => {
    const body = document.getElementById(`body-${sectionId}`);
    const arrow = document.getElementById(`arrow-${sectionId}`);
    const open = body.classList.toggle('hidden');
    arrow.textContent = open ? '▶' : '▼';
  };

  window.startAddRule = (sectionId) => {
    const subjectEl = document.getElementById(`subject-${sectionId}`);
    const chapterEl = document.getElementById(`chapter-${sectionId}`);
    if (!subjectEl.value || !chapterEl.value) return toast.error('Select subject and chapter first');
    modalCtx = {
      sectionId,
      subjectId: subjectEl.value,
      chapterId: chapterEl.value,
      subjectName: subjectEl.options[subjectEl.selectedIndex].text,
      chapterName: chapterEl.options[chapterEl.selectedIndex].text,
    };
    document.getElementById('rm-type').value = '';
    document.getElementById('rm-hard').value = 0;
    document.getElementById('rm-medium').value = 0;
    document.getElementById('rm-easy').value = 0;
    document.getElementById('rule-modal').classList.remove('hidden');
    document.getElementById('rule-modal').classList.add('flex');
  };

  window.closeRuleModal = () => {
    document.getElementById('rule-modal').classList.add('hidden');
    document.getElementById('rule-modal').classList.remove('flex');
    modalCtx = null;
  };

  window.saveRuleModal = () => {
    if (!modalCtx) return;
    const rule = {
      ...modalCtx,
      questionType: document.getElementById('rm-type').value,
      hardCount: parseInt(document.getElementById('rm-hard').value, 10) || 0,
      mediumCount: parseInt(document.getElementById('rm-medium').value, 10) || 0,
      easyCount: parseInt(document.getElementById('rm-easy').value, 10) || 0,
    };
    if (rule.hardCount + rule.mediumCount + rule.easyCount <= 0) return toast.error('Enter at least one question count');
    sectionRules[rule.sectionId] = sectionRules[rule.sectionId] || [];
    sectionRules[rule.sectionId].push(rule);
    closeRuleModal();
    renderSections();
  };

  window.removeRule = (sectionId, idx) => {
    sectionRules[sectionId].splice(idx, 1);
    renderSections();
  };

  async function generateSectionRules(sectionId) {
    const rules = sectionRules[sectionId] || [];
    if (!rules.length) return { added: 0, failed: 0, skipped: true };
    let addedTotal = 0;
    let failed = 0;
    for (const r of rules) {
      try {
        const resp = await API.post(`/tests/${testId}/sections/${sectionId}/auto-generate`, {
          subjectId: r.subjectId,
          chapterId: r.chapterId,
          questionType: r.questionType,
          hardCount: r.hardCount,
          mediumCount: r.mediumCount,
          easyCount: r.easyCount,
          positiveMarks: 4,
          negativeMarks: 1,
        });
        test = resp.test;
        addedTotal += resp?.summary?.added?.total || 0;
      } catch {
        failed += 1;
      }
    }
    return { added: addedTotal, failed, skipped: false };
  }

  document.getElementById('generate-all-btn').addEventListener('click', async () => {
    const sectionIds = test.sections.map((s) => String(s._id));
    if (!sectionIds.some((id) => (sectionRules[id] || []).length > 0)) {
      toast.error('Add at least one rule in any section first');
      return;
    }

    const btn = document.getElementById('generate-all-btn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    let totalAdded = 0;
    let totalFailedRules = 0;
    let sectionsWithNoRules = 0;
    for (const sectionId of sectionIds) {
      const out = await generateSectionRules(sectionId);
      totalAdded += out.added;
      totalFailedRules += out.failed;
      if (out.skipped) sectionsWithNoRules += 1;
    }

    renderSections();
    btn.disabled = false;
    btn.textContent = 'Generate All Sections';

    if (totalFailedRules > 0) {
      toast.error(`Generated with partial failures. Added ${totalAdded}. Failed rules: ${totalFailedRules}.`);
    } else {
      toast.success(`Generation complete. Added ${totalAdded} question(s).`);
    }
    if (sectionsWithNoRules > 0) {
      toast.error(`${sectionsWithNoRules} section(s) had no rules, so they were skipped.`);
    }
  });

  try {
    const [tp, s] = await Promise.all([API.get(`/tests/admin/${testId}`), API.get('/subjects')]);
    test = tp.test || tp;
    teacherSubjectId = tp.teacherSubjectId || null;
    subjects = teacherSubjectId ? s.filter((sub) => String(sub._id) === String(teacherSubjectId)) : s;
    renderSections();
  } catch {
    toast.error('Failed to load auto generator');
  } finally {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('sections').classList.remove('hidden');
  }
});
