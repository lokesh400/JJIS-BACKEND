document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth('student');
  if (!user) return;

  const parts = window.location.pathname.split('/').filter(Boolean);
  const courseId = parts[2] || '';
  const params = new URLSearchParams(window.location.search);
  const requestedLectureId = params.get('lectureId') || '';
  let activeTab = params.get('tab') === 'attachments' ? 'attachments' : 'video';

  const loadingEl = document.getElementById('loading');
  const playerRootEl = document.getElementById('player-root');
  const playerPanelEl = document.getElementById('player-panel');
  const lectureListEl = document.getElementById('player-lecture-list');
  const courseNameEl = document.getElementById('player-course-name');
  const lectureTitleEl = document.getElementById('player-lecture-title');
  const backBtn = document.getElementById('back-btn');
  const tabVideoBtn = document.getElementById('tab-video');
  const tabAttachmentsBtn = document.getElementById('tab-attachments');
  const lessonStatsEl = document.getElementById('player-lesson-stats');
  const activeChipEl = document.getElementById('player-active-chip');
  const lectureSearchEl = document.getElementById('player-lecture-search');
  const prevLectureBtn = document.getElementById('prev-lecture');
  const nextLectureBtn = document.getElementById('next-lecture');

  // Sidebar Tab Elements
  const asideTabRoadmap = document.getElementById('aside-tab-roadmap');
  const asideTabChat = document.getElementById('aside-tab-chat');
  const roadmapPanel = document.getElementById('roadmap-panel');
  const chatPanel = document.getElementById('chat-panel');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  let course = null;
  let activeLecture = null;
  let socket = null;
  let lectureSearchQuery = '';
  let watermarkInterval = null;

  // Anti-Piracy Settings
  setupAntiPiracy();

  // Sidebar Tab Switch Handler
  if (asideTabRoadmap && asideTabChat && roadmapPanel && chatPanel) {
    asideTabRoadmap.addEventListener('click', () => {
      asideTabRoadmap.classList.add('active');
      asideTabRoadmap.classList.remove('text-white/80');
      asideTabChat.classList.remove('active');
      asideTabChat.classList.add('text-white/80');
      roadmapPanel.classList.remove('hidden');
      chatPanel.classList.add('hidden');
    });

    asideTabChat.addEventListener('click', () => {
      asideTabChat.classList.add('active');
      asideTabChat.classList.remove('text-white/80');
      asideTabRoadmap.classList.remove('active');
      asideTabRoadmap.classList.add('text-white/80');
      chatPanel.classList.remove('hidden');
      roadmapPanel.classList.add('hidden');
      
      const chatMessages = document.getElementById('chat-messages');
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setTabUi() {
    const videoActive = activeTab === 'video';
    tabVideoBtn.classList.toggle('active', videoActive);
    tabAttachmentsBtn.classList.toggle('active', !videoActive);

    if (activeChipEl) {
      activeChipEl.textContent = videoActive ? 'Video Mode' : 'Attachment Mode';
    }
  }

  function getActiveLectureIndex() {
    const lectures = Array.isArray(course?.lectures) ? course.lectures : [];
    return lectures.findIndex((lecture) => String(lecture._id) === String(activeLecture?._id));
  }

  function updateNavButtons() {
    const lectures = Array.isArray(course?.lectures) ? course.lectures : [];
    const index = getActiveLectureIndex();

    if (!prevLectureBtn || !nextLectureBtn) return;

    prevLectureBtn.disabled = index <= 0;
    nextLectureBtn.disabled = index === -1 || index >= lectures.length - 1;

    prevLectureBtn.classList.toggle('opacity-50', prevLectureBtn.disabled);
    nextLectureBtn.classList.toggle('opacity-50', nextLectureBtn.disabled);
  }

  function updateQuery() {
    const next = new URLSearchParams(window.location.search);
    next.set('lectureId', activeLecture?._id || '');
    next.set('tab', activeTab);
    window.history.replaceState({}, '', `${window.location.pathname}?${next.toString()}`);
  }

  async function renderPanel() {
    if (!activeLecture) {
      playerPanelEl.innerHTML = '<div class="h-full flex items-center justify-center text-sm text-white/60">No lecture selected.</div>';
      return;
    }

    lectureTitleEl.textContent = activeLecture.title || 'Lecture';

    const pdfs = Array.isArray(activeLecture.pdfs) ? activeLecture.pdfs : [];

    if (activeTab === 'attachments') {
      // Show attachments view
      if (window.player && typeof window.player.destroy === 'function') {
        try { window.player.destroy(); } catch (_) {}
      }
      playerPanelEl.innerHTML = `
        <div class="h-full overflow-auto p-4 md:p-6 bg-slate-50">
          <h2 class="text-lg font-bold mb-4 text-slate-800">Lecture Attachments</h2>
          ${pdfs.length === 0 ? `
            <div class="text-center py-12 text-slate-400 text-xs">
              <i class="fas fa-folder-open text-2xl mb-2 text-slate-300"></i>
              <p>No attachments available for this lecture.</p>
            </div>
          ` : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              ${pdfs.map((pdf, index) => `
                <a href="${sanitizeUrl(pdf.link)}" target="_blank" rel="noopener" class="p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition shadow-sm">
                  <p class="text-xs text-slate-500 font-bold uppercase tracking-wider">Attachment ${index + 1}</p>
                  <p class="text-sm font-semibold mt-1 text-slate-900">${escapeHtml(pdf.title || 'PDF')}</p>
                  <p class="text-xs text-blue-600 font-semibold mt-1">Open in new tab &rarr;</p>
                </a>
              `).join('')}
            </div>
          `}
        </div>
      `;
      return;
    }

    // Load active lecture playback token
    try {
      const playbackData = await API.get(`/courses/published/${courseId}/lectures/${activeLecture._id}/playback`);
      const youtubeVideoId = atob(playbackData.token);
      const status = playbackData.status || 'ended';

      // Setup window config for player scripts
      window.CLASS_CONFIG = { token: playbackData.token, status: status };

      // Always restore clean player HTML to reset DOM event listeners and indicators
      playerPanelEl.innerHTML = `
        <div class="video-container w-full relative bg-black">
          <div id="player-placeholder" class="absolute inset-0 w-full h-full"></div>
          <div id="tap-overlay"></div>
          <div id="devtools-overlay" class="dev-security-overlay absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 text-white opacity-0 pointer-events-none transition-opacity duration-300 text-center">
            <i class="fas fa-lock text-3xl mb-3 text-red-500"></i>
            <h2 class="text-lg font-bold text-red-500 mb-1">Security Blackout Active</h2>
            <p class="text-xs text-white/70 max-w-xs px-4">DevTools inspection or background window shifting detected. Close tools and return focus to resume play.</p>
          </div>
          <div id="watermark-1" class="watermark absolute z-15 text-[10px] text-white/30 font-mono pointer-events-none whitespace-nowrap transition-all duration-[5000ms]">${escapeHtml(user.email)} ${user.mobile ? `(${escapeHtml(user.mobile)})` : ''}</div>
          <div id="watermark-2" class="watermark absolute z-15 text-[10px] text-white/30 font-mono pointer-events-none whitespace-nowrap transition-all duration-[5000ms]">${escapeHtml(user.email)} ${user.mobile ? `(${escapeHtml(user.mobile)})` : ''}</div>
          <div id="watermark-3" class="watermark absolute z-15 text-[10px] text-white/30 font-mono pointer-events-none whitespace-nowrap transition-all duration-[5000ms]">${escapeHtml(user.email)} ${user.mobile ? `(${escapeHtml(user.mobile)})` : ''}</div>
          
          <div id="controls">
            <button id="btn-back">
              <svg viewBox="0 0 24 24"><path d="M12.5 12l5 4V8l-5 4zM6.5 12l5 4V8l-5 4zM5 8h2v8H5z"/></svg>
            </button>
            <button id="btn-play">
              <svg id="play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              <svg id="pause-icon" viewBox="0 0 24 24" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            </button>
            <button id="btn-fwd">
              <svg viewBox="0 0 24 24"><path d="M11.5 12l-5-4v8l5-4zM17.5 12l-5-4v8l5-4zM17 8h2v8h-2z"/></svg>
            </button>
            <div id="progress-wrap">
              <div id="progress-bg">
                <div id="progress-fill">
                  <div id="progress-handle"></div>
                </div>
              </div>
            </div>
            <div id="time-display">0:00 / 0:00</div>
            <button id="fullscreen-btn">
               <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            </button>
          </div>
        </div>
      `;

      // Initialize YouTube API and instantiate player
      loadYoutubePlayer(youtubeVideoId);

      // Start floating watermarks
      setupWatermarks();

      // Connect Chat Socket Room
      initLectureChat(activeLecture._id);

    } catch (error) {
      playerPanelEl.innerHTML = `<div class="h-full flex items-center justify-center text-sm text-red-500 font-semibold px-6 text-center">${escapeHtml(error.message || 'Unable to load signed playback URL')}</div>`;
    }
  }

  function loadYoutubePlayer(videoId) {
    if (window.player && typeof window.player.destroy === 'function') {
      try { window.player.destroy(); } catch (_) {}
    }

    const createPlayer = () => {
      window.player = new YT.Player('player-placeholder', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          'autoplay': 1,
          'controls': 0,
          'disablekb': 1,
          'fs': 0,
          'modestbranding': 1,
          'rel': 0,
          'showinfo': 0,
          'iv_load_policy': 3,
          'autohide': 1,
          'playsinline': 1,
          'origin': window.location.origin
        },
        events: {
          'onReady': onPlayerReady,
          'onStateChange': onPlayerStateChange
        }
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (!document.querySelector('script[src*="iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }
  }

  let hideControlsTimer;

  function resetControlsTimer() {
    const controls = document.getElementById('controls');
    if (controls) {
      controls.classList.remove('hidden');
      clearTimeout(hideControlsTimer);
      hideControlsTimer = setTimeout(() => {
        controls.classList.add('hidden');
      }, 3000);
    }
  }

  function onPlayerReady(event) {
    setupCustomControls();
    event.target.playVideo();
    resetControlsTimer();
  }

  function onPlayerStateChange(event) {
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    if (!playIcon || !pauseIcon) return;

    if (event.data === YT.PlayerState.PLAYING) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
    resetControlsTimer();
  }

  function setupCustomControls() {
    const playPauseBtn = document.getElementById('btn-play');
    const seekBackwardBtn = document.getElementById('btn-back');
    const seekForwardBtn = document.getElementById('btn-fwd');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const videoContainer = document.querySelector('.video-container');
    const progressWrap = document.getElementById('progress-wrap');
    const progressFill = document.getElementById('progress-fill');
    const timeDisplay = document.getElementById('time-display');
    const tapOverlay = document.getElementById('tap-overlay');

    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        resetControlsTimer();
        if (!window.player || typeof window.player.getPlayerState !== 'function') return;
        const state = window.player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
          window.player.pauseVideo();
        } else {
          window.player.playVideo();
        }
      });
    }

    if (tapOverlay) {
      tapOverlay.addEventListener('click', () => {
        const controls = document.getElementById('controls');
        if (!controls) return;
        if (controls.classList.contains('hidden')) {
          resetControlsTimer();
        } else {
          controls.classList.add('hidden');
          clearTimeout(hideControlsTimer);
        }
      });

      tapOverlay.addEventListener('dblclick', () => {
        if (videoContainer) {
          if (!document.fullscreenElement) {
            videoContainer.requestFullscreen().catch(err => {
              console.error('Error entering fullscreen:', err.message);
            });
          } else {
            document.exitFullscreen();
          }
        }
      });
    }

    if (seekBackwardBtn) {
      seekBackwardBtn.addEventListener('click', () => {
        resetControlsTimer();
        if (!window.player || typeof window.player.getCurrentTime !== 'function') return;
        const currentTime = window.player.getCurrentTime();
        window.player.seekTo(Math.max(0, currentTime - 10), true);
      });
    }

    if (seekForwardBtn) {
      seekForwardBtn.addEventListener('click', () => {
        resetControlsTimer();
        if (!window.player || typeof window.player.getCurrentTime !== 'function' || typeof window.player.getDuration !== 'function') return;
        const currentTime = window.player.getCurrentTime();
        const duration = window.player.getDuration();
        window.player.seekTo(Math.min(duration, currentTime + 10), true);
      });
    }

    if (fullscreenBtn && videoContainer) {
      fullscreenBtn.addEventListener('click', () => {
        resetControlsTimer();
        if (!document.fullscreenElement) {
          videoContainer.requestFullscreen().catch(err => {
            console.error('Error entering fullscreen:', err.message);
          });
        } else {
          document.exitFullscreen();
        }
      });
    }

    // Clean any existing interval
    if (window.controlsInterval) clearInterval(window.controlsInterval);

    window.controlsInterval = setInterval(() => {
      if (window.player && typeof window.player.getCurrentTime === 'function' && typeof window.player.getDuration === 'function') {
        const currentTime = window.player.getCurrentTime();
        const duration = window.player.getDuration();
        const isLive = window.CLASS_CONFIG && window.CLASS_CONFIG.status === 'live';

        if (duration > 0) {
          const percent = (currentTime / duration) * 100;
          if (progressFill) progressFill.style.width = percent + '%';
          if (timeDisplay) {
            timeDisplay.textContent = formatTime(currentTime) + ' / ' + formatTime(duration);
          }
        } else if (isLive) {
          if (timeDisplay) timeDisplay.textContent = 'LIVE';
          if (progressFill) progressFill.style.width = '100%';
        } else {
          if (timeDisplay) timeDisplay.textContent = '0:00 / 0:00';
          if (progressFill) progressFill.style.width = '0%';
        }
      }
    }, 1000);

    if (progressWrap) {
      progressWrap.addEventListener('click', (e) => {
        resetControlsTimer();
        const duration = window.player.getDuration();
        if (duration > 0) {
          const rect = progressWrap.getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          window.player.seekTo(pos * duration, true);
        }
      });
    }
  }

  function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }

  function setupWatermarks() {
    if (watermarkInterval) clearInterval(watermarkInterval);

    const videoContainer = document.querySelector('.video-container');
    if (!videoContainer) return;

    const watermarks = [
      { el: document.getElementById('watermark-1'), speed: 5000 },
      { el: document.getElementById('watermark-2'), speed: 7000 },
      { el: document.getElementById('watermark-3'), speed: 9000 }
    ];

    const moveWatermark = (wm, speed) => {
      if (!wm) return;
      const containerWidth = videoContainer.clientWidth || 800;
      const containerHeight = videoContainer.clientHeight || 450;
      const wmWidth = wm.clientWidth || 180;
      const wmHeight = wm.clientHeight || 20;

      const maxX = Math.max(10, containerWidth - wmWidth - 20);
      const maxY = Math.max(10, containerHeight - wmHeight - 65); // Clear custom controls

      const randomX = Math.max(10, Math.floor(Math.random() * maxX));
      const randomY = Math.max(10, Math.floor(Math.random() * maxY));

      wm.style.transition = `all ${speed / 1000 - 0.5}s ease-in-out`;
      wm.style.left = randomX + 'px';
      wm.style.top = randomY + 'px';
    };

    watermarks.forEach(item => {
      moveWatermark(item.el, item.speed);
    });

    watermarkInterval = setInterval(() => {
      watermarks.forEach(item => {
        moveWatermark(item.el, item.speed);
      });
    }, 5000);
  }

  function initLectureChat(lectureId) {
    if (socket) {
      socket.disconnect();
    }

    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      chatMessages.innerHTML = '';
    }

    socket = io();
    socket.emit('joinRoom', { classId: lectureId, user: chatUser });

    socket.on('loadHistory', (messages) => {
      if (chatMessages) {
        chatMessages.innerHTML = '';
        messages.forEach(msg => appendMessage(msg));
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    });

    socket.on('message', (msg) => {
      if (chatMessages) {
        appendMessage(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    });
  }

  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text || !activeLecture) return;

      socket.emit('chatMessage', {
        classId: activeLecture._id,
        message: text
      });

      chatInput.value = '';
      chatInput.focus();
    });
  }

  function appendMessage(msg) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble !text-slate-900';
    
    // Check sender
    if (msg.role === 'admin' || msg.role === 'teacher') {
      bubble.classList.add('teacher');
    }
    if (msg.userId === chatUser.id || msg.userId === chatUser._id) {
      bubble.classList.add('me');
    }

    const isTeacher = msg.role === 'admin' || msg.role === 'teacher';
    const roleBadge = isTeacher ? `<span class="chat-role-badge">Teacher</span>` : '';
    
    const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    bubble.innerHTML = `
      <div class="chat-meta">
        <span class="chat-user">${escapeHtml(msg.username)} ${roleBadge}</span>
        <span class="chat-time">${formattedTime}</span>
      </div>
      <div class="chat-text">${escapeHtml(msg.message)}</div>
    `;

    chatMessages.appendChild(bubble);
  }

  function setupAntiPiracy() {
    // 1. Disable contextmenu
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    });

    // 2. Disable inspector shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.keyCode === 123) {
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
        return false;
      }
      if (e.metaKey && e.altKey && e.keyCode === 73) {
        e.preventDefault();
        return false;
      }
    });

    // 3. Focus/Visibility Loss Obfuscation
    const applyObfuscation = () => {
      const vContainer = document.querySelector('.video-container');
      const devtoolsOverlay = document.getElementById('devtools-overlay');
      if (vContainer) vContainer.classList.add('secure-blur');
      if (devtoolsOverlay) devtoolsOverlay.classList.add('active');
      if (window.player && typeof window.player.pauseVideo === 'function') {
        try { window.player.pauseVideo(); } catch (_) {}
      }
    };

    const removeObfuscation = () => {
      const vContainer = document.querySelector('.video-container');
      const devtoolsOverlay = document.getElementById('devtools-overlay');
      if (vContainer) vContainer.classList.remove('secure-blur');
      if (devtoolsOverlay) devtoolsOverlay.classList.remove('active');
    };

    window.addEventListener('blur', () => {
      setTimeout(() => {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'IFRAME' || activeEl.id === 'player-placeholder')) {
          return;
        }
        applyObfuscation();
      }, 200);
    });

    window.addEventListener('focus', removeObfuscation);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) applyObfuscation();
      else removeObfuscation();
    });

    // 4. DevTools window size check
    setInterval(() => {
      if (window.innerWidth < 800) return;
      const threshold = 250; 
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > threshold || heightDiff > threshold) {
        const zoomRatio = window.devicePixelRatio || 1;
        if (zoomRatio < 1.4) {
          applyObfuscation();
        }
      }
    }, 1500);

    // 5. Block Clipboard screenshots notice
    window.addEventListener('keyup', (e) => {
      if (e.key === 'PrintScreen') {
        navigator.clipboard.writeText('');
        toast.error('Screenshots are disabled on this portal.');
      }
    });
  }

  const expandedSubjects = new Set();
  const expandedChapters = new Set();

  function getCompiledLectures() {
    let lectures = Array.isArray(course?.lectures) ? course.lectures : [];
    if (lectures.length === 0 && Array.isArray(course?.subjects)) {
      course.subjects.forEach(s => {
        if (s && Array.isArray(s.chapters)) {
          s.chapters.forEach(c => {
            if (c && Array.isArray(c.lectures)) {
              lectures = lectures.concat(c.lectures);
            }
          });
        }
      });
    }
    return lectures;
  }

  function expandActiveLectureAncestors() {
    if (!activeLecture || !Array.isArray(course?.subjects)) return;
    course.subjects.forEach((subj, sIndex) => {
      if (subj && Array.isArray(subj.chapters)) {
        subj.chapters.forEach((chap, cIndex) => {
          if (chap && Array.isArray(chap.lectures)) {
            const hasActive = chap.lectures.some(l => String(l._id) === String(activeLecture._id));
            if (hasActive) {
              expandedSubjects.add(String(subj._id || sIndex));
              expandedChapters.add(String(chap._id || (sIndex + '-' + cIndex)));
            }
          }
        });
      }
    });
  }

  function renderLectureList() {
    if (!course) return;

    const subjects = Array.isArray(course.subjects) ? course.subjects : [];

    // Check if we have hierarchical subjects
    if (subjects.length > 0) {
      let subjectHtml = '';
      let matchCount = 0;

      subjects.forEach((subject, sIndex) => {
        const sKey = String(subject._id || sIndex);
        const chapters = Array.isArray(subject.chapters) ? subject.chapters : [];
        let chaptersHtml = '';
        let subjectHasMatches = false;

        chapters.forEach((chapter, cIndex) => {
          const cKey = String(chapter._id || (sIndex + '-' + cIndex));
          const lectures = Array.isArray(chapter.lectures) ? chapter.lectures : [];

          // Filter lectures matching search
          const filteredLectures = lectures.filter(lecture => {
            if (!lectureSearchQuery) return true;
            return String(lecture.title || '').toLowerCase().includes(lectureSearchQuery);
          });

          if (filteredLectures.length === 0) return;

          subjectHasMatches = true;
          matchCount += filteredLectures.length;

          if (lectureSearchQuery) {
            expandedChapters.add(cKey);
          }

          const isChapExpanded = expandedChapters.has(cKey);

          const lecturesHtml = filteredLectures.map(lecture => {
            const isActive = String(lecture._id) === String(activeLecture?._id);
            const pdfCount = Array.isArray(lecture.pdfs) ? lecture.pdfs.length : 0;

            let statusBadge = '';
            if (lecture.status === 'live') {
              statusBadge = '<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse">LIVE</span>';
            } else if (lecture.status === 'scheduled') {
              statusBadge = '<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-600 text-white">UPCOMING</span>';
            }

            return `
              <button
                type="button"
                data-lecture-id="${lecture._id}"
                class="pwplayer-lecture ${isActive ? 'active' : ''} w-full text-left rounded-xl border border-white/5 bg-white/5 px-2.5 py-2 hover:bg-white/10 transition flex flex-col gap-0.5"
              >
                <div class="flex items-center justify-between w-full">
                  <span class="text-[10px] text-white/40">Lecture</span>
                  ${statusBadge}
                </div>
                <p class="text-xs font-semibold text-white/95">${escapeHtml(lecture.title || 'Untitled')}</p>
                <p class="text-[10px] text-white/40">${lecture.videoLink ? 'Video available' : 'No video'} | ${pdfCount} attachments</p>
              </button>
            `;
          }).join('');

          chaptersHtml += `
            <div class="chapter-group border-l border-white/10 pl-2 ml-1">
              <button type="button" data-toggle-chapter="${cKey}" class="w-full flex items-center justify-between text-left py-1 text-white/80 hover:text-white transition">
                <span class="text-[11px] font-semibold tracking-wide uppercase text-slate-300 truncate">${escapeHtml(chapter.name)}</span>
                <i class="fas ${isChapExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} text-[9px] text-white/50"></i>
              </button>
              <div class="chapter-lectures-list space-y-1.5 mt-1 ${isChapExpanded ? '' : 'hidden'}">
                ${lecturesHtml}
              </div>
            </div>
          `;
        });

        if (!subjectHasMatches) return;

        if (lectureSearchQuery) {
          expandedSubjects.add(sKey);
        }

        const isSubjExpanded = expandedSubjects.has(sKey);

        subjectHtml += `
          <div class="subject-group bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <button type="button" data-toggle-subject="${sKey}" class="w-full flex items-center justify-between text-left px-3.5 py-2.5 bg-white/5 border-b border-white/5 hover:bg-white/10 transition">
              <span class="text-xs font-bold text-white tracking-wider uppercase truncate">${escapeHtml(subject.name)}</span>
              <i class="fas ${isSubjExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} text-xs text-white/60"></i>
            </button>
            <div class="subject-chapters-list p-2.5 space-y-2 ${isSubjExpanded ? '' : 'hidden'}">
              ${chaptersHtml}
            </div>
          </div>
        `;
      });

      if (matchCount === 0) {
        lectureListEl.innerHTML = '<div class="text-xs text-white/55 border border-white/10 rounded-xl p-3">No lecture found matching search criteria.</div>';
        return;
      }

      lectureListEl.innerHTML = subjectHtml;
      return;
    }

    // Fallback flat rendering
    const lectures = Array.isArray(course.lectures) ? course.lectures : [];
    const filtered = lectures.filter((lecture) => {
      if (!lectureSearchQuery) return true;
      const text = String(lecture?.title || '').toLowerCase();
      return text.includes(lectureSearchQuery);
    });

    if (!filtered.length) {
      lectureListEl.innerHTML = '<div class="text-xs text-white/55 border border-white/10 rounded-xl p-3">No lecture found.</div>';
      return;
    }

    lectureListEl.innerHTML = filtered
      .map((lecture) => {
        const index = lectures.findIndex((entry) => String(entry?._id) === String(lecture?._id));
        const isActive = String(lecture._id) === String(activeLecture?._id);
        const pdfCount = Array.isArray(lecture?.pdfs) ? lecture.pdfs.length : 0;

        let statusBadge = '';
        if (lecture.status === 'live') {
          statusBadge = '<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse">LIVE</span>';
        } else if (lecture.status === 'scheduled') {
          statusBadge = '<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-600 text-white">UPCOMING</span>';
        }

        return `
          <button
            type="button"
            data-lecture-id="${lecture._id}"
            class="pwplayer-lecture ${isActive ? 'active' : ''} w-full text-left rounded-xl border border-white/10 px-3 py-2.5 transition flex flex-col gap-1"
          >
            <div class="flex items-center justify-between w-full">
              <span class="text-xs text-white/50">Lecture ${index + 1}</span>
              ${statusBadge}
            </div>
            <p class="text-sm font-medium">${escapeHtml(lecture.title || 'Untitled')}</p>
            <p class="text-[11px] text-white/50">${lecture.videoLink ? 'Video available' : 'No video'} | ${pdfCount} attachments</p>
          </button>
        `;
      })
      .join('');
  }

  function setActiveLectureById(lectureId) {
    const lectures = getCompiledLectures();
    activeLecture = lectures.find((lecture) => String(lecture._id) === String(lectureId)) || lectures[0] || null;
    expandActiveLectureAncestors();
  }

  function renderAll() {
    const lectures = getCompiledLectures();
    if (lessonStatsEl) {
      lessonStatsEl.textContent = `${lectures.length} Lessons`;
    }

    setTabUi();
    renderLectureList();
    renderPanel();
    updateNavButtons();
    updateQuery();
  }

  lectureListEl.addEventListener('click', (event) => {
    // Check if toggle subject clicked
    const subjToggle = event.target.closest('[data-toggle-subject]');
    if (subjToggle) {
      const sKey = subjToggle.dataset.toggleSubject;
      if (expandedSubjects.has(sKey)) {
        expandedSubjects.delete(sKey);
      } else {
        expandedSubjects.add(sKey);
      }
      renderLectureList();
      return;
    }

    // Check if toggle chapter clicked
    const chapToggle = event.target.closest('[data-toggle-chapter]');
    if (chapToggle) {
      const cKey = chapToggle.dataset.toggleChapter;
      if (expandedChapters.has(cKey)) {
        expandedChapters.delete(cKey);
      } else {
        expandedChapters.add(cKey);
      }
      renderLectureList();
      return;
    }

    const button = event.target.closest('[data-lecture-id]');
    if (!button) return;
    setActiveLectureById(button.dataset.lectureId);
    renderAll();
  });

  tabVideoBtn.addEventListener('click', () => {
    activeTab = 'video';
    renderAll();
  });

  tabAttachmentsBtn.addEventListener('click', () => {
    activeTab = 'attachments';
    renderAll();
  });

  if (lectureSearchEl) {
    lectureSearchEl.addEventListener('input', (event) => {
      lectureSearchQuery = String(event.target?.value || '').trim().toLowerCase();
      renderLectureList();
    });
  }

  if (prevLectureBtn) {
    prevLectureBtn.addEventListener('click', () => {
      const lectures = getCompiledLectures();
      const index = getActiveLectureIndex();
      if (index <= 0) return;
      activeLecture = lectures[index - 1] || activeLecture;
      expandActiveLectureAncestors();
      renderAll();
    });
  }

  if (nextLectureBtn) {
    nextLectureBtn.addEventListener('click', () => {
      const lectures = getCompiledLectures();
      const index = getActiveLectureIndex();
      if (index === -1 || index >= lectures.length - 1) return;
      activeLecture = lectures[index + 1] || activeLecture;
      expandActiveLectureAncestors();
      renderAll();
    });
  }

  backBtn.addEventListener('click', () => {
    window.location.href = `/student/course/${courseId}`;
  });

  try {
    course = await API.get(`/courses/published/${courseId}`);
    courseNameEl.textContent = course.name || 'Course Player';
    setActiveLectureById(requestedLectureId);
    renderAll();
  } catch (error) {
    toast.error(error.message || 'Unable to open course player');
    window.location.href = '/student/purchase-courses';
    return;
  } finally {
    loadingEl.classList.add('hidden');
    playerRootEl.classList.remove('hidden');
  }
});

function sanitizeUrl(link) {
  const value = String(link || '').trim();
  if (!value) return '#';
  if (value.startsWith('/')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return '#';
}
