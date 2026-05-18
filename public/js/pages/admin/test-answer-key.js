document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth('admin');
  if (!user) return;

  const parts = window.location.pathname.split('/');
  const testId = parts[3]; // /admin/tests/:testId/answer-key

  document.getElementById('download-answer-key-btn').addEventListener('click', () => {
    window.location.href = `/api/tests/admin/${testId}/download-answer-key-sectionwise`;
  });

  try {
    const test = await API.get(`/tests/admin/${testId}`);
    document.getElementById('test-name').textContent = test.name || '';

    const container = document.getElementById('answer-key-sections');
    if (!test.sections || !test.sections.length) {
      container.innerHTML = '<div class="bg-white rounded-xl shadow-md p-10 text-center text-gray-400">No sections found in this test.</div>';
    } else {
      container.innerHTML = test.sections.map((section, sectionIndex) => {
        const rows = (section.questions || []).map((entry, i) => {
          const q = entry.question || {};
          let answer = '-';
          if (q.type === 'mcq') answer = q.correctOption || '-';
          else if (q.type === 'msq') answer = Array.isArray(q.correctOptions) && q.correctOptions.length ? q.correctOptions.join(', ') : '-';
          else if (q.type === 'numerical') answer = (q.correctNumericalAnswer === null || q.correctNumericalAnswer === undefined) ? '-' : String(q.correctNumericalAnswer);

          return `
            <tr class="border-t border-gray-100">
              <td class="px-4 py-2 text-sm text-gray-700">Q${i + 1}</td>
              <td class="px-4 py-2 text-sm text-gray-500 uppercase">${q.type || '-'}</td>
              <td class="px-4 py-2 text-sm font-semibold text-gray-900">${answer}</td>
            </tr>
          `;
        }).join('');

        return `
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <h2 class="font-bold text-gray-800">Section ${sectionIndex + 1}: ${section.name || 'Untitled Section'}</h2>
            </div>
            <div class="overflow-auto">
              <table class="w-full">
                <thead class="bg-white">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Question</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Type</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Correct Answer</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || '<tr><td colspan="3" class="px-4 py-4 text-sm text-gray-400">No questions in this section.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    toast.error(err.message || 'Failed to load answer key');
  } finally {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('answer-key-sections').classList.remove('hidden');
  }
});
