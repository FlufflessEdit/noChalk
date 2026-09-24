/*  noCHalk
      by Fluffless
      ui.js
*/
"use strict";
/* ================= toasts / dialogs / popovers / tooltips ================= */
function toast(msg, opt = {}) {
  const t = el("div", "toast");
  t.innerHTML = (opt.icon ? `<svg class="ic"><use href="#${opt.icon}"/></svg>` : "") + `<span>${esc(msg)}</span>`;
  if (opt.action) {
    const b = el("button", "ta", esc(opt.action.label));
    b.onclick = () => {
      opt.action.fn();
      t.remove();
    };
    t.append(b);
  }
  toastBox.append(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 320);
  }, opt.dur || 4200);
}
function progToast(msg) {
  const t = el("div", "toast");
  t.innerHTML = '<span class="spin"></span><span class="tx">' + esc(msg) + "</span>";
  toastBox.append(t);
  return {
    hide() {
      t.remove();
    },
    set(m) {
      t.querySelector(".tx").textContent = m;
    },
    done(m) {
      t.querySelector(".spin")?.remove();
      t.querySelector(".tx").textContent = m;
      setTimeout(() => {
        t.classList.add("out");
        setTimeout(() => t.remove(), 320);
      }, 4200);
    },
    fail(m) {
      this.done(m);
      t.classList.add("err");
    },
  };
}

function dialog(o) {
  return new Promise((res) => {
    const ov = el("div", "dlg-ov"),
      card = el("div", "dlg");
    let color = o.color;
    card.innerHTML =
      `<div class="dlg-t">${esc(o.title)}</div>${o.msg ? `<div class="dlg-m">${o.msg}</div>` : ""}` +
      (o.field !== undefined ? `<input class="dlg-in" spellcheck="false" value="${esc(o.field)}" placeholder="${esc(o.ph || "")}">` : "") +
      (o.swatches ? `<div class="dlg-sw"></div>` : "") +
      `<div class="dlg-b"><button class="btn" data-a="x">Cancel</button>${o.extra ? `<button class="btn" data-a="extra">${esc(o.extra)}</button>` : ""}<button class="btn ${o.danger ? "danger" : "go"}" data-a="ok">${esc(o.ok || "OK")}</button></div>`;
    ov.append(card);
    document.body.append(ov);
    if (o.swatches) {
      const row = card.querySelector(".dlg-sw");
      o.swatches.forEach((c) => {
        const s = el("button", "sw");
        s.style.background = c;
        if (c === o.color) s.classList.add("on");
        s.onclick = () => {
          color = c;
          row.querySelectorAll(".on").forEach((x) => x.classList.remove("on"));
          s.classList.add("on");
        };
        row.append(s);
      });
      const cl = el("label", "sw-cust", '<input type="color" title="Pick any colour">');
      cl.querySelector("input").addEventListener("input", (ev) => {
        color = ev.target.value;
        row.querySelectorAll(".on").forEach((x) => x.classList.remove("on"));
      });
      row.append(cl);
    }
    const inp = card.querySelector(".dlg-in");
    const done = (v) => {
      ov.remove();
      res(v);
    };
    card.querySelector("[data-a=x]").onclick = () => done(null);
    card.querySelector("[data-a=ok]").onclick = () => {
      if (o.field !== undefined && o.swatches) done({ name: (inp.value || "").trim(), color: color });
      else if (o.field !== undefined) done((inp.value || "").trim() || null);
      else done(true);
    };
    const exb = card.querySelector('[data-a="extra"]');
    if (exb)
      exb.onclick = () => {
        done(o.extraValue !== undefined ? o.extraValue : "extra");
      };
    ov.addEventListener("pointerdown", (e) => {
      if (e.target === ov) done(null);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") card.querySelector("[data-a=ok]").click();
      if (e.key === "Escape") done(null);
    });
    setTimeout(() => {
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 30);
  });
}

let popEl = null,
  popAnchor = null;
function closePop() {
  if (popEl) {
    popEl.remove();
    popEl = null;
    popAnchor = null;
    document.removeEventListener("pointerdown", popOutside, true);
  }
}
function popOutside(e) {
  if (popEl && !popEl.contains(e.target) && popAnchor && !popAnchor.contains(e.target)) closePop();
}
function openPop(anchor, node) {
  closePop();
  popEl = el("div", "pop");
  popEl.append(node);
  document.body.append(popEl);
  popAnchor = anchor;
  const a = anchor.getBoundingClientRect(),
    r = popEl.getBoundingClientRect();
  let x = Math.min(Math.max(8, a.left), innerWidth - r.width - 8),
    y = a.bottom + 7;
  if (y + r.height > innerHeight - 8) y = Math.max(8, a.top - r.height - 7);
  popEl.style.left = x + "px";
  popEl.style.top = y + "px";
  setTimeout(() => document.addEventListener("pointerdown", popOutside, true), 0);
}

function inlineRename(span, commit) {
  if (span.isContentEditable) return;
  const old = span.textContent;
  span.contentEditable = "true";
  span.classList.add("ren");
  selectIn(span);
  const fin = () => {
    if (!span.isContentEditable) return;
    span.contentEditable = "false";
    span.classList.remove("ren");
    const v = span.textContent.replace(/\s+/g, " ").trim() || old;
    span.textContent = v;
    if (v !== old) commit(v);
  };
  span.onblur = fin;
  span.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      span.blur();
    }
    if (e.key === "Escape") {
      span.textContent = old;
      span.blur();
    }
  };
}

