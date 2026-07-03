document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth('student');
  if (!user) return;

  const milestones = [
    {
      streakDays: 50,
      title: 'Jeevan Jyoti International School Bottle',
      note: 'Hydration reward for your first big consistency streak.',
      accentClass: 'from-cyan-500 to-blue-600',
    },
    {
      streakDays: 100,
      title: 'Jeevan Jyoti International School T-Shirt',
      note: 'You earned a wearable badge of battleground discipline.',
      accentClass: 'from-emerald-500 to-teal-600',
    },
    {
      streakDays: 200,
      title: 'Mystery Box',
      note: 'A surprise reward unlocked for your elite consistency.',
      accentClass: 'from-violet-500 to-fuchsia-600',
    },
    {
      streakDays: 365,
      title: 'Jeevan Jyoti International School Jacket',
      note: 'Legendary one-year streak reward.',
      accentClass: 'from-amber-500 to-orange-600',
    },
  ];

  const currentStreakEl = document.getElementById('prize-current-streak');
  const nextTargetEl = document.getElementById('prize-next-target');
  const nextHintEl = document.getElementById('prize-next-hint');
  const progressBarEl = document.getElementById('prize-progress-bar');
  const progressTextEl = document.getElementById('prize-progress-text');
  const roadmapEl = document.getElementById('prize-roadmap');

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function renderRoadmap(currentStreak) {
    roadmapEl.innerHTML = milestones
      .map((item, index) => {
        const unlocked = currentStreak >= item.streakDays;
        const daysLeft = Math.max(item.streakDays - currentStreak, 0);
        const completion = clamp((currentStreak / item.streakDays) * 100, 0, 100);
        const statePill = unlocked
          ? '<span class="px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Unlocked</span>'
          : `<span class="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">${daysLeft} days to go</span>`;

        return `
          <article class="bg-white rounded-2xl shadow-sm border ${unlocked ? 'border-emerald-200' : 'border-gray-100'} p-5 md:p-6 lift fade-up-${(index % 3) + 1}">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div class="flex items-start gap-3">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${item.accentClass} text-white flex items-center justify-center font-black text-lg shadow-sm">${item.streakDays}</div>
                <div>
                  <p class="text-xs uppercase tracking-wider text-gray-500">Milestone</p>
                  <h3 class="text-lg font-bold text-gray-900">${item.streakDays} Day Streak</h3>
                  <p class="text-sm text-gray-600 mt-1">Prize: <span class="font-semibold text-gray-900">${item.title}</span></p>
                </div>
              </div>
              ${statePill}
            </div>

            <p class="text-sm text-gray-500 mt-3">${item.note}</p>

            <div class="mt-4">
              <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div class="h-full bg-gradient-to-r ${item.accentClass}" style="width:${completion.toFixed(2)}%"></div>
              </div>
              <p class="text-xs text-gray-500 mt-1">Progress to this reward: ${Math.floor(completion)}%</p>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function renderSummary(currentStreak) {
    currentStreakEl.textContent = String(currentStreak);

    const maxTarget = milestones[milestones.length - 1].streakDays;
    const overallPct = clamp((currentStreak / maxTarget) * 100, 0, 100);
    progressBarEl.style.width = `${overallPct.toFixed(2)}%`;
    progressTextEl.textContent = `${currentStreak} / ${maxTarget} days`;

    const nextPrize = milestones.find((item) => item.streakDays > currentStreak);
    if (!nextPrize) {
      nextTargetEl.textContent = 'All milestones unlocked';
      nextHintEl.textContent = 'You have completed the full Battleground prize roadmap.';
      return;
    }

    nextTargetEl.textContent = `${nextPrize.streakDays} days - ${nextPrize.title}`;
    nextHintEl.textContent = `${nextPrize.streakDays - currentStreak} more days to unlock this prize.`;
  }

  try {
    const streakData = await API.get('/battlegrounds/me');
    const currentStreak = Number(streakData.currentStreak || 0);
    renderSummary(currentStreak);
    renderRoadmap(currentStreak);
  } catch (error) {
    const currentStreak = 0;
    renderSummary(currentStreak);
    renderRoadmap(currentStreak);
    toast.error(error.message || 'Could not load streak data. Showing roadmap defaults.');
  }
});
