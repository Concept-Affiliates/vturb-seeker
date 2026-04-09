(() => {
  'use strict';

  const POLL_INTERVAL = 1000;
  const BAR_ID = 'vturb-seeker-bar';

  const fmt = (s) => {
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  };

  const getInner = () => {
    try {
      return window.smartplayer?.instances?.[0]?.instance ?? null;
    } catch {
      return null;
    }
  };

  const injectBar = (inner) => {
    if (document.getElementById(BAR_ID)) return;

    const duration = inner.duration || 0;

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
          min-width: 340px;
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
          font-size: 10px;
          color: #888;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }
        #${BAR_ID} .vs-row {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
        }
        #${BAR_ID} input[type=range] {
          flex: 1;
          -webkit-appearance: none;
          appearance: none;
          height: 5px;
          border-radius: 3px;
          background: #444;
          outline: none;
          cursor: pointer;
          margin: 0;
        }
        #${BAR_ID} input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: #e50914;
          cursor: pointer;
        }
        #${BAR_ID} .vs-time {
          min-width: 90px;
          text-align: right;
          font-size: 12px;
          color: #ccc;
          white-space: nowrap;
        }
        #${BAR_ID} input[type=text] {
          flex: 1;
          background: #1a1a1a;
          border: 1px solid #444;
          border-radius: 6px;
          color: #fff;
          padding: 5px 8px;
          font-size: 13px;
          outline: none;
          min-width: 0;
        }
        #${BAR_ID} input[type=text]:focus { border-color: #e50914; }
        #${BAR_ID} .vs-btn {
          background: #e50914;
          border: none;
          border-radius: 6px;
          color: #fff;
          padding: 5px 14px;
          cursor: pointer;
          font-size: 13px;
          font-weight: bold;
          white-space: nowrap;
        }
        #${BAR_ID} .vs-btn:hover { background: #ff2020; }
        #${BAR_ID} .vs-close {
          position: absolute;
          top: 6px;
          right: 10px;
          cursor: pointer;
          color: #666;
          font-size: 15px;
          background: none;
          border: none;
          line-height: 1;
          padding: 0;
        }
        #${BAR_ID} .vs-close:hover { color: #fff; }
        #${BAR_ID} .vs-drag-handle {
          width: 32px;
          height: 4px;
          background: #444;
          border-radius: 2px;
          cursor: grab;
          margin-bottom: 2px;
        }
      </style>
      <div class="vs-drag-handle" id="vs-drag"></div>
      <button class="vs-close" id="vs-close" title="Close">✕</button>
      <span class="vs-label">⏩ Vturb Seeker — seek anywhere</span>
      <div class="vs-row">
        <input type="range" id="vs-slider" min="0" max="${Math.floor(duration)}" value="${Math.floor(inner.currentTime)}" step="1">
        <span class="vs-time" id="vs-time">${fmt(inner.currentTime)} / ${fmt(duration)}</span>
      </div>
      <div class="vs-row">
        <input type="text" id="vs-input" placeholder="e.g. 5:30  or  330 (seconds)">
        <button class="vs-btn" id="vs-go">Go</button>
      </div>
    `;

    document.body.appendChild(bar);

    const slider = bar.querySelector('#vs-slider');
    const timeLabel = bar.querySelector('#vs-time');
    const input = bar.querySelector('#vs-input');
    const goBtn = bar.querySelector('#vs-go');
    const closeBtn = bar.querySelector('#vs-close');
    const dragHandle = bar.querySelector('#vs-drag');

    const doSeek = (secs) => {
      secs = Math.max(0, Math.min(secs, inner.duration));
      inner.seek(secs);
      slider.value = Math.floor(secs);
      timeLabel.textContent = `${fmt(secs)} / ${fmt(inner.duration)}`;
    };

    // Sync slider with playback
    const syncInterval = setInterval(() => {
      if (!document.getElementById(BAR_ID)) { clearInterval(syncInterval); return; }
      const ct = inner.currentTime;
      if (!slider.matches(':active')) {
        slider.value = Math.floor(ct);
      }
      timeLabel.textContent = `${fmt(ct)} / ${fmt(inner.duration)}`;
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

    closeBtn.addEventListener('click', () => {
      clearInterval(syncInterval);
      bar.remove();
    });

    // Draggable
    let dragging = false, startX = 0, startY = 0, origLeft = 0, origBottom = 0;
    dragHandle.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = bar.getBoundingClientRect();
      origLeft = rect.left;
      origBottom = window.innerHeight - rect.bottom;
      bar.style.left = `${origLeft}px`;
      bar.style.bottom = `${origBottom}px`;
      bar.style.transform = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      bar.style.left = `${origLeft + (e.clientX - startX)}px`;
      bar.style.bottom = `${origBottom - (e.clientY - startY)}px`;
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  };

  // Poll until smartplayer is ready with a real video loaded
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    if (attempts > 60) { clearInterval(poll); return; } // give up after 60s

    const inner = getInner();
    if (!inner) return;

    const dur = inner.duration;
    if (!dur || dur < 10) return; // placeholder or not loaded yet

    clearInterval(poll);
    injectBar(inner);
  }, POLL_INTERVAL);
})();