(function startClock() {
  const p2 = (v) => String(v).padStart(2, "0");
  setInterval(() => {
    const c = document.getElementById("stClock");
    if (!c) return;
    const d = new Date();
    c.textContent = p2(d.getHours()) + ":" + p2(d.getMinutes());
  }, 1000);
})();

function swatchNode(colors, current, onPick) {
  const n = el("div", "pop-colors");
  colors.forEach((c) => {
    const s = el("button", "sw");
    s.style.background = c === "none" ? "transparent" : c;
    if (c === current) s.classList.add("on");
    s.title = c === "none" ? "No highlight" : c;
    s.onclick = () => onPick(c);
    n.append(s);
  });
  const cust = el("label", "sw-cust", '<input type="color" title="Pick any colour">');
  cust.querySelector("input").addEventListener("input", (ev) => onPick(ev.target.value));
  n.append(cust);
  return n;
}

$("#wordBtn").addEventListener("click", () => {
  if (popAnchor === $("#wordBtn")) {
    closePop();
    return;
  }
  const n = el("div", "pop-imp");
  n.innerHTML = `<div class="pi-t">noChalk</div>
    <div class="pi-r">Version ${APP_VERSION}</div>
    <div class="pi-r">Created by <b>Fluffless</b></div>
    <div class="pi-r">Contact: <a href="mailto:flufflessedit@gmail.com">flufflessedit@gmail.com</a></div>`;
  openPop($("#wordBtn"), n);
});

const tipEl = el("div", "tooltip");
document.body.append(tipEl);
let tipT = null;
document.querySelectorAll("[data-tip]").forEach((b) => {
  b.addEventListener("mouseenter", () => {
    clearTimeout(tipT);
    tipT = setTimeout(() => {
      tipEl.textContent = b.dataset.tip;
      tipEl.style.display = "block";
      const r = b.getBoundingClientRect();
      tipEl.style.left = Math.max(8, Math.min(innerWidth - tipEl.offsetWidth - 8, r.left + r.width / 2 - tipEl.offsetWidth / 2)) + "px";
      tipEl.style.top = r.bottom + 9 + "px";
    }, 500);
  });
  b.addEventListener("mouseleave", () => {
    clearTimeout(tipT);
    tipEl.style.display = "none";
  });
  b.addEventListener("pointerdown", () => {
    clearTimeout(tipT);
    tipEl.style.display = "none";
  });
});

/* ================= fullscreen & auto-hiding stack ================= */
fsBtn.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => toast("The browser blocked fullscreen"));
});
document.addEventListener("fullscreenchange", () => {
  const fs = !!document.fullscreenElement;
  fsBtn.classList.toggle("on", fs);
  fsBtn.querySelector("use").setAttribute("href", fs ? "#i-compress" : "#i-expand");
});
function setBarPinned(p) {
  barPinned = p;
  state.ui.barPinned = p;
  queueSave();
  barBtn.classList.toggle("on", p);
  if (p) document.body.classList.remove("barhide");
}
barBtn.addEventListener("click", () => setBarPinned(!barPinned));
function barRevealCheck(e) {
  if (barPinned) return;
  if (e.clientY <= 8) document.body.classList.remove("barhide");
  else if (e.clientY > 160 && e.pointerType === "mouse" && !popEl) document.body.classList.add("barhide");
}
document.addEventListener("pointermove", barRevealCheck);
document.addEventListener("pointerdown", (e) => {
  if (!barPinned && e.clientY <= 8) document.body.classList.remove("barhide");
});
