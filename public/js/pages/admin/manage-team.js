document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('admin');

  const loadingEl = document.getElementById('team-loading');
  const emptyEl = document.getElementById('team-empty');
  const tbody = document.getElementById('team-tbody');
  const countEl = document.getElementById('team-count');
  const addMemberModal = document.getElementById('add-member-modal');
  const addMemberForm = document.getElementById('add-member-form');
  const subjectsSelect = document.getElementById('member-subjects');
  const roleSelect = document.getElementById('member-role');

  const editMemberModal = document.getElementById('edit-member-modal');
  const editMemberForm = document.getElementById('edit-member-form');
  const editSubjectsSelect = document.getElementById('edit-member-subjects');

  let teamUsers = [];
  let allSubjects = [];

  function roleBadge(role) {
    let cls = 'bg-blue-100 text-blue-700';
    if (role === 'admin') {
      cls = 'bg-red-100 text-red-700';
    } else if (role === 'coordinator') {
      cls = 'bg-purple-100 text-purple-700';
    }
    return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${cls}">${role}</span>`;
  }

  window.loadTeamUsers = async function() {
    loadingEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    tbody.innerHTML = '';

    try {
      teamUsers = await API.get('/auth/team');

      countEl.textContent = `${teamUsers.length} user${teamUsers.length !== 1 ? 's' : ''}`;

      if (!teamUsers.length) {
        emptyEl.classList.remove('hidden');
        return;
      }

      tbody.innerHTML = teamUsers.map((u) => {
        const subjectsList = Array.isArray(u.subjects) && u.subjects.length > 0
          ? u.subjects.map(s => s.name || s).join(', ')
          : '-';
        const statusBadge = u.isActive !== false
          ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Active</span>'
          : '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">Inactive</span>';

        return `
          <tr>
            <td class="px-4 py-3 text-gray-800 font-medium">${u.name || '-'}</td>
            <td class="px-4 py-3 text-gray-600">
              <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Login ID</div>
              <div>${u.email || '-'}</div>
              <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">Contact Mail</div>
              <div>${u.contactMail || '-'}</div>
            </td>
            <td class="px-4 py-3">${roleBadge(u.role)}</td>
            <td class="px-4 py-3 text-gray-600 max-w-xs truncate" title="${subjectsList}">${subjectsList}</td>
            <td class="px-4 py-3">${statusBadge}</td>
            <td class="px-4 py-3 text-gray-600">
              <div class="flex items-center gap-3">
                <button onclick="toggleMemberStatus('${u._id}', ${u.isActive !== false})" class="px-2 py-1 text-xs font-medium rounded-lg border transition ${u.isActive !== false ? 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100' : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}">
                  ${u.isActive !== false ? 'Deactivate' : 'Activate'}
                </button>
                <button onclick="openEditMemberModal('${u._id}')" class="p-1 text-blue-600 hover:text-blue-800 transition" title="Edit">
                  <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                </button>
                <button onclick="deleteMember('${u._id}', '${u.name}')" class="p-1 text-red-600 hover:text-red-800 transition" title="Delete">
                  <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      toast.error('Failed to load team users: ' + (err.message || ''));
    } finally {
      loadingEl.classList.add('hidden');
    }
  };

  async function loadSubjects() {
    try {
      allSubjects = await API.get('/subjects');
      const optionsHtml = allSubjects.map((s) =>
        `<option value="${s._id}">${s.name}</option>`
      ).join('');
      subjectsSelect.innerHTML = optionsHtml;
      editSubjectsSelect.innerHTML = optionsHtml;
    } catch (err) {
      toast.error('Failed to load subjects: ' + (err.message || ''));
    }
  }

  window.openAddMemberModal = async function() {
    addMemberModal.classList.remove('hidden');
    if (!subjectsSelect.options.length) {
      await loadSubjects();
    }
  };

  window.closeAddMemberModal = function() {
    addMemberModal.classList.add('hidden');
    addMemberForm.reset();
    Array.from(subjectsSelect.options).forEach((o) => { o.selected = false; });
  };

  addMemberForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const selectedSubjects = Array.from(subjectsSelect.selectedOptions).map((o) => o.value);

    try {
      await API.post('/auth/register/member', {
        name: document.getElementById('member-name').value.trim(),
        contactMail: document.getElementById('member-contact-mail').value.trim().toLowerCase(),
        role: roleSelect.value,
        subjects: selectedSubjects,
      });
      toast.success('Member registered successfully');
      closeAddMemberModal();
      await loadTeamUsers();
    } catch (err) {
      toast.error('Failed to submit member: ' + (err.message || ''));
    }
  });

  window.openEditMemberModal = async function(id) {
    const member = teamUsers.find(u => u._id === id);
    if (!member) return;

    if (!editSubjectsSelect.options.length) {
      await loadSubjects();
    }

    document.getElementById('edit-member-id').value = member._id;
    document.getElementById('edit-member-name').value = member.name || '';
    document.getElementById('edit-member-contact-mail').value = member.contactMail || '';
    document.getElementById('edit-member-role').value = member.role || 'teacher';

    const selectedIds = Array.isArray(member.subjects)
      ? member.subjects.map(s => typeof s === 'object' ? s._id : s)
      : [];

    Array.from(editSubjectsSelect.options).forEach((opt) => {
      opt.selected = selectedIds.includes(opt.value);
    });

    editMemberModal.classList.remove('hidden');
  };

  window.closeEditMemberModal = function() {
    editMemberModal.classList.add('hidden');
    editMemberForm.reset();
    Array.from(editSubjectsSelect.options).forEach((o) => { o.selected = false; });
  };

  editMemberForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-member-id').value;
    const selectedSubjects = Array.from(editSubjectsSelect.selectedOptions).map((o) => o.value);

    try {
      await API.put(`/auth/team/${id}`, {
        name: document.getElementById('edit-member-name').value.trim(),
        contactMail: document.getElementById('edit-member-contact-mail').value.trim().toLowerCase(),
        role: document.getElementById('edit-member-role').value,
        subjects: selectedSubjects,
      });
      toast.success('Member updated successfully');
      closeEditMemberModal();
      await loadTeamUsers();
    } catch (err) {
      toast.error('Failed to update member: ' + (err.message || ''));
    }
  });

  window.toggleMemberStatus = async function(id, currentActive) {
    const action = currentActive ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this member?`)) return;

    try {
      await API.patch(`/auth/team/${id}/status`, { isActive: !currentActive });
      toast.success(`Member ${action}d successfully`);
      await loadTeamUsers();
    } catch (err) {
      toast.error('Failed to change status: ' + (err.message || ''));
    }
  };

  window.deleteMember = async function(id, name) {
    if (!confirm(`Are you sure you want to permanently delete member "${name}"? This action cannot be undone.`)) return;

    try {
      await API.delete(`/auth/team/${id}`);
      toast.success('Member deleted successfully');
      await loadTeamUsers();
    } catch (err) {
      toast.error('Failed to delete member: ' + (err.message || ''));
    }
  };

  await loadTeamUsers();
});
