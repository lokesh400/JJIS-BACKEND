document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('admin');

  const loadingEl = document.getElementById('team-loading');
  const emptyEl = document.getElementById('team-empty');
  const tbody = document.getElementById('team-tbody');
  const countEl = document.getElementById('team-count');
  const addMemberModal = document.getElementById('add-member-modal');
  const addMemberForm = document.getElementById('add-member-form');
  const subjectsSelect = document.getElementById('member-subjects');

  function roleBadge(role) {
    const cls = role === 'admin'
      ? 'bg-red-100 text-red-700'
      : 'bg-blue-100 text-blue-700';
    return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${cls}">${role}</span>`;
  }

  window.loadTeamUsers = async function() {
    loadingEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    tbody.innerHTML = '';

    try {
      const users = await API.get('/auth/team');

      countEl.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;

      if (!users.length) {
        emptyEl.classList.remove('hidden');
        return;
      }

      tbody.innerHTML = users.map((u) => `
        <tr>
          <td class="px-4 py-3 text-gray-800 font-medium">${u.name || '-'}</td>
          <td class="px-4 py-3 text-gray-600">${u.email || '-'}</td>
          <td class="px-4 py-3">${roleBadge(u.role)}</td>
          <td class="px-4 py-3 text-gray-600">${u.mobile || '-'}</td>
        </tr>
      `).join('');
    } catch (err) {
      toast.error('Failed to load team users: ' + (err.message || ''));
    } finally {
      loadingEl.classList.add('hidden');
    }
  };

  async function loadSubjects() {
    try {
      const subjects = await API.get('/subjects');
      subjectsSelect.innerHTML = subjects.map((s) =>
        `<option value="${s._id}">${s.name}</option>`
      ).join('');
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
        subjects: selectedSubjects,
      });
      toast.success('Member registered successfully');
      closeAddMemberModal();
      await loadTeamUsers();
    } catch (err) {
      toast.error('Failed to submit member: ' + (err.message || ''));
    }
  });

  await loadTeamUsers();
});
