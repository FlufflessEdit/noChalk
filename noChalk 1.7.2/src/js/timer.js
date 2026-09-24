/*  noCHalk
      by Fluffless
      timer.js
*/
"use strict";
/* ================= floating clock + lesson timer =================
   A small always-on-top window in the bottom-right corner (drag the clock
   to move it elsewhere — it is always anchored by its LOWER edge, so
   expanding or collapsing the timer never moves the clock itself).
   Click the clock: it expands upwards into a minutes timer — enter
   minutes, press ▶. While it runs, the panel shows only the minutes left
   and a ring around the window drains from the top, slowly turning from
   green to red. When the time is up, a gentle bell rings (it stops by
   itself after 10 s, then the window collapses back to the clock).
   ■ — or a click on the clock while running/ringing — cancels everything
   and collapses too. */

(function () {
  const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none"/></svg>';
  const STOP_SVG = '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="0" fill="currentColor" stroke="none"/></svg>';

  const fc = el("div");
  fc.id = "floatClock";
  fc.className = "fclock";
  fc.innerHTML = `
    <div class="fc-body">
      <div class="fc-wrap"><div class="fc-panel">
        <input class="fc-in" type="text" inputmode="numeric" maxlength="3" placeholder="min" spellcheck="false" autocomplete="off">
        <span class="fc-left"></span>
        <button class="fc-go" title="Start the timer">${PLAY_SVG}</button>
      </div></div>
      <div class="fc-clock" title="Click: timer / stop — drag: move the clock"></div>
    </div>
    <svg class="fc-ring" aria-hidden="true">
      <defs><clipPath id="fcClip"><rect x="0" y="0" width="10" height="10"></rect></clipPath></defs>
      <g clip-path="url(#fcClip)"><rect class="fc-ring-r" x="1.5" y="1.5" rx="8"></rect></g>
    </svg>`;
  document.body.append(fc);

  const inEl = fc.querySelector(".fc-in"),
    leftEl = fc.querySelector(".fc-left"),
    goBtn = fc.querySelector(".fc-go"),
    clockEl = fc.querySelector(".fc-clock"),
    ringSvg = fc.querySelector(".fc-ring"),
    ringRect = fc.querySelector(".fc-ring-r"),
    clipRect = fc.querySelector("clipPath rect");

  /* ---- the clock itself: unchanged H:M:S ---- */
  const p2 = (v) => String(v).padStart(2, "0");
  const paintClock = () => {
    const d = new Date();
    clockEl.textContent = p2(d.getHours()) + ":" + p2(d.getMinutes());
  };
  paintClock();
  setInterval(paintClock, 1000);

  /* ---- state ---- */
  let open = false;
  let timer = null; /* { end, dur, iv } */
  let ringing = false;
  let ringT = null; /* the 10 s autostop */
  let audio = null,
    bellGain = null;

  function setOpen(v) {
    open = v;
    fc.classList.toggle("open", v);
    if (v) setTimeout(() => inEl.focus(), 140);
  }

  /* ---- the ring: full green, drains top→bottom, green → red ---- */
  const GREEN = [63, 154, 63],
    RED = [179, 39, 29];
  function paintRing(p) {
    const W = fc.offsetWidth,
      H = fc.offsetHeight;
    if (!W || !H) return;
    p = Math.max(0, Math.min(1, p));
    ringSvg.setAttribute("width", W);
    ringSvg.setAttribute("height", H);
    ringRect.setAttribute("width", Math.max(6, W - 3));
    ringRect.setAttribute("height", Math.max(6, H - 3));
    const lvl = p * H;
    clipRect.setAttribute("width", W);
    clipRect.setAttribute("y", lvl);
    clipRect.setAttribute("height", H - lvl);
    const c = GREEN.map((v, i) => Math.round(v + (RED[i] - v) * p));
    ringRect.setAttribute("stroke", "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")");
  }
  if (window.ResizeObserver)
    new ResizeObserver(() => {
      if (timer) paintRing(1 - (timer.end - Date.now()) / timer.dur);
    }).observe(fc);

  /* ---- the bell: synthesized with Web Audio, no asset, works offline ----
     The AudioContext is created inside the start-button click (a user
     gesture) so it is allowed to sound later, when the timer fires. */
  function ensureAudio() {
    if (!audio) {
      try {
        audio = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audio = null;
      }
    }
    if (audio && audio.state === "suspended") audio.resume().catch(() => {});
    return audio;
  }
  function strike(t) {
    /* a soft ding — three decaying sine partials */
    const parts = [
      [1318.5, 0.13, 1.9],
      [2637.0, 0.04, 1.1],
      [880.0, 0.05, 2.2],
    ];
    for (const [f, vol, dur] of parts) {
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(bellGain);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }
  function ring() {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      bellGain = ctx.createGain();
      bellGain.gain.value = 1;
      bellGain.connect(ctx.destination);
      const t0 = ctx.currentTime + 0.05;
      for (let i = 0; i < 5; i++) strike(t0 + i * 1.9); /* five dings inside the 10 s window */
    } catch (e) {}
  }
  function silence() {
    if (!bellGain || !audio) return;
    const g = bellGain,
      ctx = audio;
    bellGain = null;
    try {
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.09);
      setTimeout(() => {
        try {
          g.disconnect();
        } catch (e) {}
      }, 300);
    } catch (e) {}
  }

  /* ---- running ---- */
  function tick() {
    if (!timer) return;
    const left = timer.end - Date.now();
    if (left <= 0) {
      fire();
      return;
    }
    leftEl.textContent = Math.ceil(left / 60000) + " min";
    paintRing(1 - left / timer.dur);
  }
  function fire() {
    clearInterval(timer.iv);
    timer = null;
    leftEl.textContent = "0 min";
    paintRing(1);
    ringing = true;
    ring();
    ringT = setTimeout(stopAll, 10000); /* ringing autostops, then collapse */
  }
  function startTimer() {
    const m = parseInt(inEl.value, 10);
    if (!isFinite(m) || m < 1) {
      toast("Enter the minutes first");
      inEl.focus();
      return;
    }
    ensureAudio(); /* the context must be born inside this click */
    const dur = Math.min(999, m) * 60000;
    timer = { end: Date.now() + dur, dur, iv: setInterval(tick, 250) };
    fc.classList.add("running");
    goBtn.classList.add("stop");
    goBtn.title = "Stop the timer and the ringing";
    goBtn.innerHTML = STOP_SVG;
    ringSvg.style.display = "block";
    tick();
  }
  function stopAll() {
    if (timer) {
      clearInterval(timer.iv);
      timer = null;
    }
    clearTimeout(ringT);
    ringT = null;
    silence();
    ringing = false;
    fc.classList.remove("running");
    goBtn.classList.remove("stop");
    goBtn.title = "Start the timer";
    goBtn.innerHTML = PLAY_SVG;
    ringSvg.style.display = "none";
    setOpen(false);
  }

  goBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (timer || ringing) stopAll();
    else startTimer();
  });
  inEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      startTimer();
    }
  });
  inEl.addEventListener("input", () => {
    inEl.value = inEl.value.replace(/\D/g, "").slice(0, 3);
  });

  /* ---- the clock: click toggles / stops, drag moves ---- */
  clockEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      clockEl.setPointerCapture(e.pointerId);
    } catch (err) {}
    const sx = e.clientX,
      sy = e.clientY,
      r = fc.getBoundingClientRect();
    let moved = false;
    const mv = (e2) => {
      const dx = e2.clientX - sx,
        dy = e2.clientY - sy;
      if (!moved) {
        if (Math.hypot(dx, dy) < 8) return;
        moved = true;
        /* re-anchor by the LOWER edge: the window keeps growing upward
           from wherever it is parked, and the clock itself never moves
           when the panel expands or collapses */
        fc.style.right = "auto";
        fc.style.top = "auto";
        fc.style.left = r.left + "px";
        fc.style.bottom = innerHeight - r.bottom + "px";
      }
      fc.style.left = Math.max(0, Math.min(innerWidth - r.width, r.left + dx)) + "px";
      fc.style.bottom = Math.max(0, Math.min(innerHeight - r.height, innerHeight - (r.bottom + dy))) + "px";
    };
    const up = () => {
      clockEl.removeEventListener("pointermove", mv);
      clockEl.removeEventListener("pointerup", up);
      clockEl.removeEventListener("pointercancel", up);
      if (!moved) {
        /* a plain click: stop while running/ringing, otherwise toggle the panel */
        if (timer || ringing) stopAll();
        else setOpen(!open);
      }
    };
    clockEl.addEventListener("pointermove", mv);
    clockEl.addEventListener("pointerup", up);
    clockEl.addEventListener("pointercancel", up);
  });
})();
