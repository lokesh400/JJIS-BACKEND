/**
 * pages/test-results.js  — admin: leaderboard + per-student detail drawer
 */
document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuthAny(['admin', 'coordinator']);
  if (!user) return;

  const parts  = window.location.pathname.split('/');
  const testId = parts[3]; // /admin/tests/:testId/results

  // Bind click listeners for export buttons
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnExportExcel = document.getElementById('btn-export-excel');

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      window.location.href = `/api/tests/${testId}/export/csv`;
    });
  }

  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => {
      window.location.href = `/api/tests/${testId}/export/excel`;
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────
  function fmt(sec) {
    if (!sec || sec <= 0) return '—';
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60), s = sec % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  function pctBar(pct, color = '#0f3460') {
    const safe = Math.min(100, Math.max(0, pct));
    return `<div class="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div class="h-1.5 rounded-full" style="width:${safe}%;background:${color}"></div></div>`;
  }
  function accColor(p) { return p >= 80 ? '#10b981' : p >= 60 ? '#f59e0b' : '#e94560'; }

  // ── Load leaderboard ────────────────────────────────────────────
  try {
    const [results, testData] = await Promise.all([
      API.get(`/tests/${testId}/results`),
      API.get(`/tests/admin/${testId}`),
    ]);

    document.getElementById('test-name').textContent = testData.name;

    const rankColors = [
      'bg-yellow-100 text-yellow-700',
      'bg-gray-100 text-gray-600',
      'bg-orange-100 text-orange-600',
    ];

    document.getElementById('results-body').innerHTML = results.length
      ? results.map((r, i) => {
          const pct = r.maxScore > 0 ? ((r.totalScore / r.maxScore) * 100).toFixed(1) : 0;
          return `
            <tr class="hover:bg-blue-50 cursor-default">
              <td class="px-4 py-3">
                <span class="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                             ${rankColors[i] || 'bg-white text-gray-500 border'}">
                  ${i + 1}
                </span>
              </td>
              <td class="px-4 py-3 font-medium text-gray-800">${r.user?.name || '—'}</td>
              <td class="px-4 py-3 text-gray-500">${r.user?.email || '—'}</td>
              <td class="px-4 py-3 text-gray-500 text-xs">${r.batch?.name || '<span class=\'text-gray-300\'>—</span>'}</td>
              <td class="px-4 py-3 text-right font-bold text-garud-accent">${r.totalScore}</td>
              <td class="px-4 py-3 text-right text-gray-500">${r.maxScore}</td>
              <td class="px-4 py-3 text-right">
                <span class="font-medium ${pct >= 60 ? 'text-green-600' : 'text-red-600'}">${pct}%</span>
              </td>
              <td class="px-4 py-3 text-right text-gray-500 text-xs">
                ${r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' }) : '—'}
              </td>
              <td class="px-4 py-3 text-right">
                <button onclick="openDrawer('${r._id}','${(r.user?.name||'').replace(/'/g,"\\'")}','${(r.user?.email||'').replace(/'/g,"\\'")}')"
                        class="px-3 py-1.5 text-xs font-semibold bg-garud-accent text-white rounded-lg hover:opacity-80 transition whitespace-nowrap">
                  View Detail
                </button>
              </td>
            </tr>`;
        }).join('')
      : '<tr><td colspan="9" class="px-4 py-8 text-center text-gray-400">No results yet.</td></tr>';

  } catch { toast.error('Failed to load results'); }
  finally {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('table-wrap').classList.remove('hidden');
  }

  // ── Drawer open / close ─────────────────────────────────────────
  let drawerChart = null; // keep reference to destroy on re-open

  window.openDrawer = async function (attemptId, name, email) {
    document.getElementById('drawer-student-name').textContent  = name || 'Student';
    document.getElementById('drawer-student-email').textContent = email || '';
    document.getElementById('drawer-student-email').dataset.attemptId = attemptId;
    document.getElementById('drawer-body').innerHTML =
      '<div class="flex items-center justify-center h-40"><div class="spinner"></div></div>';
    document.getElementById('drawer-overlay').classList.remove('hidden');
    document.getElementById('student-drawer').classList.add('open');
    document.body.style.overflow = 'hidden';

    try {
      const { attempt: result, test } = await API.get(`/tests/${testId}/results/${attemptId}`);
      renderDrawer(result, test);
    } catch {
      document.getElementById('drawer-body').innerHTML =
        '<p class="text-center text-red-500 py-12">Failed to load student detail.</p>';
    }
  };

  window.closeDrawer = function () {
    document.getElementById('student-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.add('hidden');
    document.body.style.overflow = '';
    if (drawerChart) { drawerChart.destroy(); drawerChart = null; }
  };

  // ── Render drawer content ───────────────────────────────────────
  function renderDrawer(result, test) {
    // Show batch name in drawer header if available
    const batchBadge = document.getElementById('drawer-batch-badge');
    if (result.batch?.name) {
      batchBadge.textContent = '📦 ' + result.batch.name;
      batchBadge.classList.remove('hidden');
    } else {
      batchBadge.classList.add('hidden');
    }
    // Build flat question rows (same logic as student results.js)
    let gIdx = 0;
    const qRows = [];
    test.sections.forEach(sec => {
      sec.questions.forEach(qEntry => {
        const qId  = qEntry.question?._id;
        const secId = sec._id?.toString();
        const ans  = result.answers.find(a =>
          a.question && a.question._id?.toString() === qId?.toString()
          && a.sectionId?.toString() === secId
        );
        gIdx++;
        const isAttempted = !!(ans?.selectedOption ||
          (ans?.numericalAnswer !== null && ans?.numericalAnswer !== undefined));
        qRows.push({
          globalIdx:       gIdx,
          sectionName:     sec.name,
          question:        qEntry.question,
          positiveMarks:   qEntry.positiveMarks,
          negativeMarks:   qEntry.negativeMarks,
          selectedOption:  ans?.selectedOption  || null,
          numericalAnswer: ans?.numericalAnswer ?? null,
          isCorrect:       ans?.isCorrect       || false,
          marksObtained:   ans?.marksObtained   || 0,
          timeSpent:       ans?.timeSpent       || 0,
          isAttempted,
        });
      });
    });

    const totalQ     = qRows.length;
    const correct    = qRows.filter(r => r.isCorrect).length;
    const attempted  = qRows.filter(r => r.isAttempted).length;
    const wrong      = attempted - correct;
    const skipped    = totalQ - attempted;
    const pct        = result.maxScore > 0 ? ((result.totalScore / result.maxScore) * 100).toFixed(1) : 0;
    const pctNum     = parseFloat(pct);
    const totalTime  = qRows.reduce((s, r) => s + r.timeSpent, 0);
    const avgTime    = totalQ > 0 ? Math.round(totalTime / totalQ) : 0;
    const accuracy   = attempted > 0 ? ((correct / attempted) * 100).toFixed(1) : 0;

    function groupBy(rows, key) {
      const map = {};
      rows.forEach(r => { const k = key(r)||'Unknown'; if(!map[k]) map[k]=[]; map[k].push(r); });
      return map;
    }
    function statsOf(rows) {
      const c  = rows.filter(r => r.isCorrect).length;
      const at = rows.filter(r => r.isAttempted).length;
      const w  = at - c;
      const sk = rows.length - at;
      const tt = rows.reduce((s, r) => s + r.timeSpent, 0);
      const av = rows.length ? Math.round(tt / rows.length) : 0;
      const acc = at > 0 ? ((c / at) * 100).toFixed(1) : '—';
      const sc   = rows.reduce((s, r) => s + r.marksObtained, 0);
      const maxSc = rows.reduce((s, r) => s + r.positiveMarks, 0);
      return { c, w, sk, tt, av, acc, sc, maxSc };
    }

    const bySection = groupBy(qRows, r => r.sectionName);
    const bySubject = groupBy(qRows, r => r.question?.subject?.name);

    const gradeColor = pctNum >= 70 ? '#10b981' : pctNum >= 50 ? '#f59e0b' : '#e94560';
    const grade = pctNum >= 90 ? 'A+' : pctNum >= 80 ? 'A' : pctNum >= 70 ? 'B' : pctNum >= 60 ? 'C' : pctNum >= 40 ? 'D' : 'F';

    // Build HTML sections
    const summaryCards = [
      { label:'Score',      val:`${result.totalScore}/${result.maxScore}`, color:'#0f3460' },
      { label:'Percentage', val:`${pct}%`,   color: gradeColor },
      { label:'Correct',    val: correct,    color:'#10b981' },
      { label:'Wrong',      val: wrong,      color:'#e94560' },
      { label:'Skipped',    val: skipped,    color:'#94a3b8' },
      { label:'Time Used',  val: fmt(totalTime), color:'#f59e0b' },
    ].map(c => `<div class="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
      <p class="text-xl font-bold" style="color:${c.color}">${c.val}</p>
      <p class="text-xs text-gray-400 mt-0.5">${c.label}</p>
    </div>`).join('');

    const sectionRows = Object.entries(bySection).map(([name, rows]) => {
      const s = statsOf(rows);
      const ap = s.acc === '—' ? 0 : parseFloat(s.acc);
      return `<tr class="hover:bg-gray-50">
        <td class="px-3 py-2 font-medium text-gray-800 text-sm">${name}</td>
        <td class="px-3 py-2 text-center text-green-600 font-semibold text-sm">${s.c}</td>
        <td class="px-3 py-2 text-center text-red-500 font-semibold text-sm">${s.w}</td>
        <td class="px-3 py-2 text-center text-gray-400 font-semibold text-sm">${s.sk}</td>
        <td class="px-3 py-2 text-center font-bold text-gray-800 text-sm">${s.sc}/${s.maxSc}</td>
        <td class="px-3 py-2 text-sm">
          <span class="font-semibold" style="color:${accColor(ap)}">${s.acc}%</span>
          ${pctBar(ap, accColor(ap))}
        </td>
      </tr>`;
    }).join('');

    const subjectRows = Object.entries(bySubject).map(([name, rows]) => {
      const s = statsOf(rows);
      const ap = s.acc === '—' ? 0 : parseFloat(s.acc);
      return `<tr class="hover:bg-gray-50">
        <td class="px-3 py-2 font-medium text-gray-800 text-sm">${name}</td>
        <td class="px-3 py-2 text-center text-green-600 font-semibold text-sm">${s.c}</td>
        <td class="px-3 py-2 text-center text-red-500 font-semibold text-sm">${s.w}</td>
        <td class="px-3 py-2 text-center text-gray-400 font-semibold text-sm">${s.sk}</td>
        <td class="px-3 py-2 text-sm">
          <span class="font-semibold" style="color:${accColor(ap)}">${s.acc}%</span>
          ${pctBar(ap, accColor(ap))}
        </td>
        <td class="px-3 py-2 text-center text-gray-600 text-sm">${fmt(s.av)}</td>
      </tr>`;
    }).join('');

    const qCards = qRows.map(r => {
      const q         = r.question;
      const dotBg     = r.isCorrect ? 'bg-green-500' : r.isAttempted ? 'bg-red-500' : 'bg-gray-400';
      const borderCls = r.isCorrect ? 'border-green-200' : r.isAttempted ? 'border-red-200' : 'border-gray-200';
      const marksCls  = r.marksObtained > 0 ? 'text-green-600' : r.marksObtained < 0 ? 'text-red-500' : 'text-gray-400';

      let ansHtml = '';
      if (q?.type === 'mcq') {
        const yc = r.isCorrect ? 'text-green-700 bg-green-50' : r.isAttempted ? 'text-red-600 bg-red-50' : 'text-gray-500 bg-gray-50';
        ansHtml = `<span class="inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${yc}">Your: ${r.selectedOption || 'Not answered'}</span>
          <span class="inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold text-green-700 bg-green-50">Correct: ${q.correctOption || '?'}</span>`;
      } else {
        const yc = r.isCorrect ? 'text-green-700 bg-green-50' : r.isAttempted ? 'text-red-600 bg-red-50' : 'text-gray-500 bg-gray-50';
        const ya = r.numericalAnswer !== null && r.numericalAnswer !== undefined ? r.numericalAnswer : 'Not answered';
        ansHtml = `<span class="inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${yc}">Your: ${ya}</span>
          <span class="inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold text-green-700 bg-green-50">Correct: ${q?.correctNumericalAnswer ?? '?'}</span>`;
      }

      return `<div class="border-2 ${borderCls} rounded-xl overflow-hidden mb-3">
        <div class="flex items-center justify-between px-4 py-2 bg-gray-50 flex-wrap gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${dotBg}">${r.globalIdx}</span>
            <span class="text-xs text-gray-500">${r.sectionName}</span>
            ${q?.subject?.name  ? `<span class="text-xs text-blue-500 font-medium">${q.subject.name}</span>` : ''}
            ${q?.chapter?.name  ? `<span class="text-xs text-gray-400">${q.chapter.name}</span>` : ''}
          </div>
          <div class="flex items-center gap-2 text-xs flex-shrink-0">
            <span class="text-gray-400">⏱ ${r.timeSpent > 0 ? fmt(r.timeSpent) : '—'}</span>
            <span class="font-bold ${marksCls}">${r.marksObtained > 0 ? '+' : ''}${r.marksObtained} marks</span>
            <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${r.isCorrect ? 'bg-green-100 text-green-700' : r.isAttempted ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}">
              ${r.isCorrect ? 'Correct' : r.isAttempted ? 'Wrong' : 'Skipped'}
            </span>
          </div>
        </div>
        <div class="p-4">
          ${q?.imageUrl ? `<div class="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden mb-3 p-2">
            <img src="${q.imageUrl}" alt="Q${r.globalIdx}" class="q-img-admin"
                 onerror="this.parentElement.innerHTML='<span class=\\'text-gray-400 text-xs p-3\\'>Image unavailable</span>'" /></div>` : ''}
          <div class="flex flex-wrap gap-2 items-center">
            ${ansHtml}
            <span class="ml-auto text-xs text-gray-400">+${r.positiveMarks} / −${r.negativeMarks}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    document.getElementById('drawer-body').innerHTML = `
      <!-- Score summary -->
      <div class="mb-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-gray-700">Overview</h3>
          <span class="text-sm font-bold px-3 py-1 rounded-full text-white" style="background:${gradeColor}">
            Grade ${grade} &nbsp;·&nbsp; ${pct}%
          </span>
        </div>
        <div class="grid grid-cols-3 gap-2 mb-4">${summaryCards}</div>
        <div class="text-xs text-gray-400 text-right">
          Submitted: ${new Date(result.submittedAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}
          &nbsp;·&nbsp; Accuracy: ${accuracy}% &nbsp;·&nbsp; Avg time/q: ${fmt(avgTime)}
        </div>
      </div>

      <!-- Time-per-question chart -->
      <div class="bg-gray-50 rounded-xl border border-gray-100 p-4 mb-5">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Time Spent Per Question</p>
        <div style="height:160px"><canvas id="drawer-chart-time"></canvas></div>
        <p class="text-xs text-gray-400 mt-2">🟢 Correct &nbsp; 🔴 Wrong &nbsp; ⬜ Skipped</p>
      </div>

      <!-- Section breakdown -->
      <div class="mb-5">
        <h3 class="font-bold text-gray-700 mb-2">Section Breakdown</h3>
        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 text-gray-500 uppercase">
              <tr>
                <th class="text-left px-3 py-2">Section</th>
                <th class="px-3 py-2">✅</th><th class="px-3 py-2">❌</th><th class="px-3 py-2">⬜</th>
                <th class="px-3 py-2">Score</th><th class="px-3 py-2">Accuracy</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">${sectionRows}</tbody>
          </table>
        </div>
      </div>

      <!-- Subject breakdown -->
      <div class="mb-5">
        <h3 class="font-bold text-gray-700 mb-2">Subject Breakdown</h3>
        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 text-gray-500 uppercase">
              <tr>
                <th class="text-left px-3 py-2">Subject</th>
                <th class="px-3 py-2">✅</th><th class="px-3 py-2">❌</th><th class="px-3 py-2">⬜</th>
                <th class="px-3 py-2">Accuracy</th><th class="px-3 py-2">Avg Time</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">${subjectRows}</tbody>
          </table>
        </div>
      </div>

      <!-- Question-by-question review -->
      <div>
        <h3 class="font-bold text-gray-700 mb-3">Question Review</h3>
        ${qCards}
      </div>`;

    // Render time chart (after HTML is injected)
    if (drawerChart) drawerChart.destroy();
    drawerChart = new Chart(document.getElementById('drawer-chart-time'), {
      type: 'bar',
      data: {
        labels: qRows.map(r => `Q${r.globalIdx}`),
        datasets: [{
          label: 'Time (s)',
          data: qRows.map(r => r.timeSpent),
          backgroundColor: qRows.map(r => r.isCorrect ? '#10b981' : r.isAttempted ? '#e94560' : '#94a3b8'),
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 } } },
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: v => fmt(v), font: { size: 9 } } },
        },
      },
    });
  }
});
