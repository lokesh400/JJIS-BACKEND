// Anti-Piracy and Classroom logic

document.addEventListener('DOMContentLoaded', () => {
  // 1. Anti-Piracy: Disable Right Click Context Menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });

  // 2. Anti-Piracy: Disable Inspector Shortcut Keys
  document.addEventListener('keydown', (e) => {
    // F12 key
    if (e.keyCode === 123) {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+I (Inspect), Ctrl+Shift+J (Console), Ctrl+Shift+C (Element selector)
    if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
      e.preventDefault();
      return false;
    }
    // Ctrl+U (View Source)
    if (e.ctrlKey && e.keyCode === 85) {
      e.preventDefault();
      return false;
    }
    // Command+Option+I (Mac Inspect)
    if (e.metaKey && e.altKey && e.keyCode === 73) {
      e.preventDefault();
      return false;
    }
  });

  // 2.1 Anti-Piracy: Focus/Visibility Loss Obfuscation (prevents snipping tools, print-screen overlays, and system screenshot captures)
  const videoContainer = document.querySelector('.video-container');
  if (videoContainer) {
    const applyObfuscation = () => {
      videoContainer.classList.add('secure-blur');
      if (player && typeof player.pauseVideo === 'function') {
        try { player.pauseVideo(); } catch (e) {}
      }
    };

    const removeObfuscation = () => {
      videoContainer.classList.remove('secure-blur');
    };

    // Trigger blur overlay when browser window loses focus, ignoring if focus shifted to the YouTube player iframe
    window.addEventListener('blur', () => {
      setTimeout(() => {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'IFRAME' || activeEl.id === 'player-placeholder')) {
          // Do not obfuscate if user clicks inside the player to interact with it
          return;
        }
        applyObfuscation();
      }, 200);
    });

    window.addEventListener('focus', removeObfuscation);
    
    // Trigger blur overlay when visibility changes (switching tabs, lock screen, minimized)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        applyObfuscation();
      } else {
        removeObfuscation();
      }
    });

    // Disable dragging items inside the container
    videoContainer.addEventListener('dragstart', (e) => e.preventDefault());
  }

  // 2.2 Anti-Piracy: DevTools Detector & Blackout
  setInterval(() => {
    if (!videoContainer) return;
    if (window.innerWidth < 800) return; // Ignore on mobile and small viewports
    
    const threshold = 250; 
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    const isDevToolsOpen = (widthDiff > threshold) || (heightDiff > threshold);
      
    if (isDevToolsOpen) {
      // Avoid false positive on zoom levels
      const zoomRatio = window.devicePixelRatio || 1;
      if (zoomRatio < 1.4) {
        videoContainer.classList.add('secure-blur');
        if (player && typeof player.pauseVideo === 'function') {
          try { player.pauseVideo(); } catch (e) {}
        }
      }
    }
  }, 1500);

  // 2.3 Anti-Piracy: Prevent print screen attempt key combinations & print commands
  window.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
      navigator.clipboard.writeText(''); // Clear clipboard immediately
      alert('Screenshots are disabled on this portal.');
    }
  });

  // Block copy/paste/select inside classroom
  document.addEventListener('copy', (e) => e.preventDefault());
  document.addEventListener('cut', (e) => e.preventDefault());

  // 3. Setup tabs (Chat vs Notes)
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const activePane = document.getElementById(tabId);
      if (activePane) activePane.classList.add('active');
    });
  });

  // Decode the video ID
  let youtubeVideoId = '';
  if (window.CLASS_CONFIG && window.CLASS_CONFIG.token) {
    try {
      youtubeVideoId = atob(window.CLASS_CONFIG.token);
    } catch (e) {
      console.error('Failed to parse config');
    }
  }

  // 4. Initialize YouTube Iframe Player
  if (youtubeVideoId) {
    // Load YouTube Iframe Player API asynchronously
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }

  // 5. Watermark Movement
  setupWatermark();
});

