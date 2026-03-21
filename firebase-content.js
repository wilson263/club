// firebase-content.js
// Loads dynamic content from Firebase for public pages.

const firebaseConfig = {
  apiKey: "AIzaSyAkYeTlfnicPo1JczB4rZZj61UnHFbvqVE",
  authDomain: "neuralnexus-be2c7.firebaseapp.com",
  projectId: "neuralnexus-be2c7",
  storageBucket: "neuralnexus-be2c7.firebasestorage.app",
  messagingSenderId: "1094362929898",
  appId: "1:1094362929898:web:2c48716b8e23bbe05bd593",
  measurementId: "G-NCXVDWM2GP"
};

const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

let fbApp, db;

if (isConfigured && typeof firebase !== "undefined") {
  try {
    fbApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  } catch(e) {
    console.warn("Firebase init error:", e);
  }
}

// ── Animate a counter from 0 to target ──
function animateCounter(el, target) {
  const duration = 1200;
  const start = performance.now();
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target) + "+";
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Load announcements into ticker ──
async function loadTicker() {
  if (!db) return;
  const tickerEl = document.getElementById("ticker-text");
  if (!tickerEl) return;
  try {
    const snap = await db.collection("announcements").orderBy("order").get();
    if (snap.empty) return;
    const texts = snap.docs.map(d => d.data().text).filter(Boolean);
    if (texts.length > 0) {
      tickerEl.innerHTML = texts.join(" &nbsp;&nbsp;✦&nbsp;&nbsp; ") + " &nbsp;&nbsp;✦&nbsp;&nbsp; ";
    }
  } catch(e) {
    console.warn("Could not load ticker:", e);
  }
}

