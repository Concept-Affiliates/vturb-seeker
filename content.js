(() => {
  'use strict';

  const POLL_INTERVAL = 1000;
  const BAR_ID = 'vturb-seeker-bar';
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // ── Formatting helpers ────────────────────────────────────────────────────

  const fmt = (s) => {
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  };

  // HH:MM:SS.mmm used in VTT files
  const fmtVtt = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = (s % 60).toFixed(3).padStart(6, '0');
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec}`;
  };

  // ── Player detection ──────────────────────────────────────────────────────

  // Returns the first usable <video> element with substantial duration.
  const findVideoEl = () => {
    for (const v of document.querySelectorAll('video')) {
      if (v.duration > 10) return v;
    }
    return null;
  };

  // Wraps various player APIs into a uniform adapter object.
  const detectPlayer = () => {
    // 1. Vturb / Converteai (smartplayer)
    try {
      const inner = window.smartplayer?.instances?.[0]?.instance;
      if (inner && inner.duration > 10) {
        const videoEl = findVideoEl();
        return {
          type: 'vturb',
          get currentTime() { return inner.currentTime; },
          get duration()    { return inner.duration; },
          seek(s) {
            inner.seek(s);
            if (videoEl) videoEl.currentTime = s;
          },
          setSpeed(r) {
            // Video.js exposes playbackRate() as a getter/setter function
            if (typeof inner.playbackRate === 'function') inner.playbackRate(r);
            if (videoEl) videoEl.playbackRate = r;
          },
          videoEl,
        };
      }
    } catch { /* ignore */ }

    // 2. Vidalytics — detect by known container selectors or script presence
    const vidalyticsSelectors = [
      '.vidalytics__player video',
      '[id^="vidalytics"] video',
      '[class*="vidalytics"] video',
      '[data-vidalytics] video',
      '[data-player-id] video',
    ];
    for (const sel of vidalyticsSelectors) {
      const v = document.querySelector(sel);
      if (v && v.duration > 10) return makeVideoAdapter(v, 'vidalytics');
    }

    const hasVidalyticsScript = Array.from(document.querySelectorAll('script[src]'))
      .some(s => s.src && s.src.includes('vidalytics'));
    if (hasVidalyticsScript) {
      const v = findVideoEl();
      if (v) return makeVideoAdapter(v, 'vidalytics');
    }

    // 3. Generic HTML5 <video> fallback
    const v = findVideoEl();
    if (v) return makeVideoAdapter(v, 'generic');

    return null;
  };

  const makeVideoAdapter = (videoEl, type) => ({
    type,
    get currentTime() { return videoEl.currentTime; },
    get duration()    { return videoEl.duration; },
    seek(s)           { videoEl.currentTime = s; },
    setSpeed(r)       { videoEl.playbackRate = r; },
    videoEl,
  });

  // ── CC / transcript download ──────────────────────────────────────────────

  const downloadBlob = (content, filename, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const cuesFromTrack = (track) => {
    // Force the browser to load cues by making the track active
    const prev = track.mode;
    track.mode = 'hidden';
    return new Promise((resolve) => {
      const finish = () => resolve(Array.from(track.cues || []));
      if (track.cues && track.cues.length > 0) {
        track.mode = prev;
        finish();
      } else {
        track.addEventListener('load', () => { track.mode = prev; finish(); }, { once: true });
        setTimeout(() => { track.mode = prev; finish(); }, 3000);
      }
    });
  };

  const vttFromCues = (cues) => {
    let out = 'WEBVTT\n\n';
    for (const c of cues) {
      out += `${fmtVtt(c.startTime)} --> ${fmtVtt(c.endTime)}\n${c.text}\n\n`;
    }
    return out;
  };

  const downloadCC = async (player, statusEl) => {
    const { videoEl } = player;
    if (!videoEl) { alert('No video element found.'); return; }

    const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
    setStatus('⏳ Scanning for captions…');

    let downloaded = 0;

    // Strategy A: fetch from <track src="…"> — works even before the track is active
    const trackEls = Array.from(document.querySelectorAll('track[src]'))
      .filter(t => ['subtitles', 'captions', ''].includes(t.kind || ''));

    for (const el of trackEls) {
      const label = (el.label || el.srclang || 'CC').replace(/\s+/g, '_');
      try {
        const res = await fetch(el.src);
        if (!res.ok) continue;
        const text = await res.text();
        downloadBlob(text, `${label}_captions.vtt`, 'text/vtt');
        downloaded++;
        setStatus(`✅ Downloaded: ${label}`);
      } catch { /* cross-origin or network error – try textTracks */ }
    }

    // Strategy B: extract already-loaded cues from textTracks API
    for (const track of videoEl.textTracks || []) {
      if (!['subtitles', 'captions'].includes(track.kind)) continue;
      const label = (track.label || track.language || 'CC').replace(/\s+/g, '_');
      setStatus(`⏳ Loading cues for "${label}"…`);
      const cues = await cuesFromTrack(track);
      if (cues.length) {
        downloadBlob(vttFromCues(cues), `${label}_captions.vtt`, 'text/vtt');
        downloaded++;
        setStatus(`✅ Downloaded: ${label}`);
      }
    }

    if (!downloaded) {
      setStatus('❌ No captions found');
      setTimeout(() => setStatus(''), 3000);
    } else {
      setTimeout(() => setStatus(''), 3000);
    }
  };

  // ── UI ────────────────────────────────────────────────────────────────────

  const injectBar = (player) => {
    if (document.getElementById(BAR_ID)) return;

    const duration = player.duration || 0;

    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML = `
      <style>
        #${BAR_ID} {
          all: initial;
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483647;
          background: rgba(10,10,10,0.92);
          border: 1px solid #333;
          border-radius: 12px;
          padding: 10px 16px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          min-width: 360px;
          max-width: 92vw;
          box-shadow: 0 4px 24px rgba(0,0,0,0.6);
          font-family: -apple-system, Arial, sans-serif;
          color: #fff;
          font-size: 13px;
          box-sizing: border-box;
          cursor: default;
          user-select: none;
        }
        #${BAR_ID} * { box-sizing: border-box; font-family: inherit; }
        #${BAR_ID} .vs-label {
          font-size: 10px; color: #888; letter-spacing: 0.8px; text-transform: uppercase;
        }
        #${BAR_ID} .vs-badge {
          font-size: 9px; background: #222; border: 1px solid #444;
          border-radius: 4px; padding: 1px 5px; color: #888;
          margin-left: 6px; text-transform: uppercase;
        }
        #${BAR_ID} .vs-row {
          display: flex; align-items: center; gap: 8px; width: 100%;
        }
        #${BAR_ID} input[type=range] {
          flex: 1; -webkit-appearance: none; appearance: none;
          height: 5px; border-radius: 3px; background: #444;
          outline: none; cursor: pointer; margin: 0;
        }
        #${BAR_ID} input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 15px; height: 15px;
          border-radius: 50%; background: #e50914; cursor: pointer;
        }
        #${BAR_ID} .vs-time {
          min-width: 90px; text-align: right; font-size: 12px;
          color: #ccc; white-space: nowrap;
        }
        #${BAR_ID} input[type=text] {
          flex: 1; background: #1a1a1a; border: 1px solid #444;
          border-radius: 6px; color: #fff; padding: 5px 8px;
          font-size: 13px; outline: none; min-width: 0;
        }
        #${BAR_ID} input[type=text]:focus { border-color: #e50914; }
        #${BAR_ID} .vs-btn {
          background: #e50914; border: none; border-radius: 6px;
          color: #fff; padding: 5px 14px; cursor: pointer;
          font-size: 13px; font-weight: bold; white-space: nowrap;
        }
        #${BAR_ID} .vs-btn:hover { background: #ff2020; }
        #${BAR_ID} .vs-btn-cc {
          background: #1a1a2e; border: 1px solid #555; border-radius: 6px;
          color: #aac; padding: 5px 10px; cursor: pointer;
          font-size: 12px; white-space: nowrap;
        }
        #${BAR_ID} .vs-btn-cc:hover { background: #2a2a4e; color: #ccf; }
        #${BAR_ID} .vs-speed-btn {
          background: #1a1a1a; border: 1px solid #444; border-radius: 4px;
          color: #aaa; padding: 3px 7px; cursor: pointer; font-size: 12px;
          white-space: nowrap;
        }
        #${BAR_ID} .vs-speed-btn.active {
          background: #e50914; border-color: #e50914; color: #fff; font-weight: bold;
        }
        #${BAR_ID} .vs-speed-btn:hover:not(.active) { background: #2a2a2a; }
        #${BAR_ID} .vs-status {
          font-size: 11px; color: #aaa; min-height: 14px; text-align: center;
        }
        #${BAR_ID} .vs-close {
          position: absolute; top: 6px; right: 10px; cursor: pointer;
          color: #666; font-size: 15px; background: none; border: none;
          line-height: 1; padding: 0;
        }
        #${BAR_ID} .vs-close:hover { color: #fff; }
        #${BAR_ID} .vs-drag-handle {
          width: 32px; height: 4px; background: #444;
          border-radius: 2px; cursor: grab; margin-bottom: 2px;
        }
      </style>
      <div class="vs-drag-handle" id="vs-drag"></div>
      <button class="vs-close" id="vs-close" title="Close">✕</button>
      <span class="vs-label">⏩ Video Seeker <span class="vs-badge">${player.type}</span></span>
      <div class="vs-row">
        <input type="range" id="vs-slider" min="0" max="${Math.floor(duration)}" value="${Math.floor(player.currentTime)}" step="1">
        <span class="vs-time" id="vs-time">${fmt(player.currentTime)} / ${fmt(duration)}</span>
      </div>
      <div class="vs-row">
        <input type="text" id="vs-input" placeholder="e.g. 5:30  or  330 (seconds)">
        <button class="vs-btn" id="vs-go">Go</button>
        <button class="vs-btn-cc" id="vs-cc" title="Download closed-caption transcript">⬇ CC</button>
      </div>
      <div class="vs-row" style="flex-wrap:wrap;justify-content:center;gap:4px;">
        <span style="font-size:11px;color:#888;align-self:center;">Speed:</span>
        ${SPEEDS.map(s => `<button class="vs-speed-btn${s === 1 ? ' active' : ''}" data-speed="${s}">${s}×</button>`).join('')}
      </div>
      <div class="vs-status" id="vs-status"></div>
    `;

    document.body.appendChild(bar);

    const slider    = bar.querySelector('#vs-slider');
    const timeLabel = bar.querySelector('#vs-time');
    const input     = bar.querySelector('#vs-input');
    const goBtn     = bar.querySelector('#vs-go');
    const closeBtn  = bar.querySelector('#vs-close');
    const dragHandle= bar.querySelector('#vs-drag');
    const ccBtn     = bar.querySelector('#vs-cc');
    const statusEl  = bar.querySelector('#vs-status');
    const speedBtns = bar.querySelectorAll('.vs-speed-btn');

    const doSeek = (secs) => {
      secs = Math.max(0, Math.min(secs, player.duration));
      player.seek(secs);
      slider.value = Math.floor(secs);
      timeLabel.textContent = `${fmt(secs)} / ${fmt(player.duration)}`;
    };

    const syncInterval = setInterval(() => {
      if (!document.getElementById(BAR_ID)) { clearInterval(syncInterval); return; }
      const ct = player.currentTime;
      if (!slider.matches(':active')) slider.value = Math.floor(ct);
      timeLabel.textContent = `${fmt(ct)} / ${fmt(player.duration)}`;
    }, 500);

    slider.addEventListener('input', () => doSeek(Number(slider.value)));

    const parseTime = (val) => {
      val = val.trim();
      if (val.includes(':')) {
        const parts = val.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return parts[0] * 60 + parts[1];
      }
      return Number(val);
    };

    goBtn.addEventListener('click', () => {
      const secs = parseTime(input.value);
      if (!isNaN(secs)) doSeek(secs);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') goBtn.click();
    });

    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        player.setSpeed(speed);
        speedBtns.forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    ccBtn.addEventListener('click', () => downloadCC(player, statusEl));

    closeBtn.addEventListener('click', () => {
      clearInterval(syncInterval);
      bar.remove();
    });

    // Draggable
    let dragging = false, startX = 0, startY = 0, origLeft = 0, origBottom = 0;
    dragHandle.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      const rect = bar.getBoundingClientRect();
      origLeft   = rect.left;
      origBottom = window.innerHeight - rect.bottom;
      bar.style.left = `${origLeft}px`;
      bar.style.bottom = `${origBottom}px`;
      bar.style.transform = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      bar.style.left   = `${origLeft   + (e.clientX - startX)}px`;
      bar.style.bottom = `${origBottom - (e.clientY - startY)}px`;
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  };

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  let attempts = 0;
  const poll = setInterval(() => {
    if (++attempts > 60) { clearInterval(poll); return; }
    const player = detectPlayer();
    if (!player) return;
    clearInterval(poll);
    injectBar(player);
  }, POLL_INTERVAL);
})();