// YouTube API Callback
let player;
function onYouTubeIframeAPIReady() {
  let videoId = '';
  if (window.CLASS_CONFIG && window.CLASS_CONFIG.token) {
    videoId = atob(window.CLASS_CONFIG.token);
  }

  if (!videoId) return;

  player = new YT.Player('player-placeholder', {
    height: '100%',
    width: '100%',
    videoId: videoId,
    playerVars: {
      'autoplay': 1,
      'controls': 0,          // Disable default player controls
      'disablekb': 1,          // Disable keyboard controls
      'fs': 0,                 // Hide full screen button
      'modestbranding': 1,     // Remove YouTube logo
      'rel': 0,                // Disable related videos at the end
      'showinfo': 0,           // Hide video title/uploader
      'iv_load_policy': 3,     // Hide video annotations
      'autohide': 1,
      'playsinline': 1,
      'origin': window.location.origin
    },
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

function onPlayerReady(event) {
  // Initialize Custom Controls
  setupCustomControls();
  // Play video automatically
  event.target.playVideo();
}

function onPlayerStateChange(event) {
  const playPauseIcon = document.getElementById('play-pause-icon');
  if (!playPauseIcon) return;

  if (event.data === YT.PlayerState.PLAYING) {
    playPauseIcon.className = 'fas fa-pause';
  } else {
    playPauseIcon.className = 'fas fa-play';
  }
}

// 6. Custom Controls Handling
function setupCustomControls() {
  const playPauseBtn = document.getElementById('play-pause-btn');
  const muteBtn = document.getElementById('mute-btn');
  const muteIcon = document.getElementById('mute-icon');
  const volumeSlider = document.getElementById('volume-slider');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const toggleChatBtn = document.getElementById('toggle-chat-btn');
  const classroomLayout = document.querySelector('.classroom-layout');
  const videoContainer = document.querySelector('.video-container');
  const progressCustom = document.querySelector('.progress-bar-custom');
  const progressFill = document.querySelector('.progress-fill');
  const timeDisplay = document.querySelector('.time-display');

  // Toggle chat sidebar (collapse live comments)
  if (toggleChatBtn && classroomLayout) {
    toggleChatBtn.addEventListener('click', () => {
      classroomLayout.classList.toggle('chat-collapsed');
      const icon = toggleChatBtn.querySelector('i');
      if (icon) {
        if (classroomLayout.classList.contains('chat-collapsed')) {
          icon.className = 'fas fa-comment-slash';
        } else {
          icon.className = 'fas fa-comments';
        }
      }
    });
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      if (!player || typeof player.getPlayerState !== 'function') return;
      const state = player.getPlayerState();
      if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    });
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (!player || typeof player.isMuted !== 'function') return;
      if (player.isMuted()) {
        player.unMute();
        muteIcon.className = 'fas fa-volume-up';
        volumeSlider.value = player.getVolume();
      } else {
        player.mute();
        muteIcon.className = 'fas fa-volume-mute';
        volumeSlider.value = 0;
      }
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      if (!player || typeof player.setVolume !== 'function') return;
      const volume = e.target.value;
      player.setVolume(volume);
      if (volume == 0) {
        if (typeof player.mute === 'function') player.mute();
        muteIcon.className = 'fas fa-volume-mute';
      } else {
        if (typeof player.unMute === 'function') player.unMute();
        muteIcon.className = 'fas fa-volume-up';
      }
    });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        videoContainer.requestFullscreen().catch(err => {
          console.error('Error entering fullscreen:', err.message);
        });
      } else {
        document.exitFullscreen();
      }
    });
  }

  // Handle mobile rotation during fullscreen toggle
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === videoContainer) {
      // Rotate device screen to landscape automatically in fullscreen
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } else {
      // Restore device screen to portrait upon exiting fullscreen
      if (screen.orientation) {
        if (typeof screen.orientation.unlock === 'function') {
          screen.orientation.unlock();
        }
        if (typeof screen.orientation.lock === 'function') {
          screen.orientation.lock('portrait').catch(() => {});
        }
      }
    }
  });

  // Update progress bar & time
  setInterval(() => {
    if (player && typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function') {
      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();
      const isLive = window.CLASS_CONFIG && window.CLASS_CONFIG.status === 'live';

      if (!isLive && duration > 0) {
        const percent = (currentTime / duration) * 100;
        if (progressFill) progressFill.style.width = percent + '%';
        if (timeDisplay) {
          timeDisplay.textContent = formatTime(currentTime) + ' / ' + formatTime(duration);
        }
      } else if (isLive) {
        // Live stream
        if (timeDisplay) timeDisplay.textContent = 'LIVE';
        if (progressFill) progressFill.style.width = '100%';
      } else {
        if (timeDisplay) timeDisplay.textContent = '0:00 / 0:00';
        if (progressFill) progressFill.style.width = '0%';
      }
    }
  }, 1000);

  if (progressCustom) {
    progressCustom.addEventListener('click', (e) => {
      const duration = player.getDuration();
      if (duration > 0) {
        const rect = progressCustom.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        player.seekTo(pos * duration, true);
      }
    });
  }
}

function formatTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// 7. Watermark Movement Logic
function setupWatermark() {
  const videoContainer = document.querySelector('.video-container');
  if (!videoContainer) return;

  const watermarks = [
    { el: document.getElementById('watermark-1'), speed: 4000 },
    { el: document.getElementById('watermark-2'), speed: 6000 },
    { el: document.getElementById('watermark-3'), speed: 8000 }
  ];

  watermarks.forEach(item => {
    const wm = item.el;
    if (!wm) return;

    function move() {
      const containerWidth = videoContainer.clientWidth;
      const containerHeight = videoContainer.clientHeight;
      const wmWidth = wm.clientWidth || 250;
      const wmHeight = wm.clientHeight || 25;

      const maxX = containerWidth - wmWidth - 25;
      const maxY = containerHeight - wmHeight - 70; // Stay clear of controls bar

      const randomX = Math.max(15, Math.floor(Math.random() * maxX));
      const randomY = Math.max(15, Math.floor(Math.random() * maxY));

      wm.style.transition = `all ${item.speed / 1000 - 0.5}s ease-in-out`;
      wm.style.left = randomX + 'px';
      wm.style.top = randomY + 'px';
    }

    move();
    setInterval(move, item.speed);
  });
}

// 8. Socket.io Live Chat implementation
function initChat(classId, user) {
  const socket = io();

  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');

  if (!chatForm || !chatInput || !chatMessages) return;

  // Join the chat room for this class
  socket.emit('joinRoom', { classId, user });

  // Listen for historical messages
  socket.on('loadHistory', (messages) => {
    chatMessages.innerHTML = '';
    messages.forEach(msg => appendMessage(msg));
    scrollToBottom();
  });

  // Listen for new messages
  socket.on('message', (msg) => {
    appendMessage(msg);
    scrollToBottom();
  });

  // Send message
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const messageText = chatInput.value.trim();
    if (!messageText) return;

    socket.emit('chatMessage', {
      classId,
      message: messageText
    });

    chatInput.value = '';
    chatInput.focus();
  });

  function appendMessage(msg) {
    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble');
    
    // Check sender
    if (msg.role === 'admin' || msg.role === 'teacher') {
      bubble.classList.add('teacher');
    }
    if (msg.userId === user.id || msg.userId === user._id) {
      bubble.classList.add('me');
    }

    const isTeacher = msg.role === 'admin' || msg.role === 'teacher';
    const roleBadge = isTeacher ? `<span class="chat-role-badge">Teacher</span>` : '';
    
    const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    bubble.innerHTML = `
      <div class="chat-meta">
        <span class="chat-user">${msg.username} ${roleBadge}</span>
        <span class="chat-time">${formattedTime}</span>
      </div>
      <div class="chat-text">${escapeHtml(msg.message)}</div>
    `;

    chatMessages.appendChild(bubble);
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
window.initChat = initChat;
