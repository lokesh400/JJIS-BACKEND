document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('admin');

  const loadingEl = document.getElementById('students-loading');
  const emptyEl = document.getElementById('students-empty');
  const tbody = document.getElementById('students-tbody');
  const countEl = document.getElementById('student-count');
  const searchInput = document.getElementById('student-search');

  // Purchases modal
  const purchasesModal = document.getElementById('purchases-modal');
  const modalStudentName = document.getElementById('modal-student-name');
  const purchasesLoading = document.getElementById('purchases-loading');
  const purchasesEmpty = document.getElementById('purchases-empty');
  const purchasesContainer = document.getElementById('purchases-container');

  // Manual enrollment modal
  const enrollModal = document.getElementById('enroll-modal');
  const modalEnrollStudentName = document.getElementById('modal-enroll-student-name');
  const enrollItemType = document.getElementById('enroll-item-type');
  const enrollItemSelect = document.getElementById('enroll-item-select');
  const enrollForm = document.getElementById('enroll-form');

  let allStudents = [];
  let enrollmentOptions = { courses: [], testSeries: [] };
  let currentStudentId = null;

  window.loadStudents = async function() {
    loadingEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    tbody.innerHTML = '';

    try {
      allStudents = await API.get('/auth/students');
      renderStudents(allStudents);
    } catch (err) {
      toast.error('Failed to load students: ' + (err.message || ''));
    } finally {
      loadingEl.classList.add('hidden');
    }
  };

  async function fetchEnrollmentOptions() {
    try {
      enrollmentOptions = await API.get('/auth/enrollment-options');
    } catch {
      toast.error('Failed to fetch enrollment courses and test series options');
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function renderStudents(studentsList) {
    countEl.textContent = `${studentsList.length} student${studentsList.length !== 1 ? 's' : ''}`;

    if (!studentsList.length) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    tbody.innerHTML = studentsList.map((s) => `
      <tr class="hover:bg-slate-50/50 transition duration-150">
        <td class="px-6 py-4 text-gray-800 font-semibold">${s.name || '-'}</td>
        <td class="px-6 py-4 text-gray-600">
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Login ID</div>
          <div class="text-slate-700">${s.email || '-'}</div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">Contact Mail</div>
          <div class="text-slate-600">${s.contactMail || '-'}</div>
        </td>
        <td class="px-6 py-4 text-gray-600 font-medium">${s.mobile || '-'}</td>
        <td class="px-6 py-4 text-gray-500">${formatDate(s.createdAt)}</td>
        <td class="px-6 py-4 text-right">
          <button onclick="openEnrollModal('${s._id}', '${s.name || 'Student'}')" 
                  class="px-3.5 py-1.5 bg-violet-50 text-violet-600 hover:bg-violet-100/80 rounded-xl text-xs font-bold transition shadow-sm border border-violet-100 mr-2">
            Enroll Student
          </button>
          <button onclick="openPurchasesModal('${s._id}', '${s.name || 'Student'}')" 
                  class="px-3.5 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100/80 rounded-xl text-xs font-bold transition shadow-sm border border-blue-100">
            View Purchases
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Client-side search filters
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      renderStudents(allStudents);
      return;
    }

    const filtered = allStudents.filter((s) => {
      const name = String(s.name || '').toLowerCase();
      const email = String(s.email || '').toLowerCase();
      const contactMail = String(s.contactMail || '').toLowerCase();
      const mobile = String(s.mobile || '').toLowerCase();
      return name.includes(q) || email.includes(q) || contactMail.includes(q) || mobile.includes(q);
    });

    renderStudents(filtered);
  });

  // Purchases Modal actions
  window.openPurchasesModal = async function(studentId, studentName) {
    modalStudentName.textContent = `Enrolled items for ${studentName}`;
    purchasesModal.classList.remove('hidden');
    purchasesLoading.classList.remove('hidden');
    purchasesEmpty.classList.add('hidden');
    purchasesContainer.innerHTML = '';

    try {
      const purchases = await API.get(`/auth/students/${studentId}/purchases`);
      purchasesLoading.classList.add('hidden');

      if (!purchases.length) {
        purchasesEmpty.classList.remove('hidden');
        return;
      }

      purchasesContainer.innerHTML = purchases.map((p) => {
        // Accents and classes based on type
        const typeBadge = p.itemType === 'Course'
          ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">Course</span>'
          : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">Test Series</span>';

        // Accents based on payment status
        let statusBadge = '';
        if (p.status === 'success') {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Success</span>';
        } else if (p.status === 'failed') {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">Failed</span>';
        } else {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Pending</span>';
        }

        // Accents based on method
        const methodBadge = p.method === 'free'
          ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">Free / Manual</span>'
          : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">Online</span>';

        return `
          <div class="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                ${typeBadge}
                ${statusBadge}
                ${methodBadge}
              </div>
              <h4 class="font-bold text-gray-800 text-sm md:text-base mt-1.5">${p.item?.name || 'Item Name'}</h4>
              <p class="text-xs text-gray-400">Purchased on ${formatDate(p.createdAt)}</p>
            </div>
            <div class="flex items-start md:items-end flex-col gap-1 text-left md:text-right border-t md:border-t-0 border-dashed border-gray-100 pt-3 md:pt-0">
              <div class="text-sm font-extrabold text-slate-800">₹${p.amount}</div>
              ${p.razorpayPaymentId ? `<div class="text-[10px] font-mono text-gray-400">Txn: ${p.razorpayPaymentId}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      purchasesLoading.classList.add('hidden');
      toast.error('Failed to load purchases: ' + (err.message || ''));
    }
  };

  window.closePurchasesModal = function() {
    purchasesModal.classList.add('hidden');
  };

  // Manual Enrollment Modal actions
  window.openEnrollModal = function(studentId, studentName) {
    currentStudentId = studentId;
    modalEnrollStudentName.textContent = `Enrolling student ${studentName}`;
    enrollForm.reset();
    enrollItemSelect.disabled = true;
    enrollItemSelect.innerHTML = '<option value="">Select Type First</option>';
    enrollModal.classList.remove('hidden');
  };

  window.closeEnrollModal = function() {
    enrollModal.classList.add('hidden');
    currentStudentId = null;
  };

  // Listen to type select to populate options
  enrollItemType.addEventListener('change', () => {
    const val = enrollItemType.value;
    if (!val) {
      enrollItemSelect.disabled = true;
      enrollItemSelect.innerHTML = '<option value="">Select Type First</option>';
      return;
    }

    enrollItemSelect.disabled = false;
    let list = [];
    if (val === 'Course') {
      list = enrollmentOptions.courses || [];
    } else {
      list = enrollmentOptions.testSeries || [];
    }

    if (!list.length) {
      enrollItemSelect.innerHTML = `<option value="">No ${val === 'Course' ? 'Courses' : 'Test Series'} available</option>`;
      return;
    }

    enrollItemSelect.innerHTML = `<option value="">Choose ${val === 'Course' ? 'Course' : 'Test Series'}</option>` +
      list.map(item => `<option value="${item._id}">${item.name}</option>`).join('');
  });

  // Handle enrollment submit
  enrollForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemType = enrollItemType.value;
    const itemId = enrollItemSelect.value;

    if (!currentStudentId || !itemType || !itemId) {
      return toast.error('Please complete the form first.');
    }

    try {
      const res = await API.post('/auth/students/enroll-manual', {
        studentId: currentStudentId,
        itemType,
        itemId
      });
      toast.success(res.message || 'Student enrolled successfully!');
      closeEnrollModal();
    } catch (err) {
      toast.error(err.message || 'Manual enrollment failed');
    }
  });

  // Initialization
  await fetchEnrollmentOptions();
  await loadStudents();
});