// ── Load announcements as cards on the home page ──
async function loadAnnouncementsSection() {
  if (!db) return;
  const section = document.getElementById("announcements-section");
  const cards   = document.getElementById("announcements-cards");
  if (!section || !cards) return;
  try {
    const snap = await db.collection("announcements").get();
    if (snap.empty) return;
    section.style.display = "block";
    const typeColor = { urgent:"#e63946", info:"#3b82f6", success:"#22c55e", warning:"#f59e0b" };
    const typeIcon  = { urgent:"🚨", info:"📢", success:"✅", warning:"⚠️" };
    cards.innerHTML = "";
    snap.docs.forEach(doc => {
      const d = doc.data();
      const color = typeColor[d.type] || "#e63946";
      const icon  = typeIcon[d.type]  || "📢";
      const title = d.title || d.text || "";
      const short = title.length > 120 ? title.substring(0, 120) + "…" : title;
      const card  = document.createElement("div");
      card.style.cssText = `background:rgba(255,255,255,0.04);border:1px solid ${color}33;border-left:4px solid ${color};border-radius:14px;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap`;
      card.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0">
          <span style="font-size:22px;flex-shrink:0">${icon}</span>
          <p style="margin:0;font-size:14px;font-weight:600;color:#fff;line-height:1.6">${short}</p>
        </div>
        <a href="register.html?ann=${doc.id}" style="flex-shrink:0;background:linear-gradient(135deg,#e63946,#c62a36);color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:800;white-space:nowrap;transition:opacity 0.2s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">📝 Register Now</a>`;
      cards.appendChild(card);
    });
  } catch(e) { console.warn("Could not load announcements section:", e); }
}

// ── Load dynamic stats for home page ──
async function loadHomeStats() {
  if (!db) return;

  try {
    const [membersSnap, eventsSnap] = await Promise.all([
      db.collection("club_members").get(),
      db.collection("events").get()
    ]);

    const memberCount = membersSnap.size;
    const eventCount  = eventsSnap.size;
    const workshopCount = eventsSnap.docs.filter(d => {
      const type  = (d.data().type  || "").toLowerCase();
      const title = (d.data().title || "").toLowerCase();
      const desc  = (d.data().desc  || "").toLowerCase();
      return type === "workshop" || title.includes("workshop") || desc.includes("workshop");
    }).length;

    const elMembers   = document.getElementById("stat-members-count");
    const elEvents    = document.getElementById("stat-events-count");
    const elWorkshops = document.getElementById("stat-workshops-count");

    if (elMembers)   animateCounter(elMembers,   memberCount   || 0);
    if (elEvents)    animateCounter(elEvents,     eventCount    || 0);
    if (elWorkshops) animateCounter(elWorkshops,  workshopCount || 0);
  } catch(e) {
    console.warn("Could not load stats:", e);
  }
}

// ── Load home page gallery images ──
async function loadHomePageImages() {
  const container = document.getElementById("dynamic-home-images");
  if (!container || !db) return;

  try {
    const snap = await db.collection("home_images").orderBy("uploadedAt", "desc").get();
    if (snap.empty) return;

    snap.forEach(doc => {
      const { url } = doc.data();
      const box = document.createElement("div");
      box.className = "box";
      box.innerHTML = `<div class="boximg" style="background-image:url('${url}')"></div>`;
      container.appendChild(box);
    });
  } catch(e) {
    console.warn("Could not load home images:", e);
  }
}

// ── Load events for gallery page ──
async function loadFirebaseEvents() {
  const condList = document.getElementById("conducted-events-list");
  const upList   = document.getElementById("upcoming-events-list");

  const noEventsMsg = '<p style="color:rgba(255,255,255,0.4);text-align:center;padding:40px 0;font-size:14px">No events posted yet.</p>';

  if (!db) {
    if (condList) condList.innerHTML = noEventsMsg;
    if (upList)   upList.innerHTML   = noEventsMsg;
    return;
  }

  try {
    const snap = await db.collection("events").orderBy("addedAt", "desc").get();

    const conducted = snap.docs.filter(d => d.data().type === "conducted").map(d => d.data());
    const upcoming  = snap.docs.filter(d => d.data().type === "upcoming").map(d => d.data());

    if (condList) {
      condList.innerHTML = conducted.length
        ? conducted.map(ev => makeEventCard(ev)).join("")
        : noEventsMsg;
    }

    if (upList) {
      upList.innerHTML = upcoming.length
        ? upcoming.map(ev => makeEventCard(ev)).join("")
        : noEventsMsg;
    }
  } catch(e) {
    console.warn("Could not load events:", e);
    if (condList) condList.innerHTML = noEventsMsg;
    if (upList)   upList.innerHTML   = noEventsMsg;
  }
}

// ── Load gallery images ──
async function loadFirebaseGalleryImages() {
  const grid = document.getElementById("dynamic-gallery-grid");
  if (!grid || !db) return;

  try {
    const snap = await db.collection("gallery_images").orderBy("uploadedAt", "desc").get();
    if (snap.empty) return;

    snap.forEach(doc => {
      const { url } = doc.data();
      const item = document.createElement("div");
      item.className = "gallery-item";
      item.innerHTML = `<img src="${url}" alt="Gallery photo" loading="lazy">`;
      grid.appendChild(item);
    });
  } catch(e) {
    console.warn("Could not load gallery images:", e);
  }
}

function makeEventCard(ev) {
  const dateObj = ev.date ? new Date(ev.date) : null;
  const month   = dateObj ? dateObj.toLocaleString("default", { month: "short" }).toUpperCase() : "";
  const day     = dateObj ? dateObj.getDate() : "";

  return `
    <div class="event-card-dynamic">
      ${ev.imageUrl ? `<div class="event-img" style="background-image:url('${ev.imageUrl}')"></div>` : ""}
      <div class="event-info-dynamic">
        ${dateObj ? `<div class="date-badge"><p>${month}</p><p>${day}</p></div>` : ""}
        <div class="event-details-dynamic">
          <h3>${ev.title}</h3>
          ${ev.venue ? `<p>📍 ${ev.venue}</p>` : ""}
          ${ev.desc  ? `<p>${ev.desc}</p>` : ""}
        </div>
      </div>
    </div>
  `;
}

// ── Submit contact form ──
async function submitContactForm(event) {
  if (event) event.preventDefault();
  if (!db) { showContactMsg("error", "Service unavailable. Please try again later."); return; }
  const name    = (document.getElementById("cf-name")    || {}).value || "";
  const email   = (document.getElementById("cf-email")   || {}).value || "";
  const phone   = (document.getElementById("cf-phone")   || {}).value || "";
  const message = (document.getElementById("cf-message") || {}).value || "";
  const btn     = document.getElementById("cf-submit");
  if (!name.trim() || !message.trim()) { showContactMsg("error", "Please fill in your name and message."); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }
  try {
    await db.collection("contacts").add({
      name: name.trim(), email: email.trim(), phone: phone.trim(), message: message.trim(),
      read: false, submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showContactMsg("success", "✅ Message sent! We'll get back to you soon.");
    ["cf-name","cf-email","cf-phone","cf-message"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  } catch(e) { showContactMsg("error", "Error sending message. Please try again."); }
  if (btn) { btn.disabled = false; btn.textContent = "Send Message"; }
}

function showContactMsg(type, msg) {
  const el = document.getElementById("cf-msg");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.color = type === "success" ? "#27ae60" : "#e63946";
  setTimeout(() => { el.style.display = "none"; }, 5000);
}

// ── Load resources for public page ──
async function loadPublicResources() {
  const container = document.getElementById("resources-container");
  if (!container || !db) return;
  try {
    const snap = await db.collection("resources").orderBy("addedAt", "desc").get();
    if (snap.empty) { container.innerHTML = '<p style="color:#aaa;text-align:center;padding:40px">No resources yet. Check back soon!</p>'; return; }
    const icons = { notes: "📄", video: "🎥", tool: "🔧", link: "🔗" };
    const byType = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (!byType[d.type]) byType[d.type] = [];
      byType[d.type].push(d);
    });
    container.innerHTML = "";
    Object.keys(byType).forEach(type => {
      const section = document.createElement("div");
      section.style.marginBottom = "32px";
      const typeNames = { notes: "Notes & PDFs", video: "Video Resources", tool: "Tools", link: "Useful Links" };
      section.innerHTML = `<h3 style="font-size:16px;font-weight:700;color:#e63946;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px">${icons[type]||"🔗"} ${typeNames[type]||type}</h3>`;
      byType[type].forEach(r => {
        section.innerHTML += `
          <a href="${r.url}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;text-decoration:none;color:inherit;margin-bottom:10px;transition:background 0.2s" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
            <span style="font-size:26px;flex-shrink:0">${icons[r.type]||"🔗"}</span>
            <div style="flex:1">
              <div style="font-weight:700;font-size:14px">${r.title}</div>
              ${r.category ? `<div style="font-size:12px;color:#aaa;margin-top:3px">📂 ${r.category}</div>` : ""}
              ${r.description ? `<div style="font-size:12px;color:#bbb;margin-top:4px">${r.description}</div>` : ""}
            </div>
            <span style="font-size:18px;flex-shrink:0">→</span>
          </a>`;
      });
      container.appendChild(section);
    });
  } catch(e) { container.innerHTML = '<p style="color:#aaa;text-align:center;padding:40px">Could not load resources.</p>'; }
}

// ── Load projects for public page ──
async function loadPublicProjects() {
  const container = document.getElementById("projects-container");
  if (!container || !db) return;
  try {
    const snap = await db.collection("projects").orderBy("addedAt", "desc").get();
    if (snap.empty) { container.innerHTML = '<p style="color:#aaa;text-align:center;padding:40px">No projects yet. Check back soon!</p>'; return; }
    container.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      container.innerHTML += `
        <div style="padding:20px 24px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:16px;margin-bottom:16px">
          <div style="display:flex;align-items:flex-start;gap:16px">
            <div style="font-size:36px;flex-shrink:0">💡</div>
            <div style="flex:1">
              <div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:6px">${d.title}</div>
              ${d.team ? `<div style="font-size:13px;color:#aaa;margin-bottom:4px">👥 Team: ${d.team}</div>` : ""}
              ${d.year ? `<div style="font-size:13px;color:#aaa;margin-bottom:8px">📅 ${d.year}</div>` : ""}
              <div style="font-size:14px;color:#ccc;line-height:1.6">${d.description || ""}</div>
              ${d.link ? `<a href="${d.link}" target="_blank" rel="noopener" style="display:inline-block;margin-top:12px;padding:8px 20px;background:rgba(230,57,70,0.15);border:1px solid rgba(230,57,70,0.3);border-radius:8px;color:#e63946;text-decoration:none;font-size:13px;font-weight:700">🔗 View Project</a>` : ""}
            </div>
          </div>
        </div>`;
    });
  } catch(e) { container.innerHTML = '<p style="color:#aaa;text-align:center;padding:40px">Could not load projects.</p>'; }
}

// ── Load upcoming events + handle registration ──
async function loadUpcomingEventsForRegistration(selectId) {
  const id = selectId || "reg-event-select";
  const select = document.getElementById(id);
  if (!select) return;

  select.innerHTML = '<option value="">— Loading announcements… —</option>';

  if (!db) {
    select.innerHTML = '<option value="">Service unavailable — try refreshing</option>';
    return;
  }

  try {
    const annSnap = await db.collection("announcements").get();
    const evSnap  = await db.collection("events").get();

    select.innerHTML = '<option value="">— Select an Event / Announcement —</option>';
    let count = 0;

    if (!evSnap.empty) {
      const grp = document.createElement("optgroup");
      grp.label = "📅 Events";
      evSnap.forEach(doc => {
        const d = doc.data();
        const title = d.title || "Untitled Event";
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.dataset.title = title;
        opt.textContent = title + (d.date ? " (" + d.date + ")" : "");
        grp.appendChild(opt);
        count++;
      });
      select.appendChild(grp);
    }

    if (!annSnap.empty) {
      const grp = document.createElement("optgroup");
      grp.label = "📢 Announcements";
      annSnap.forEach(doc => {
        const d = doc.data();
        const text = d.title || d.text || "Untitled Announcement";
        const opt = document.createElement("option");
        opt.value = "ann_" + doc.id;
        opt.dataset.title = text;
        opt.textContent = text.length > 65 ? text.substring(0, 65) + "…" : text;
        grp.appendChild(opt);
        count++;
      });
      select.appendChild(grp);
    }

    if (count === 0) {
      select.innerHTML = '<option value="">No announcements yet — check back soon</option>';
    }

    // Pre-select if URL has ?ann=DOC_ID (from "Register Now" button on home page)
    const urlParams = new URLSearchParams(window.location.search);
    const preAnn = urlParams.get("ann");
    if (preAnn) {
      const target = select.querySelector(`option[value="ann_${preAnn}"]`);
      if (target) { target.selected = true; }
    }
  } catch(e) {
    console.warn("Error loading registration options:", e);
    select.innerHTML = '<option value="">Could not load — please refresh the page</option>';
  }
}

async function submitRegistration(event) {
  if (event) event.preventDefault();
  if (!db) { showRegMsg("error", "Service unavailable. Please try again later."); return; }
  const select   = document.getElementById("reg-event-select");
  const eventId  = select ? select.value : "";
  const eventTitle = select && select.options[select.selectedIndex] ? (select.options[select.selectedIndex].dataset.title || "") : "";
  const name     = (document.getElementById("reg-name")     || {}).value || "";
  const email    = (document.getElementById("reg-email")    || {}).value || "";
  const phone    = (document.getElementById("reg-phone")    || {}).value || "";
  const yearDept = (document.getElementById("reg-yeardept") || {}).value || "";
  const btn      = document.getElementById("reg-submit");
  if (!eventId)      { showRegMsg("error", "Please select an event."); return; }
  if (!name.trim())  { showRegMsg("error", "Please enter your name."); return; }
  if (!email.trim()) { showRegMsg("error", "Please enter your email."); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Registering..."; }
  try {
    await db.collection("registrations").add({
      eventId, eventTitle, name: name.trim(), email: email.trim(),
      phone: phone.trim(), yearDept: yearDept.trim(),
      registeredAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showRegMsg("success", "✅ Registered successfully! We'll confirm via email soon.");
    ["reg-name","reg-email","reg-phone","reg-yeardept"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    if (select) select.value = "";
  } catch(e) { showRegMsg("error", "Error registering. Please try again."); }
  if (btn) { btn.disabled = false; btn.textContent = "Register Now"; }
}

function showRegMsg(type, msg) {
  const el = document.getElementById("reg-msg");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.color = type === "success" ? "#27ae60" : "#e63946";
  setTimeout(() => { el.style.display = "none"; }, 6000);
}

// ══════════════════════════════════════════
// NEW FEATURES — Public Functions
// ══════════════════════════════════════════

// ── Alumni ──────────────────────────────────────────
async function loadPublicAlumni() {
  const c = document.getElementById("alumni-container");
  if (!c || !db) return;
  try {
    const snap = await db.collection("alumni").orderBy("addedAt","desc").get();
    if (snap.empty) { c.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:#aaa"><div style="font-size:40px;margin-bottom:12px">🎓</div><p>Alumni profiles coming soon!</p></div>'; return; }
    c.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      c.innerHTML += `<div class="alumni-card">
        <div class="alumni-avatar">${d.photo ? `<img src="${d.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : "🎓"}</div>
        <div class="alumni-name">${d.name||"—"}</div>
        <div class="alumni-batch">Batch ${d.batch||"—"}</div>
        <div class="alumni-role">${d.role||""} ${d.company ? "at "+d.company : ""}</div>
        ${d.linkedin ? `<a href="${d.linkedin}" target="_blank" rel="noopener" class="alumni-link">🔗 LinkedIn</a>` : ""}
      </div>`;
    });
  } catch(e) { c.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa">Could not load alumni.</div>'; }
}

// ── Leaderboard ─────────────────────────────────────
async function loadLeaderboard() {
  const c = document.getElementById("lb-container");
  if (!c || !db) return;
  try {
    const snap = await db.collection("leaderboard").orderBy("points","desc").limit(30).get();
    if (snap.empty) { c.innerHTML = '<div style="text-align:center;padding:60px 0;color:#aaa"><div style="font-size:40px;margin-bottom:12px">🏅</div><p>Leaderboard coming soon!</p></div>'; return; }
    c.innerHTML = "";
    let rank = 0;
    snap.forEach(doc => {
      rank++;
      const d = doc.data();
      const badges = (d.badges||[]).map(b=>`<span class="badge">${b}</span>`).join("");
      const rankClass = rank<=3 ? "rank-"+rank : "";
      c.innerHTML += `<div class="lb-row">
        <div class="lb-rank ${rankClass}">${rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":rank}</div>
        <div class="lb-avatar">😊</div>
        <div style="flex:1"><div class="lb-name">${d.name||"—"}</div><div class="lb-dept">${d.dept||""}</div></div>
        ${badges ? `<div class="lb-badges">${badges}</div>` : ""}
        <div><div class="lb-points">${d.points||0}</div><div class="lb-pts-label">pts</div></div>
      </div>`;
    });
  } catch(e) { c.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa">Could not load leaderboard.</div>'; }
}

// ── Blog ────────────────────────────────────────────
async function loadPublicBlog() {
  const c = document.getElementById("blog-container");
  if (!c || !db) return;
  try {
    const snap = await db.collection("blog").orderBy("addedAt","desc").get();
    if (snap.empty) { c.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:#aaa"><div style="font-size:40px;margin-bottom:12px">✍️</div><p>No articles yet. Check back soon!</p></div>'; return; }
    c.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const url = d.url||"#";
      c.innerHTML += `<a href="${url}" target="${url!="#"?"_blank":"_self"}" rel="noopener" class="blog-card" style="text-decoration:none;color:inherit">
        <div class="blog-cover" style="${d.coverImage?"background-image:url("+d.coverImage+");background-size:cover;background-position:center":""}">
          ${!d.coverImage?"✍️":""}
        </div>
        <div class="blog-body">
          <div class="blog-cat">${d.category||"Tech"}</div>
          <div class="blog-title">${d.title||"Untitled"}</div>
          <div class="blog-excerpt">${d.excerpt||d.content?.substring(0,120)||""}</div>
          <div class="blog-meta"><span>${d.author||"Anonymous"}</span><span>${d.date||""}</span></div>
        </div>
      </a>`;
    });
  } catch(e) { c.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa">Could not load articles.</div>'; }
}

// ── Press ────────────────────────────────────────────
async function loadPublicPress() {
  const c = document.getElementById("press-container");
  if (!c || !db) return;
  try {
    const snap = await db.collection("press").orderBy("date","desc").get();
    if (snap.empty) { c.innerHTML = '<div style="text-align:center;padding:60px 0;color:#aaa"><div style="font-size:40px;margin-bottom:12px">📰</div><p>No media coverage yet.</p></div>'; return; }
    c.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      c.innerHTML += `<a href="${d.url||"#"}" target="_blank" rel="noopener" class="press-item">
        <div class="press-icon">${d.icon||"📰"}</div>
        <div style="flex:1">
          <div class="press-source">${d.source||"Media"}</div>
          <div class="press-title">${d.title||"Untitled"}</div>
          <div class="press-date">${d.date||""}</div>
        </div>
        <div class="press-arrow">→</div>
      </a>`;
    });
  } catch(e) { c.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa">Could not load press coverage.</div>'; }
}

// ── Open Source ──────────────────────────────────────
async function loadPublicOSS() {
  const c = document.getElementById("oss-container");
  if (!c || !db) return;
  try {
    const snap = await db.collection("opensource").orderBy("addedAt","desc").get();
    if (snap.empty) { c.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:#aaa"><div style="font-size:40px;margin-bottom:12px">⚙️</div><p>Open source projects coming soon!</p></div>'; return; }
    c.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      c.innerHTML += `<div class="repo-card">
        <div class="repo-header"><span class="repo-icon">📦</span><span class="repo-name">${d.title||"Untitled"}</span></div>
        <div class="repo-desc">${d.description||""}</div>
        <div class="repo-meta">
          ${d.language?`<span class="lang-badge">${d.language}</span>`:""}
          ${d.stars?`<span class="stars">⭐ ${d.stars}</span>`:""}
          ${d.link?`<a href="${d.link}" target="_blank" rel="noopener" class="repo-link">View →</a>`:""}
        </div>
      </div>`;
    });
  } catch(e) { c.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa">Could not load repositories.</div>'; }
}

// ── Placements ───────────────────────────────────────
async function loadPublicPlacements() {
  const c = document.getElementById("placements-container");
  if (!c || !db) return;
  try {
    const snap = await db.collection("placements").orderBy("year","desc").get();
    if (snap.empty) { c.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:#aaa"><div style="font-size:40px;margin-bottom:12px">💼</div><p>Placement records coming soon!</p></div>'; return; }
    c.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      c.innerHTML += `<div class="p-card">
        <div class="p-company">${d.companyEmoji||"🏢"}</div>
        <div class="p-name">${d.name||"—"}</div>
        <div class="p-role">${d.role||""}</div>
        <div class="p-company-name">${d.company||""}</div>
        <div class="p-year">${d.year||""}</div>
        ${d.package?`<span class="p-package">₹${d.package} LPA</span>`:""}
      </div>`;
    });
  } catch(e) { c.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa">Could not load placements.</div>'; }
}

// ── Meeting Minutes ──────────────────────────────────
async function loadPublicMinutes() {
  const c = document.getElementById("minutes-container");
  if (!c || !db) return;
  try {
    const snap = await db.collection("minutes").orderBy("date","desc").get();
    if (snap.empty) { c.innerHTML = '<div style="text-align:center;padding:60px 0;color:#aaa"><div style="font-size:40px;margin-bottom:12px">📋</div><p>No meeting minutes uploaded yet.</p></div>'; return; }
    c.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const typeTag = d.meetingType ? `<span class="m-tag">${d.meetingType}</span>` : "";
      c.innerHTML += `<a href="${d.fileUrl||"#"}" target="_blank" rel="noopener" class="minutes-item">
        <div class="m-icon">📋</div>
        <div style="flex:1"><div class="m-title">${d.title||"Meeting Minutes"}${typeTag}</div><div class="m-meta">${d.date||""}</div></div>
        <span class="m-dl">⬇ Download</span>
      </a>`;
    });
  } catch(e) { c.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa">Could not load meeting minutes.</div>'; }
}

// ── Sponsors ─────────────────────────────────────────
async function loadPublicSponsors() {
  const c = document.getElementById("sponsors-container");
  if (!c || !db) return;
  try {
    const snap = await db.collection("sponsors").orderBy("tier").get();
    if (snap.empty) { c.innerHTML = '<div style="text-align:center;padding:40px 0;color:#aaa"><div style="font-size:40px;margin-bottom:12px">🤝</div><p>Sponsor information coming soon!</p></div>'; return; }
    const byTier = {};
    snap.forEach(doc => { const d=doc.data(); if(!byTier[d.tier]) byTier[d.tier]=[]; byTier[d.tier].push(d); });
    c.innerHTML = "";
    const tiers = { gold:"🥇 Gold Sponsors", silver:"🥈 Silver Sponsors", bronze:"🥉 Bronze Sponsors", supporter:"💙 Supporters" };
    Object.keys(tiers).forEach(t => {
      if (!byTier[t] || !byTier[t].length) return;
      c.innerHTML += `<div class="tier-label">${tiers[t]}</div><div class="sponsor-grid">`;
      byTier[t].forEach(s => {
        c.innerHTML += `<a href="${s.website||"#"}" target="_blank" rel="noopener" class="sp-card">
          <div class="sp-logo">${s.logo||"🏢"}</div>
          <div class="sp-name">${s.name||"—"}</div>
          <span class="sp-tier ${t}">${t.toUpperCase()}</span>
        </a>`;
      });
      c.innerHTML += `</div>`;
    });
  } catch(e) { c.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa">Could not load sponsors.</div>'; }
}

// ── Newsletter Subscription ───────────────────────────────
async function subscribeNewsletter(event) {
  if (event) event.preventDefault();
  if (!db) return;
  const email = (document.getElementById("nl-email") || {}).value || "";
  const msg = document.getElementById("nl-msg");
  if (!email.trim()) return;
  try {
    const existing = await db.collection("newsletter").where("email","==",email.trim().toLowerCase()).get();
    if (!existing.empty) {
      if (msg) { msg.style.display="block"; msg.style.color="#FFD700"; msg.style.background="rgba(255,215,0,0.05)"; msg.textContent="⚡ You're already subscribed!"; }
      return;
    }
    await db.collection("newsletter").add({ email: email.trim().toLowerCase(), subscribedAt: firebase.firestore.FieldValue.serverTimestamp() });
    if (msg) { msg.style.display="block"; msg.style.color="#27ae60"; msg.style.background="rgba(39,174,96,0.08)"; msg.textContent="✅ Subscribed! You'll receive club updates."; }
    const el = document.getElementById("nl-email"); if (el) el.value = "";
  } catch(e) { if (msg) { msg.style.display="block"; msg.style.color="#e63946"; msg.textContent="Error. Please try again."; } }
}
