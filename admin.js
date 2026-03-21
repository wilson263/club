// ──────────────────────────────────────────────────
// Neural Nexus Admin Panel — admin.js
// ──────────────────────────────────────────────────

const PERMANENT_ADMIN_EMAIL = "battawilson7@gmail.com";
const PERMANENT_ADMIN_PASSWORD = "John@1982";
const MAX_TEMP_ADMINS = 3;

// ─── FIREBASE CONFIG ─────────────────────────────
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

let auth, db, storage;
let currentUser = null;
let isPermanentAdmin = false;
let allEvents = [];

if (isConfigured) {
  firebase.initializeApp(firebaseConfig);
  auth    = firebase.auth();
  db      = firebase.firestore();
  storage = firebase.storage();

  // Persist session across page navigation
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      const cachedRole = localStorage.getItem("nn_role_" + user.uid);
      if (cachedRole !== null) {
        isPermanentAdmin = cachedRole === "true";
        updateSidebarForRole(user);
        showDashboard();
        logActivity("login", "Admin signed in");
        loadCurrentUser(user);
      } else if (user.email === PERMANENT_ADMIN_EMAIL) {
        isPermanentAdmin = true;
        localStorage.setItem("nn_role_" + user.uid, "true");
        updateSidebarForRole(user);
        showDashboard();
        loadCurrentUser(user);
      } else {
        await loadCurrentUser(user);
        showDashboard();
      }
    } else {
      currentUser = null;
      showLogin();
    }
  });
} else {
  showLogin();
  document.getElementById("config-banner").style.display = "flex";
}

// ─── AUTH ─────────────────────────────────────────
async function doLogin() {
  if (!isConfigured) {
    showLoginError("Firebase is not configured yet.");
    return;
  }
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const btn      = document.getElementById("login-btn");

  if (!email || !password) { showLoginError("Please enter your email and password."); return; }

  btn.innerHTML = '<span class="spin">⟳</span> Signing in...';
  btn.disabled = true;
  hideLoginError();

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    if ((err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") &&
        email === PERMANENT_ADMIN_EMAIL && password === PERMANENT_ADMIN_PASSWORD) {
      try {
        btn.innerHTML = '<span class="spin">⟳</span> Setting up account...';
        await auth.createUserWithEmailAndPassword(email, password);
        return;
      } catch (createErr) {
        showLoginError("Could not create admin account: " + createErr.message);
        btn.innerHTML = '🔐 Sign In'; btn.disabled = false; return;
      }
    }
    let msg = "Invalid email or password.";
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") msg = "No admin account found with this email.";
    if (err.code === "auth/wrong-password")   msg = "Incorrect password.";
    if (err.code === "auth/too-many-requests") msg = "Too many attempts. Try again later.";
    showLoginError(msg);
    btn.innerHTML = '🔐 Sign In'; btn.disabled = false;
  }
}

async function doLogout() {
  // Clear cached role on logout
  if (currentUser) localStorage.removeItem("nn_role_" + currentUser.uid);
  await auth.signOut();
  showToast("Logged out successfully", "info");
}

function showLoginError(msg) {
  const el = document.getElementById("login-error");
  el.style.display = "flex";
  document.getElementById("login-error-msg").textContent = msg;
}
function hideLoginError() { document.getElementById("login-error").style.display = "none"; }

// ─── SCREEN SWITCHING ─────────────────────────────
function showLogin() {
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("dashboard").style.display = "none";
  const btn = document.getElementById("login-btn");
  if (btn) { btn.innerHTML = '🔐 Sign In'; btn.disabled = false; }
}
function showDashboard() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
  loadDashboardData();
}

// ─── SIDEBAR FOR ROLE ──────────────────────────────
function updateSidebarForRole(user) {
  const initial = (user.email || "A")[0].toUpperCase();
  document.getElementById("sidebar-avatar").textContent = initial;
  document.getElementById("sidebar-name").textContent   = user.email || "Admin";
  document.getElementById("sidebar-role").textContent   = isPermanentAdmin ? "Permanent Admin" : "Temp Admin";
  if (isPermanentAdmin) {
    document.getElementById("admin-mgmt-label").style.display  = "block";
    document.getElementById("admin-mgmt-btn").style.display    = "flex";
    document.getElementById("guide-admin").style.display       = "flex";
    document.getElementById("quick-add-admin-btn").style.display = "flex";
    const clrBtn = document.getElementById("clear-log-btn"); if (clrBtn) clrBtn.style.display = "inline-flex";
  } else {
    document.getElementById("admin-mgmt-label").style.display  = "none";
    document.getElementById("admin-mgmt-btn").style.display    = "none";
    document.getElementById("quick-add-admin-btn").style.display = "none";
  }
}

// ─── ADD TEMP ADMIN MODAL ──────────────────────────
function openAddAdminModal() {
  document.getElementById("modal-admin-email").value    = "";
  document.getElementById("modal-admin-password").value = "";
  document.getElementById("modal-admin-error").style.display = "none";
  document.getElementById("add-admin-modal").classList.add("open");
  document.getElementById("modal-admin-email").focus();
}

function closeAddAdminModal() {
  document.getElementById("add-admin-modal").classList.remove("open");
}

async function submitAddAdminModal() {
  const email    = document.getElementById("modal-admin-email").value.trim();
  const password = document.getElementById("modal-admin-password").value;
  const errBox   = document.getElementById("modal-admin-error");
  const btn      = document.getElementById("modal-add-admin-btn");

  errBox.style.display = "none";

  if (!email || !password) { errBox.textContent = "Please enter both email and password."; errBox.style.display = "block"; return; }
  if (password.length < 6) { errBox.textContent = "Password must be at least 6 characters."; errBox.style.display = "block"; return; }

  btn.disabled = true;
  btn.textContent = "Adding...";

  try {
    const snap = await db.collection("admins").get();
    const tempCount = snap.docs.filter(d => !d.data().isPermanent).length;
    if (tempCount >= MAX_TEMP_ADMINS) {
      errBox.textContent = "Maximum of 3 temporary admins already reached. Remove one first.";
      errBox.style.display = "block";
      btn.disabled = false; btn.textContent = "➕ Add Admin";
      return;
    }

    const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
    const res = await fetch(signUpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false })
    });
    const data = await res.json();
    if (!res.ok) {
      const code = data.error && data.error.message;
      errBox.textContent = code === "EMAIL_EXISTS" ? "This email is already registered." : "Error: " + (data.error ? data.error.message : "Unknown error");
      errBox.style.display = "block";
      btn.disabled = false; btn.textContent = "➕ Add Admin";
      return;
    }

    await db.collection("admins").doc(data.localId).set({
      email, name: email.split("@")[0], isPermanent: false,
      addedBy: currentUser.email,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    closeAddAdminModal();
    showToast(`Temporary admin added: ${email}`, "success");
  } catch(e) {
    errBox.textContent = "Error: " + e.message;
    errBox.style.display = "block";
  }

  btn.disabled = false;
  btn.textContent = "➕ Add Admin";
}

// ─── LOAD USER ─────────────────────────────────────
async function loadCurrentUser(user) {
  try {
    const doc = await db.collection("admins").doc(user.uid).get();
    if (doc.exists) {
      isPermanentAdmin = doc.data().isPermanent === true;
    } else if (user.email === PERMANENT_ADMIN_EMAIL) {
      isPermanentAdmin = true;
      // Create the admin document without blocking the UI
      db.collection("admins").doc(user.uid).set({
        email: user.email, name: "Super Admin", isPermanent: true,
        addedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(e => console.error("Error creating admin doc:", e));
    }
    // Cache role so next login is instant
    localStorage.setItem("nn_role_" + user.uid, isPermanentAdmin ? "true" : "false");
    updateSidebarForRole(user);
  } catch(e) { console.error("Error loading user:", e); }
}

// ─── PANEL SWITCHING ──────────────────────────────
const panelTitles = {
  overview: "Dashboard",
  "home-images": "Home Page Images",
  events: "Events",
  gallery: "Photo Gallery",
  achievements: "Achievements",
  "club-members": "Club Members",
  faculty: "Faculty Members",
  admins: "Admin Accounts",
  announcements: "Announcements Manager",
  resources: "Resources Library",
  projects: "Project Showcase",
  contacts: "Enquiry Inbox",
  registrations: "Event Registrations",
  alumni: "Alumni Network",
  leaderboard: "Leaderboard",
  placements: "Placement Highlights",
  blog: "Tech Blog",
  newsletter: "Newsletter Subscribers",
  "live-quiz": "Live Quiz — Host Control",
  "feedback-inbox": "Event Feedback Inbox",
  "attendance-mgr": "Attendance Sessions",
  certificates: "Certificates",
  press: "Press & Media",
  opensource: "Open Source Contributions",
  minutes: "Meeting Minutes",
  sponsors: "Sponsors"
};

function showPanel(name) {
  document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open"));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("panel-" + name).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n => {
    if (n.getAttribute("data-panel") === name) n.classList.add("active");
  });
  document.getElementById("topbar-title").textContent = panelTitles[name] || "Dashboard";
  closeSidebar();

  if (name === "home-images")   loadHomeImages();
  if (name === "events")        loadEvents();
  if (name === "gallery")       loadGalleryImages();
  if (name === "achievements")  loadAchievements();
  if (name === "club-members")  loadMembers();
  if (name === "faculty")       loadFaculty();
  if (name === "admins")        loadAdmins();
  if (name === "overview")      loadStats();
  if (name === "announcements")   loadAnnouncements();
  if (name === "resources")       loadResources();
  if (name === "projects")        loadProjects();
  if (name === "contacts")        loadContacts();
  if (name === "registrations")   { loadRegistrationEvents(); loadRegistrations(); }
  if (name === "alumni")          loadAdminAlumni();
  if (name === "leaderboard")     loadAdminLeaderboard();
  if (name === "placements")      loadAdminPlacements();
  if (name === "blog")            loadAdminBlog();
  if (name === "newsletter")      loadAdminNewsletter();
  if (name === "live-quiz")       initQuizPanel();
  if (name === "feedback-inbox")  loadAdminFeedback();
  if (name === "attendance-mgr")  loadAdminAttendance();
  if (name === "certificates")    loadAdminCertificates();
  if (name === "press")           loadAdminPress();
  if (name === "opensource")      loadAdminOSS();
  if (name === "minutes")         loadAdminMinutes();
  if (name === "sponsors")        loadAdminSponsors();
}

// ─── STATS ────────────────────────────────────────
async function loadStats() {
  const results = await Promise.allSettled([
    db.collection("home_images").get(),
    db.collection("events").get(),
    db.collection("gallery_images").get(),
    db.collection("achievements").get(),
    db.collection("admins").get(),
    db.collection("club_members").get(),
    db.collection("faculty_members").get(),
    db.collection("contacts").get(),
    db.collection("registrations").get(),
    db.collection("resources").get(),
    db.collection("projects").get()
  ]);
  const val = (r) => r.status === "fulfilled" ? r.value.size : "—";
  document.getElementById("stat-home-images").textContent   = val(results[0]);
  document.getElementById("stat-events").textContent        = val(results[1]);
  document.getElementById("stat-gallery").textContent       = val(results[2]);
  document.getElementById("stat-achievements").textContent  = val(results[3]);
  document.getElementById("stat-admins").textContent        = val(results[4]);
  document.getElementById("stat-members").textContent       = val(results[5]);
  document.getElementById("stat-faculty-count").textContent = val(results[6]);
  document.getElementById("stat-contacts").textContent      = val(results[7]);
  document.getElementById("stat-registrations").textContent = val(results[8]);
  document.getElementById("stat-resources").textContent     = val(results[9]);
  document.getElementById("stat-projects").textContent      = val(results[10]);
}
function loadDashboardData() { loadStats(); }

// ─── STORAGE UPLOAD HELPER ────────────────────────────────────────────────────
// Tries default bucket first, then legacy appspot.com bucket as fallback.
function _sdkUpload(storageInstance, file, storagePath, onProgress) {
  return new Promise((resolve, reject) => {
    const task  = storageInstance.ref(storagePath).put(file);
    const timer = setTimeout(() => { task.cancel(); reject(new Error("Upload timed out after 90s")); }, 90000);
    task.on("state_changed",
      snap => { if (onProgress) onProgress(snap.bytesTransferred / snap.totalBytes * 0.95); },
      err  => { clearTimeout(timer); reject(err); },
      ()   => {
        clearTimeout(timer);
        task.snapshot.ref.getDownloadURL()
          .then(u => { if (onProgress) onProgress(1); resolve(u); })
          .catch(reject);
      }
    );
  });
}

async function uploadFileToStorage(file, storagePath, onProgress) {
  // Attempt 1 — default bucket (firebasestorage.app)
  try {
    return await _sdkUpload(storage, file, storagePath, onProgress);
  } catch (e1) {
    const code1 = e1.code || "";
    console.warn("Attempt 1 failed:", code1, e1.message);

    // If it's a clear auth/rules error, don't bother trying other buckets
    if (code1 === "storage/unauthorized" || code1 === "storage/unauthenticated") {
      throw new Error("Permission denied — check Firebase Storage security rules (storage/unauthorized)");
    }

    // Attempt 2 — legacy appspot.com bucket (Firebase compat SDK prefers this format)
    const legacyBucket = firebaseConfig.projectId + ".appspot.com";
    console.warn(`Trying legacy bucket: gs://${legacyBucket}`);
    try {
      const altStorage = firebase.app().storage(`gs://${legacyBucket}`);
      return await _sdkUpload(altStorage, file, storagePath, onProgress);
    } catch (e2) {
      const code2 = e2.code || "";
      console.warn("Attempt 2 failed:", code2, e2.message);

      // Build a helpful error message based on the most informative code
      const code = code2 || code1;
      if (code === "storage/bucket-not-found" || code === "storage/unknown") {
        throw new Error(
          "Firebase Storage is not reachable. Please make sure Storage is enabled in your Firebase Console " +
          "(Firebase Console → Storage → Get Started) and that your security rules allow writes. [" + code + "]"
        );
      }
      throw new Error(`Upload failed [${code}]: ${e2.message}`);
    }
  }
}

// ─── HOME IMAGES ──────────────────────────────────
async function uploadHomeImages(files) {
  if (!files.length) return;
  const wrapper = document.getElementById("home-progress-wrapper");
  const fill    = document.getElementById("home-progress-fill");
  wrapper.style.display = "block";
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `home_images/${Date.now()}_${file.name}`;
      const url = await uploadFileToStorage(file, path, pct => {
        fill.style.width = ((i / files.length + pct / files.length) * 100) + "%";
      });
      await db.collection("home_images").add({ url, uploadedBy: currentUser.email, uploadedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    fill.style.width = "100%";
    showToast(`${files.length} image(s) uploaded!`, "success");
    loadHomeImages();
  } catch(e) {
    console.error("Home image upload error:", e);
    showToast("Upload failed: " + (e.message || "Unknown error"), "error");
  } finally {
    wrapper.style.display = "none"; fill.style.width = "0%";
    document.getElementById("home-file-input").value = "";
  }
}

async function loadHomeImages() {
  const grid  = document.getElementById("home-image-grid");
  const empty = document.getElementById("home-empty");
  const count = document.getElementById("home-image-count");
  grid.innerHTML = "";
  try {
    const snap = await db.collection("home_images").orderBy("uploadedAt", "desc").get();
    count.textContent = `${snap.size} image(s)`;
    if (snap.empty) { grid.appendChild(empty); return; }
    snap.forEach(doc => { grid.appendChild(makeImageItem(doc.data().url, () => deleteHomeImage(doc.id, doc.data().url))); });
  } catch(e) { console.error(e); }
}

async function deleteHomeImage(docId, url) {
  if (!confirm("Delete this image?")) return;
  try {
    await db.collection("home_images").doc(docId).delete();
    await storage.refFromURL(url).delete().catch(() => {});
    showToast("Image deleted", "info"); loadHomeImages();
  } catch(e) { showToast("Error deleting image", "error"); }
}

// ─── EVENTS ───────────────────────────────────────
function previewEventImage(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("evt-preview-area").innerHTML = `
      <img src="${e.target.result}" style="max-width:100%;max-height:150px;border-radius:8px;object-fit:contain">
      <p style="font-size:12px;color:#aaa;margin-top:8px">${file.name}</p>
    `;
  };
  reader.readAsDataURL(file);
}

async function addEvent() {
  if (!checkAuth()) return;
  const title = document.getElementById("evt-title").value.trim();
  const type  = document.getElementById("evt-type").value;
  const date  = document.getElementById("evt-date").value;
  const venue = document.getElementById("evt-venue").value.trim();
  const desc  = document.getElementById("evt-desc").value.trim();
  const file  = document.getElementById("evt-image-input").files[0];

  if (!title) { showToast("Please enter an event title", "error"); return; }

  const wrapper = document.getElementById("evt-progress-wrapper");
  const fill    = document.getElementById("evt-progress-fill");
  wrapper.style.display = "block";
  try {
    let imageUrl = "";
    if (file) {
      imageUrl = await uploadFileToStorage(file, `event_images/${Date.now()}_${file.name}`, pct => {
        fill.style.width = (pct * 100) + "%";
      });
    }
    await db.collection("events").add({ title, type, date, venue, desc, imageUrl, addedBy: currentUser.email, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast("Event added!", "success");
    await logActivity("event", `Added new event: "${title}"`);
    ["evt-title","evt-date","evt-venue","evt-desc"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("evt-image-input").value = "";
    document.getElementById("evt-preview-area").innerHTML = `<div style="font-size:28px">🖼️</div><div style="font-size:14px">Click to select image</div>`;
    loadEvents();
    // Notify subscribers about new event
    const details = [title, date ? "Date: " + date : "", venue ? "Venue: " + venue : "", desc].filter(Boolean).join(" | ");
    broadcastToSubscribers("event", title, details);
  } catch(e) { handleFirebaseError(e, "addEvent"); }
  wrapper.style.display = "none"; fill.style.width = "0%";
}

let currentEventFilter = "all";

async function loadEvents() {
  const list = document.getElementById("events-list");
  list.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa">Loading...</div>';
  try {
    const snap = await db.collection("events").orderBy("addedAt", "desc").get();
    allEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEventList(currentEventFilter);
  } catch(e) { list.innerHTML = `<div class="empty-state">⚠️<p>Error loading events</p></div>`; }
}

function filterEvents(type, btn) {
  currentEventFilter = type;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderEventList(type);
}

function renderEventList(type) {
  const list = document.getElementById("events-list");
  const filtered = type === "all" ? allEvents : allEvents.filter(e => e.type === type);
  if (!filtered.length) { list.innerHTML = '<div class="empty-state">📅<p>No events yet</p></div>'; return; }
  list.innerHTML = filtered.map(ev => `
    <div style="display:flex;align-items:center;gap:16px;padding:14px 18px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;margin-bottom:10px">
      ${ev.imageUrl
        ? `<img src="${ev.imageUrl}" style="width:64px;height:64px;border-radius:10px;object-fit:cover;flex-shrink:0">`
        : `<div style="width:64px;height:64px;border-radius:10px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">📅</div>`}
      <div style="flex:1;overflow:hidden">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">${ev.title}</div>
        <div style="font-size:12px;color:#aaa">${ev.date ? "📅 " + ev.date : ""} ${ev.venue ? "📍 " + ev.venue : ""}</div>
        ${ev.desc ? `<div style="font-size:12px;color:#bbb;margin-top:4px">${ev.desc}</div>` : ""}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
        <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:100px;background:${ev.type==='conducted'?'rgba(39,174,96,0.2)':ev.type==='workshop'?'rgba(155,89,182,0.2)':'rgba(41,128,185,0.2)'};color:${ev.type==='conducted'?'#27ae60':ev.type==='workshop'?'#bb8fce':'#5dade2'}">${ev.type==='conducted'?'Conducted':ev.type==='workshop'?'Workshop':'Upcoming'}</span>
        <button class="btn btn-danger" style="padding:6px 12px;font-size:12px" onclick="deleteEvent('${ev.id}', '${ev.imageUrl}')">🗑 Delete</button>
      </div>
    </div>
  `).join("");
}

async function deleteEvent(docId, imageUrl) {
  if (!confirm("Delete this event?")) return;
  try {
    await db.collection("events").doc(docId).delete();
    if (imageUrl) await storage.refFromURL(imageUrl).delete().catch(() => {});
    showToast("Event deleted", "info"); await logActivity("event", "Deleted an event"); loadEvents();
  } catch(e) { showToast("Error deleting event", "error"); }
}

// ─── GALLERY IMAGES ───────────────────────────────
async function uploadGalleryImages(files) {
  if (!files.length) return;
  const wrapper = document.getElementById("gallery-progress-wrapper");
  const fill    = document.getElementById("gallery-progress-fill");
  wrapper.style.display = "block";
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `gallery_images/${Date.now()}_${file.name}`;
      const url = await uploadFileToStorage(file, path, pct => {
        fill.style.width = ((i / files.length + pct / files.length) * 100) + "%";
      });
      await db.collection("gallery_images").add({ url, uploadedBy: currentUser.email, uploadedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    fill.style.width = "100%";
    showToast(`${files.length} photo(s) uploaded!`, "success");
    loadGalleryImages();
  } catch(e) {
    console.error("Gallery image upload error:", e);
    showToast("Upload failed: " + (e.message || "Unknown error"), "error");
  } finally {
    wrapper.style.display = "none"; fill.style.width = "0%";
    document.getElementById("gallery-file-input").value = "";
  }
}

async function loadGalleryImages() {
  const grid  = document.getElementById("gallery-image-grid");
  const empty = document.getElementById("gallery-empty");
  const count = document.getElementById("gallery-image-count");
  grid.innerHTML = "";
  try {
    const snap = await db.collection("gallery_images").orderBy("uploadedAt", "desc").get();
    count.textContent = `${snap.size} photo(s)`;
    if (snap.empty) { grid.appendChild(empty); return; }
    snap.forEach(doc => { grid.appendChild(makeImageItem(doc.data().url, () => deleteGalleryImage(doc.id, doc.data().url))); });
  } catch(e) { console.error(e); }
}

async function deleteGalleryImage(docId, url) {
  if (!confirm("Delete this photo?")) return;
  try {
    await db.collection("gallery_images").doc(docId).delete();
    await storage.refFromURL(url).delete().catch(() => {});
    showToast("Photo deleted", "info"); loadGalleryImages();
  } catch(e) { showToast("Error deleting photo", "error"); }
}

// ─── ADMIN MANAGEMENT ─────────────────────────────
async function loadAdmins() {
  // If role not yet resolved and user looks like perm admin, wait briefly
  if (!isPermanentAdmin && currentUser && currentUser.email === PERMANENT_ADMIN_EMAIL) {
    await new Promise(r => setTimeout(r, 800));
  }
  if (!isPermanentAdmin) {
    document.getElementById("admin-list").innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted)">⛔ Only the permanent admin can view this section.</div>';
    return;
  }
  const list     = document.getElementById("admin-list");
  const limitMsg = document.getElementById("admin-limit-msg");
  list.innerHTML = "";
  try {
    const snap   = await db.collection("admins").get();
    const admins = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const tempCount = admins.filter(a => !a.isPermanent).length;
    limitMsg.style.display = tempCount >= MAX_TEMP_ADMINS ? "block" : "none";
    if (!admins.length) { list.innerHTML = '<div class="empty-state">👤<p>No admins found</p></div>'; return; }
    admins.sort((a, b) => (b.isPermanent ? 1 : 0) - (a.isPermanent ? 1 : 0));
    admins.forEach(admin => {
      const initial = (admin.email || "A")[0].toUpperCase();
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `
        <div class="avatar ${admin.isPermanent ? 'permanent' : 'temp'}">${initial}</div>
        <div class="info">
          <div class="name">${admin.name || admin.email}</div>
          <div class="email">${admin.email}</div>
        </div>
        <span class="badge ${admin.isPermanent ? 'perm' : 'temp'}">${admin.isPermanent ? '★ Permanent' : 'Temporary'}</span>
        ${!admin.isPermanent ? `<button class="btn btn-danger" style="padding:7px 12px;font-size:12px" onclick="removeTempAdmin('${admin.id}', '${admin.email}')">✕ Remove</button>` : ""}
      `;
      list.appendChild(row);
    });
  } catch(e) { list.innerHTML = '<div class="empty-state">⚠️<p>Error loading admins</p></div>'; }
}

async function addTempAdmin() {
  if (!isPermanentAdmin) { showToast("Only the permanent admin can add admins", "error"); return; }
  const email    = document.getElementById("new-admin-email").value.trim();
  const password = document.getElementById("new-admin-password").value;
  if (!email || !password) { showToast("Please enter email and password", "error"); return; }
  if (password.length < 6)  { showToast("Password must be at least 6 characters", "error"); return; }
  try {
    const snap = await db.collection("admins").get();
    const tempCount = snap.docs.filter(d => !d.data().isPermanent).length;
    if (tempCount >= MAX_TEMP_ADMINS) { showToast("Max 3 temporary admins allowed", "error"); return; }

    // Use Firebase REST API to create the new user without affecting the current session
    const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
    const res = await fetch(signUpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false })
    });
    const data = await res.json();
    if (!res.ok) {
      const code = data.error && data.error.message;
      if (code === "EMAIL_EXISTS") { showToast("Email already registered.", "error"); return; }
      showToast("Error: " + (data.error ? data.error.message : "Unknown error"), "error");
      return;
    }
    const newUid = data.localId;

    await db.collection("admins").doc(newUid).set({
      email, name: email.split("@")[0], isPermanent: false,
      addedBy: currentUser.email,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(`Admin added: ${email}`, "success");
    document.getElementById("new-admin-email").value    = "";
    document.getElementById("new-admin-password").value = "";
    loadAdmins();
  } catch(e) {
    showToast("Error: " + e.message, "error");
  }
}

async function removeTempAdmin(docId, email) {
  if (!isPermanentAdmin) { showToast("Only the permanent admin can remove admins", "error"); return; }
  if (!confirm(`Remove admin: ${email}?`)) return;
  try {
    await db.collection("admins").doc(docId).delete();
    showToast(`Admin removed: ${email}`, "info"); loadAdmins();
  } catch(e) { showToast("Error removing admin", "error"); }
}

// ─── ACHIEVEMENTS ─────────────────────────────────
async function loadAchievements() {
  const grid = document.getElementById("ach-grid");
  grid.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted);grid-column:1/-1">⏳ Loading...</div>';
  try {
    const snap = await db.collection("achievements").orderBy("addedAt", "desc").get();
    if (snap.empty) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">🏆</div><p>No achievements yet.</p></div>';
      return;
    }
    grid.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const card = document.createElement("div");
      card.className = "ach-card";
      card.innerHTML = `
        <div class="ach-card-top">
          <span class="ach-emoji">${d.emoji || "🏆"}</span>
          <span class="ach-cat">${d.category || ""}</span>
        </div>
        <div class="ach-title">${d.title || "Untitled"}</div>
        <div class="ach-desc">${d.description || ""}</div>
        <div class="ach-footer">
          <span class="ach-date">📅 ${d.year || ""}</span>
          <div class="ach-actions">
            <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" onclick='openAchievementModal(${JSON.stringify({id:doc.id,...d})})'>✏️</button>
            <button class="btn btn-danger" style="padding:6px 12px;font-size:12px" onclick="deleteAchievement('${doc.id}')">🗑️</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch(e) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">⚠️</div><p>Error loading achievements</p></div>'; }
}

function openAchievementModal(existing) {
  document.getElementById("ach-modal").classList.add("open");
  if (existing && typeof existing === "object") {
    document.getElementById("ach-modal-title").textContent = "Edit Achievement";
    document.getElementById("ach-edit-id").value = existing.id || "";
    document.getElementById("ach-emoji").value   = existing.emoji || "";
    document.getElementById("ach-cat").value     = existing.category || "";
    document.getElementById("ach-year").value    = existing.year || "";
    document.getElementById("ach-title").value   = existing.title || "";
    document.getElementById("ach-desc").value    = existing.description || "";
    document.getElementById("ach-badge").value   = existing.badge || "";
  } else {
    document.getElementById("ach-modal-title").textContent = "Add Achievement";
    document.getElementById("ach-edit-id").value = "";
    document.getElementById("ach-emoji").value   = "";
    document.getElementById("ach-cat").value     = "";
    document.getElementById("ach-year").value    = new Date().getFullYear();
    document.getElementById("ach-title").value   = "";
    document.getElementById("ach-desc").value    = "";
    document.getElementById("ach-badge").value   = "";
  }
}
function closeAchievementModal() { document.getElementById("ach-modal").classList.remove("open"); }

async function saveAchievement() {
  if (!checkAuth()) return;
  const id    = document.getElementById("ach-edit-id").value;
  const emoji = document.getElementById("ach-emoji").value.trim() || "🏆";
  const cat   = document.getElementById("ach-cat").value.trim();
  const year  = document.getElementById("ach-year").value.trim();
  const title = document.getElementById("ach-title").value.trim();
  const desc  = document.getElementById("ach-desc").value.trim();
  const badge = document.getElementById("ach-badge").value.trim();
  if (!title) { showToast("Please enter a title", "error"); return; }
  const data = { emoji, category: cat, year, title, description: desc, badge, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  try {
    if (id) { await db.collection("achievements").doc(id).update(data); showToast("Achievement updated!", "success"); await logActivity("achievement", `Updated achievement: "${title}"`); }
    else { data.addedBy = currentUser.email; data.addedAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection("achievements").add(data); showToast("Achievement added!", "success"); await logActivity("achievement", `Added achievement: "${title}"`); }
    closeAchievementModal(); loadAchievements(); loadStats();
  } catch(e) { handleFirebaseError(e, "saveAchievement"); }
}

async function deleteAchievement(docId) {
  if (!confirm("Delete this achievement?")) return;
  try {
    await db.collection("achievements").doc(docId).delete();
    showToast("Achievement deleted", "info"); await logActivity("achievement", "Deleted an achievement"); loadAchievements(); loadStats();
  } catch(e) { showToast("Error deleting achievement", "error"); }
}

// ─── CLUB MEMBERS ─────────────────────────────────
async function loadMembers() {
  const grid = document.getElementById("member-admin-grid");
  grid.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted);grid-column:1/-1">⏳ Loading...</div>';
  try {
    const snap = await db.collection("club_members").get();
    if (snap.empty) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">🧑‍🤝‍🧑</div><p>No members yet. Click "Add Member" to add one.</p></div>';
      return;
    }
    grid.innerHTML = "";
    const memberDocs = snap.docs.slice().sort((a, b) => ((a.data().order||99) - (b.data().order||99)));
    memberDocs.forEach(doc => {
      const d = doc.data();
      const card = document.createElement("div");
      card.className = "admin-member-card";
      const roleBadgeColor = getRoleBadgeColor(d.role);
      card.innerHTML = `
        <div class="amc-photo">
          ${d.photoUrl
            ? `<img src="${d.photoUrl}" alt="${d.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
            : `<span style="font-size:30px">👤</span>`}
        </div>
        <div class="amc-info">
          <div class="amc-name">${d.name || "—"}</div>
          <div class="amc-year">${d.year || ""}</div>
          <span class="amc-role" style="background:${roleBadgeColor.bg};color:${roleBadgeColor.text};border:1px solid ${roleBadgeColor.border}">${d.role || ""}</span>
          ${d.phone ? `<div class="amc-phone">📞 ${d.phone}</div>` : ""}
        </div>
        <div class="amc-actions">
          <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" onclick='openMemberModal(${JSON.stringify({id:doc.id,...d})})'>✏️ Edit</button>
          <button class="btn btn-danger" style="padding:6px 12px;font-size:12px" onclick="deleteMember('${doc.id}','${(d.photoUrl||"").replace(/'/g,"\\'")}')">🗑️</button>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch(e) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">⚠️</div><p>Error loading members</p></div>'; console.error(e); }
}

function openMemberModal(existing) {
  const modal = document.getElementById("member-modal");
  modal.classList.add("open");
  document.getElementById("member-progress-wrapper").style.display = "none";

  if (existing && typeof existing === "object") {
    document.getElementById("member-modal-title").textContent = "Edit Member";
    document.getElementById("member-edit-id").value     = existing.id || "";
    document.getElementById("member-existing-photo").value = existing.photoUrl || "";
    document.getElementById("member-name").value         = existing.name || "";
    document.getElementById("member-year").value         = existing.year || "";
    document.getElementById("member-role").value         = existing.role || "Volunteer";
    document.getElementById("member-phone").value        = existing.phone || "";
    document.getElementById("member-order").value        = existing.order !== undefined ? existing.order : 99;
    const preview = document.getElementById("member-photo-preview");
    if (existing.photoUrl) {
      preview.innerHTML = `<img src="${existing.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      preview.innerHTML = "👤";
    }
  } else {
    document.getElementById("member-modal-title").textContent = "Add Club Member";
    document.getElementById("member-edit-id").value     = "";
    document.getElementById("member-existing-photo").value = "";
    document.getElementById("member-name").value         = "";
    document.getElementById("member-year").value         = "";
    document.getElementById("member-role").value         = "Volunteer";
    document.getElementById("member-phone").value        = "";
    document.getElementById("member-order").value        = 99;
    document.getElementById("member-photo-preview").innerHTML = "👤";
  }
  document.getElementById("member-photo-input").value = "";
}
function closeMemberModal() { document.getElementById("member-modal").classList.remove("open"); }

function previewMemberPhoto(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("member-photo-preview").innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  reader.readAsDataURL(file);
}

async function saveMember() {
  if (!checkAuth()) return;
  const id    = document.getElementById("member-edit-id").value;
  const name  = document.getElementById("member-name").value.trim();
  const year  = document.getElementById("member-year").value.trim();
  const role  = document.getElementById("member-role").value;
  const phone = document.getElementById("member-phone").value.trim();
  const order = parseInt(document.getElementById("member-order").value) || 99;
  const file  = document.getElementById("member-photo-input").files[0];
  const existingPhoto = document.getElementById("member-existing-photo").value;

  if (!name) { showToast("Please enter a member name", "error"); return; }

  const wrapper = document.getElementById("member-progress-wrapper");
  const fill    = document.getElementById("member-progress-fill");
  wrapper.style.display = "block";

  try {
    let photoUrl = existingPhoto;
    if (file) {
      photoUrl = await uploadFileToStorage(file, `member_photos/${Date.now()}_${file.name}`, pct => {
        fill.style.width = (pct * 100) + "%";
      });
    }

    const data = { name, year, role, phone, order, photoUrl, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

    if (id) {
      await db.collection("club_members").doc(id).update(data);
      showToast("Member updated!", "success");
      await logActivity("member", `Updated member: "${name}"`);
    } else {
      data.addedBy = currentUser.email;
      data.addedAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("club_members").add(data);
      showToast("Member added!", "success");
      await logActivity("member", `Added member: "${name}"`);
    }
    closeMemberModal();
    loadMembers();
    loadStats();
  } catch(e) { handleFirebaseError(e, "saveMember"); }

  wrapper.style.display = "none"; fill.style.width = "0%";
}

async function deleteMember(docId, photoUrl) {
  if (!confirm("Delete this member?")) return;
  try {
    await db.collection("club_members").doc(docId).delete();
    if (photoUrl) await storage.refFromURL(photoUrl).delete().catch(() => {});
    showToast("Member deleted", "info"); await logActivity("member", "Removed a member"); loadMembers(); loadStats();
  } catch(e) { showToast("Error deleting member", "error"); }
}

function getRoleBadgeColor(role) {
  const map = {
    "President":      { bg: "rgba(230,57,70,0.15)",  text: "#e63946", border: "rgba(230,57,70,0.3)" },
    "Vice President": { bg: "rgba(230,57,70,0.12)",  text: "#ff8c8c", border: "rgba(230,57,70,0.25)" },
    "Secretary":      { bg: "rgba(243,156,18,0.15)", text: "#f5c842", border: "rgba(243,156,18,0.3)" },
    "Treasurer":      { bg: "rgba(230,57,70,0.15)",  text: "#e63946", border: "rgba(230,57,70,0.3)" },
    "Organiser":      { bg: "rgba(69,123,157,0.15)", text: "#7aadcd", border: "rgba(69,123,157,0.3)" },
    "Creative":       { bg: "rgba(106,90,205,0.15)", text: "#b8a4ff", border: "rgba(106,90,205,0.3)" },
    "Volunteer":      { bg: "rgba(39,174,96,0.15)",  text: "#5dde8a", border: "rgba(39,174,96,0.3)" },
    "Advisor":        { bg: "rgba(243,156,18,0.15)", text: "#f5c842", border: "rgba(243,156,18,0.3)" },
  };
  return map[role] || { bg: "rgba(255,255,255,0.07)", text: "#aaa", border: "rgba(255,255,255,0.12)" };
}

// ─── FACULTY MEMBERS ──────────────────────────────
async function loadFaculty() {
  const grid = document.getElementById("faculty-admin-grid");
  grid.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted);grid-column:1/-1">⏳ Loading...</div>';
  try {
    const snap = await db.collection("faculty_members").get();
    if (snap.empty) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">👨‍🏫</div><p>No faculty yet. Click "Add Faculty" to add one.</p></div>';
      return;
    }
    grid.innerHTML = "";
    const facultyDocs = snap.docs.slice().sort((a, b) => ((a.data().order||99) - (b.data().order||99)));
    facultyDocs.forEach(doc => {
      const d = doc.data();
      const card = document.createElement("div");
      card.className = "admin-faculty-card";
      card.innerHTML = `
        <div class="afc-photo">
          ${d.photoUrl
            ? `<img src="${d.photoUrl}" alt="${d.name}" style="width:100%;height:100%;object-fit:cover;object-position:top;border-radius:10px">`
            : `<span style="font-size:30px">👤</span>`}
        </div>
        <div class="afc-info">
          ${d.isHod === "yes" ? `<span class="afc-hod-badge">HoD</span>` : ""}
          <div class="afc-name">${d.name || "—"}</div>
          <div class="afc-qual">${d.qualification || ""}</div>
          <div class="afc-desg">${d.designation || ""}</div>
          ${d.bio ? `<div class="afc-bio">${d.bio.substring(0,80)}${d.bio.length>80?'…':''}</div>` : ""}
        </div>
        <div class="afc-actions">
          <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" onclick='openFacultyModal(${JSON.stringify({id:doc.id,...d})})'>✏️ Edit</button>
          <button class="btn btn-danger" style="padding:6px 12px;font-size:12px" onclick="deleteFaculty('${doc.id}','${(d.photoUrl||"").replace(/'/g,"\\'")}')">🗑️</button>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch(e) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">⚠️</div><p>Error loading faculty</p></div>'; console.error(e); }
}

function openFacultyModal(existing) {
  const modal = document.getElementById("faculty-modal");
  modal.classList.add("open");
  document.getElementById("faculty-progress-wrapper").style.display = "none";

  if (existing && typeof existing === "object") {
    document.getElementById("faculty-modal-title").textContent   = "Edit Faculty";
    document.getElementById("faculty-edit-id").value             = existing.id || "";
    document.getElementById("faculty-existing-photo").value      = existing.photoUrl || "";
    document.getElementById("faculty-name").value                = existing.name || "";
    document.getElementById("faculty-qual").value                = existing.qualification || "";
    document.getElementById("faculty-desg").value                = existing.designation || "";
    document.getElementById("faculty-order").value               = existing.order !== undefined ? existing.order : 99;
    document.getElementById("faculty-is-hod").value             = existing.isHod || "no";
    document.getElementById("faculty-bio").value                 = existing.bio || "";
    const preview = document.getElementById("faculty-photo-preview");
    if (existing.photoUrl) {
      preview.innerHTML = `<img src="${existing.photoUrl}" style="width:100%;height:100%;object-fit:cover;object-position:top;border-radius:50%">`;
    } else {
      preview.innerHTML = "👤";
    }
  } else {
    document.getElementById("faculty-modal-title").textContent   = "Add Faculty Member";
    document.getElementById("faculty-edit-id").value             = "";
    document.getElementById("faculty-existing-photo").value      = "";
    document.getElementById("faculty-name").value                = "";
    document.getElementById("faculty-qual").value                = "";
    document.getElementById("faculty-desg").value                = "";
    document.getElementById("faculty-order").value               = 99;
    document.getElementById("faculty-is-hod").value             = "no";
    document.getElementById("faculty-bio").value                 = "";
    document.getElementById("faculty-photo-preview").innerHTML   = "👤";
  }
  document.getElementById("faculty-photo-input").value = "";
}
function closeFacultyModal() { document.getElementById("faculty-modal").classList.remove("open"); }

function previewFacultyPhoto(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("faculty-photo-preview").innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;object-position:top;border-radius:50%">`;
  };
  reader.readAsDataURL(file);
}

async function saveFaculty() {
  if (!checkAuth()) return;
  const id            = document.getElementById("faculty-edit-id").value;
  const name          = document.getElementById("faculty-name").value.trim();
  const qualification = document.getElementById("faculty-qual").value.trim();
  const designation   = document.getElementById("faculty-desg").value.trim();
  const order         = parseInt(document.getElementById("faculty-order").value) || 99;
  const isHod         = document.getElementById("faculty-is-hod").value;
  const bio           = document.getElementById("faculty-bio").value.trim();
  const file          = document.getElementById("faculty-photo-input").files[0];
  const existingPhoto = document.getElementById("faculty-existing-photo").value;

  if (!name) { showToast("Please enter a faculty name", "error"); return; }

  const wrapper = document.getElementById("faculty-progress-wrapper");
  const fill    = document.getElementById("faculty-progress-fill");
  wrapper.style.display = "block";

  try {
    let photoUrl = existingPhoto;
    if (file) {
      photoUrl = await uploadFileToStorage(file, `faculty_photos/${Date.now()}_${file.name}`, pct => {
        fill.style.width = (pct * 100) + "%";
      });
    }

    const data = { name, qualification, designation, order, isHod, bio, photoUrl, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

    if (id) {
      await db.collection("faculty_members").doc(id).update(data);
      showToast("Faculty updated!", "success");
    } else {
      data.addedBy = currentUser.email;
      data.addedAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("faculty_members").add(data);
      showToast("Faculty added!", "success");
    }
    closeFacultyModal();
    loadFaculty();
    loadStats();
  } catch(e) { handleFirebaseError(e, "saveFaculty"); }

  wrapper.style.display = "none"; fill.style.width = "0%";
}

async function deleteFaculty(docId, photoUrl) {
  if (!confirm("Delete this faculty member?")) return;
  try {
    await db.collection("faculty_members").doc(docId).delete();
    if (photoUrl) await storage.refFromURL(photoUrl).delete().catch(() => {});
    showToast("Faculty deleted", "info"); loadFaculty(); loadStats();
  } catch(e) { showToast("Error deleting faculty", "error"); }
}

// ─── ANNOUNCEMENTS ────────────────────────────────
async function loadAnnouncements() {
  const list = document.getElementById("ann-list");
  list.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted)">⏳ Loading...</div>';
  try {
    const snap = await db.collection("announcements").orderBy("addedAt", "desc").get();
    if (snap.empty) {
      list.innerHTML = '<div class="empty-state"><div class="es-icon">📢</div><p>No announcements yet. Add one above.</p></div>';
      return;
    }
    list.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:8px";
      row.innerHTML = `
        <span style="flex:1;font-size:14px">${d.text}</span>
        <button class="btn btn-danger" style="padding:6px 12px;font-size:12px;flex-shrink:0" onclick="deleteAnnouncement('${doc.id}')">🗑 Delete</button>
      `;
      list.appendChild(row);
    });
  } catch(e) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><p>Error loading announcements. Check Firestore rules.</p></div>';
    console.error("loadAnnouncements error:", e);
  }
}

async function addAnnouncement() {
  if (!checkAuth()) return;
  const text = document.getElementById("ann-text").value.trim();
  if (!text) { showToast("Please enter announcement text", "error"); return; }
  try {
    await db.collection("announcements").add({
      text,
      order: Date.now(),
      addedBy: currentUser.email,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById("ann-text").value = "";
    showToast("Announcement added!", "success");
    loadAnnouncements();
    // Notify all newsletter subscribers about this announcement
    broadcastToSubscribers("announcement", text, text);
  } catch(e) { handleFirebaseError(e, "addAnnouncement"); }
}

async function deleteAnnouncement(docId) {
  if (!confirm("Delete this announcement?")) return;
  try {
    await db.collection("announcements").doc(docId).delete();
    showToast("Announcement deleted", "info");
    loadAnnouncements();
  } catch(e) { showToast("Error deleting announcement", "error"); }
}

// ─── RESOURCES ────────────────────────────────────
let allResources = [];
let currentResourceFilter = "all";

async function loadResources() {
  const list = document.getElementById("resources-list");
  list.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted)">⏳ Loading...</div>';
  try {
    const snap = await db.collection("resources").orderBy("addedAt", "desc").get();
    allResources = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderResources(currentResourceFilter);
  } catch(e) { list.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><p>Error loading resources</p></div>'; }
}

function filterResources(type, btn) {
  currentResourceFilter = type;
  document.querySelectorAll("#panel-resources .tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderResources(type);
}

const resourceTypeIcons = { notes: "📄", video: "🎥", tool: "🔧", link: "🔗" };

function renderResources(type) {
  const list = document.getElementById("resources-list");
  const filtered = type === "all" ? allResources : allResources.filter(r => r.type === type);
  if (!filtered.length) { list.innerHTML = '<div class="empty-state"><div class="es-icon">📚</div><p>No resources yet.</p></div>'; return; }
  list.innerHTML = filtered.map(r => `
    <div style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:8px">
      <div style="font-size:28px;flex-shrink:0">${resourceTypeIcons[r.type] || "🔗"}</div>
      <div style="flex:1;overflow:hidden">
        <div style="font-weight:700;font-size:14px">${r.title}</div>
        ${r.category ? `<div style="font-size:12px;color:#aaa;margin-top:2px">📂 ${r.category}</div>` : ""}
        ${r.description ? `<div style="font-size:12px;color:#bbb;margin-top:4px">${r.description}</div>` : ""}
        <a href="${r.url}" target="_blank" style="font-size:12px;color:#e63946;word-break:break-all">${r.url}</a>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" onclick='openResourceModal(${JSON.stringify({id:r.id,...r})})'>✏️</button>
        <button class="btn btn-danger" style="padding:6px 12px;font-size:12px" onclick="deleteResource('${r.id}')">🗑️</button>
      </div>
    </div>
  `).join("");
}

function openResourceModal(existing) {
  document.getElementById("resource-modal").classList.add("open");
  if (existing && typeof existing === "object") {
    document.getElementById("resource-modal-title").textContent = "Edit Resource";
    document.getElementById("resource-edit-id").value  = existing.id || "";
    document.getElementById("resource-type").value     = existing.type || "link";
    document.getElementById("resource-category").value = existing.category || "";
    document.getElementById("resource-title").value    = existing.title || "";
    document.getElementById("resource-url").value      = existing.url || "";
    document.getElementById("resource-desc").value     = existing.description || "";
  } else {
    document.getElementById("resource-modal-title").textContent = "Add Resource";
    document.getElementById("resource-edit-id").value  = "";
    document.getElementById("resource-type").value     = "notes";
    document.getElementById("resource-category").value = "";
    document.getElementById("resource-title").value    = "";
    document.getElementById("resource-url").value      = "";
    document.getElementById("resource-desc").value     = "";
  }
}

function closeResourceModal() { document.getElementById("resource-modal").classList.remove("open"); }

async function saveResource() {
  if (!checkAuth()) return;
  const id   = document.getElementById("resource-edit-id").value;
  const type = document.getElementById("resource-type").value;
  const cat  = document.getElementById("resource-category").value.trim();
  const title= document.getElementById("resource-title").value.trim();
  const url  = document.getElementById("resource-url").value.trim();
  const desc = document.getElementById("resource-desc").value.trim();
  if (!title) { showToast("Please enter a title", "error"); return; }
  if (!url)   { showToast("Please enter a URL", "error"); return; }
  const data = { type, category: cat, title, url, description: desc, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  try {
    if (id) { await db.collection("resources").doc(id).update(data); showToast("Resource updated!", "success"); }
    else { data.addedBy = currentUser.email; data.addedAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection("resources").add(data); showToast("Resource added!", "success"); }
    closeResourceModal();
    loadResources();
  } catch(e) { handleFirebaseError(e, "saveResource"); }
}

async function deleteResource(docId) {
  if (!confirm("Delete this resource?")) return;
  try {
    await db.collection("resources").doc(docId).delete();
    showToast("Resource deleted", "info"); loadResources();
  } catch(e) { showToast("Error deleting resource", "error"); }
}

// ─── PROJECTS ─────────────────────────────────────
async function loadProjects() {
  const list = document.getElementById("projects-list");
  list.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted)">⏳ Loading...</div>';
  try {
    const snap = await db.collection("projects").orderBy("addedAt", "desc").get();
    if (snap.empty) { list.innerHTML = '<div class="empty-state"><div class="es-icon">💡</div><p>No projects yet. Click "Add Project" to add one.</p></div>'; return; }
    list.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const card = document.createElement("div");
      card.style.cssText = "padding:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;margin-bottom:10px";
      card.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:14px">
          <div style="font-size:32px">💡</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:15px">${d.title}</div>
            ${d.team ? `<div style="font-size:12px;color:#aaa;margin-top:3px">👥 ${d.team}</div>` : ""}
            ${d.year ? `<div style="font-size:12px;color:#aaa">📅 ${d.year}</div>` : ""}
            <div style="font-size:13px;color:#bbb;margin-top:6px">${d.description || ""}</div>
            ${d.link ? `<a href="${d.link}" target="_blank" style="font-size:12px;color:#e63946;display:inline-block;margin-top:4px">🔗 ${d.link}</a>` : ""}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" onclick='openProjectModal(${JSON.stringify({id:doc.id,...d})})'>✏️ Edit</button>
            <button class="btn btn-danger" style="padding:6px 12px;font-size:12px" onclick="deleteProject('${doc.id}')">🗑️</button>
          </div>
        </div>
      `;
      list.appendChild(card);
    });
  } catch(e) { list.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><p>Error loading projects</p></div>'; }
}

function openProjectModal(existing) {
  document.getElementById("project-modal").classList.add("open");
  if (existing && typeof existing === "object") {
    document.getElementById("project-modal-title").textContent = "Edit Project";
    document.getElementById("project-edit-id").value = existing.id || "";
    document.getElementById("project-title").value   = existing.title || "";
    document.getElementById("project-team").value    = existing.team || "";
    document.getElementById("project-desc").value    = existing.description || "";
    document.getElementById("project-link").value    = existing.link || "";
    document.getElementById("project-year").value    = existing.year || "";
  } else {
    document.getElementById("project-modal-title").textContent = "Add Project";
    document.getElementById("project-edit-id").value = "";
    document.getElementById("project-title").value   = "";
    document.getElementById("project-team").value    = "";
    document.getElementById("project-desc").value    = "";
    document.getElementById("project-link").value    = "";
    document.getElementById("project-year").value    = new Date().getFullYear();
  }
}

function closeProjectModal() { document.getElementById("project-modal").classList.remove("open"); }

async function saveProject() {
  if (!checkAuth()) return;
  const id    = document.getElementById("project-edit-id").value;
  const title = document.getElementById("project-title").value.trim();
  const team  = document.getElementById("project-team").value.trim();
  const desc  = document.getElementById("project-desc").value.trim();
  const link  = document.getElementById("project-link").value.trim();
  const year  = document.getElementById("project-year").value.trim();
  if (!title) { showToast("Please enter a project title", "error"); return; }
  const data = { title, team, description: desc, link, year, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  try {
    if (id) { await db.collection("projects").doc(id).update(data); showToast("Project updated!", "success"); }
    else { data.addedBy = currentUser.email; data.addedAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection("projects").add(data); showToast("Project added!", "success"); }
    closeProjectModal();
    loadProjects();
  } catch(e) { handleFirebaseError(e, "saveProject"); }
}

async function deleteProject(docId) {
  if (!confirm("Delete this project?")) return;
  try {
    await db.collection("projects").doc(docId).delete();
    showToast("Project deleted", "info"); loadProjects();
  } catch(e) { showToast("Error deleting project", "error"); }
}

// ─── CONTACTS / ENQUIRY INBOX ─────────────────────
let allContacts = [];
let currentContactFilter = "all";

async function loadContacts() {
  const list = document.getElementById("contacts-list");
  list.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted)">⏳ Loading...</div>';
  try {
    const snap = await db.collection("contacts").orderBy("submittedAt", "desc").get();
    allContacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderContacts(currentContactFilter);
  } catch(e) { list.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><p>Error loading enquiries</p></div>'; }
}

function filterContacts(type, btn) {
  currentContactFilter = type;
  document.querySelectorAll("#panel-contacts .tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderContacts(type);
}

function renderContacts(type) {
  const list = document.getElementById("contacts-list");
  const filtered = type === "all" ? allContacts : allContacts.filter(c => type === "unread" ? !c.read : c.read);
  if (!filtered.length) { list.innerHTML = `<div class="empty-state"><div class="es-icon">✉️</div><p>No ${type === "all" ? "" : type} enquiries.</p></div>`; return; }
  list.innerHTML = filtered.map(c => `
    <div style="padding:16px;background:${c.read ? 'rgba(255,255,255,0.03)' : 'rgba(230,57,70,0.06)'};border:1px solid ${c.read ? 'rgba(255,255,255,0.07)' : 'rgba(230,57,70,0.2)'};border-radius:12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-size:16px">👤</span>
        <strong style="font-size:14px">${c.name || "Anonymous"}</strong>
        <span style="font-size:12px;color:#aaa">${c.email || ""}</span>
        ${c.phone ? `<span style="font-size:12px;color:#aaa">📞 ${c.phone}</span>` : ""}
        <span style="margin-left:auto;font-size:11px;color:${c.read ? '#aaa' : '#e63946'};font-weight:700">${c.read ? "Read" : "● Unread"}</span>
      </div>
      <div style="font-size:13px;color:#ccc;padding:10px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:10px">${c.message || ""}</div>
      <div style="display:flex;gap:8px">
        ${!c.read ? `<button class="btn btn-primary" style="padding:6px 14px;font-size:12px" onclick="markContactRead('${c.id}')">✅ Mark as Read</button>` : ""}
        <button class="btn btn-danger" style="padding:6px 14px;font-size:12px" onclick="deleteContact('${c.id}')">🗑 Delete</button>
      </div>
    </div>
  `).join("");
}

async function markContactRead(docId) {
  try {
    await db.collection("contacts").doc(docId).update({ read: true, readAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast("Marked as read", "success"); loadContacts();
  } catch(e) { showToast("Error", "error"); }
}

async function deleteContact(docId) {
  if (!confirm("Delete this enquiry?")) return;
  try {
    await db.collection("contacts").doc(docId).delete();
    showToast("Enquiry deleted", "info"); loadContacts();
  } catch(e) { showToast("Error deleting enquiry", "error"); }
}

// ─── REGISTRATIONS ────────────────────────────────
async function loadRegistrationEvents() {
  const select = document.getElementById("reg-event-filter");
  const currentVal = select.value;
  try {
    const snap = await db.collection("events").where("type", "==", "upcoming").get();
    select.innerHTML = '<option value="all">All Events</option>';
    snap.forEach(doc => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = doc.data().title || doc.id;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  } catch(e) { /* silently fail */ }
}

async function loadRegistrations() {
  const list = document.getElementById("registrations-list");
  const eventId = document.getElementById("reg-event-filter").value;
  list.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted)">⏳ Loading...</div>';
  try {
    let query = db.collection("registrations").orderBy("registeredAt", "desc");
    if (eventId !== "all") query = db.collection("registrations").where("eventId", "==", eventId);
    const snap = await query.get();
    if (snap.empty) { list.innerHTML = '<div class="empty-state"><div class="es-icon">📝</div><p>No registrations yet.</p></div>'; return; }
    list.innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
              <th style="padding:10px 12px;text-align:left;color:#aaa;font-weight:600">#</th>
              <th style="padding:10px 12px;text-align:left;color:#aaa;font-weight:600">Name</th>
              <th style="padding:10px 12px;text-align:left;color:#aaa;font-weight:600">Email</th>
              <th style="padding:10px 12px;text-align:left;color:#aaa;font-weight:600">Phone</th>
              <th style="padding:10px 12px;text-align:left;color:#aaa;font-weight:600">Year/Dept</th>
              <th style="padding:10px 12px;text-align:left;color:#aaa;font-weight:600">Event</th>
              <th style="padding:10px 12px;text-align:left;color:#aaa;font-weight:600">Status</th>
              <th style="padding:10px 12px;text-align:left;color:#aaa;font-weight:600">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${snap.docs.map((doc, i) => {
              const d = doc.data();
              const isConfirmed = d.confirmed === true;
              return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
                <td style="padding:10px 12px;color:#aaa">${i+1}</td>
                <td style="padding:10px 12px;font-weight:600">${d.name || "—"}</td>
                <td style="padding:10px 12px;color:#aaa">${d.email || "—"}</td>
                <td style="padding:10px 12px;color:#aaa">${d.phone || "—"}</td>
                <td style="padding:10px 12px;color:#aaa">${d.yearDept || "—"}</td>
                <td style="padding:10px 12px;color:#aaa">${d.eventTitle || d.eventId || "—"}</td>
                <td style="padding:10px 12px">
                  <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:100px;background:${isConfirmed ? 'rgba(39,174,96,0.15)' : 'rgba(255,200,0,0.12)'};color:${isConfirmed ? '#27ae60' : '#f0c000'}">
                    ${isConfirmed ? '✅ Confirmed' : '⏳ Pending'}
                  </span>
                </td>
                <td style="padding:10px 12px;display:flex;gap:6px;align-items:center">
                  ${!isConfirmed ? `<button class="btn btn-primary" style="padding:4px 10px;font-size:11px;background:rgba(39,174,96,0.2);border:1px solid rgba(39,174,96,0.4);color:#27ae60" onclick="confirmRegistration('${doc.id}','${(d.name||'').replace(/'/g,"\\'")}','${(d.email||'').replace(/'/g,"\\'")}','${(d.eventTitle||d.eventId||'').replace(/'/g,"\\'")}')">✅ Confirm</button>` : ""}
                  <button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="deleteRegistration('${doc.id}')">🗑</button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch(e) { list.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><p>Error loading registrations. Ensure Firestore indexes are set up.</p></div>'; console.error(e); }
}

async function confirmRegistration(docId, userName, userEmail, eventTitle) {
  if (!confirm(`Confirm registration for ${userName} (${userEmail})?`)) return;
  try {
    await db.collection("registrations").doc(docId).update({
      confirmed: true,
      confirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
      confirmedBy: currentUser.email
    });
    showToast("Registration confirmed!", "success");
    // Send confirmation email to the user
    sendRegistrationConfirmationEmail(userName, userEmail, eventTitle);
    loadRegistrations();
  } catch(e) { showToast("Error confirming registration: " + e.message, "error"); }
}

function sendRegistrationConfirmationEmail(userName, userEmail, eventTitle) {
  if (typeof emailjs === "undefined") {
    console.warn("EmailJS not loaded — skipping email send.");
    return;
  }
  emailjs.send(
    window.EMAILJS_SERVICE_ID || "service_neuralnexus",
    window.EMAILJS_CONFIRM_TEMPLATE || "template_confirm",
    {
      to_name: userName,
      to_email: userEmail,
      event_title: eventTitle,
      club_name: "Neural Nexus — AI & DS Club",
      club_email: "neuralnexusgroup@gmail.com",
      club_phone: "9014196561"
    }
  ).then(() => {
    showToast("Confirmation email sent to " + userEmail, "success");
  }).catch(err => {
    console.warn("EmailJS error:", err);
    showToast("Confirmation saved but email failed — check EmailJS config", "info");
  });
}

async function deleteRegistration(docId) {
  if (!confirm("Delete this registration?")) return;
  try {
    await db.collection("registrations").doc(docId).delete();
    showToast("Registration deleted", "info"); loadRegistrations();
  } catch(e) { showToast("Error deleting registration", "error"); }
}

// ─── HELPERS ──────────────────────────────────────
function makeImageItem(url, onDelete) {
  const item = document.createElement("div");
  item.className = "img-item";
  item.innerHTML = `
    <img src="${url}" loading="lazy" alt="image">
    <div class="img-overlay">
      <button class="img-del">🗑 Delete</button>
    </div>
  `;
  item.querySelector(".img-del").onclick = onDelete;
  return item;
}

function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  toast.innerHTML = `${icons[type] || "ℹ️"} ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("show");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("show");
}

document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.getElementById("login-screen").style.display !== "none") {
    doLogin();
  }
});

// ══════════════════════════════════════════════════════
// NEW FEATURES — Admin CRUD Functions
// ══════════════════════════════════════════════════════

// Helper: simple list renderer
function renderAdminList(containerId, items, renderFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="empty-state"><div class="es-icon">📭</div><p>Nothing here yet.</p></div>'; return; }
  el.innerHTML = items.map(renderFn).join("");
}

// Helper: verify admin is logged in before any write
function checkAuth() {
  if (!currentUser) {
    showToast("You are not logged in. Please refresh and log in again.", "error");
    return false;
  }
  return true;
}

// Helper: convert Firebase errors into readable messages
function handleFirebaseError(e, label) {
  console.error(label + " error:", e);
  let msg = e.message || "Unknown error";
  if (e.code === "permission-denied" || msg.includes("permission") || msg.includes("insufficient")) {
    msg = "Permission denied. Your Firebase security rules need to be updated — see the README or contact the site admin.";
  } else if (e.code === "unavailable" || msg.includes("network")) {
    msg = "Network error. Please check your internet connection and try again.";
  } else if (e.code === "unauthenticated") {
    msg = "Not authenticated. Please log out and log in again.";
  }
  showToast("❌ " + msg, "error");
}

// ── ALUMNI ──────────────────────────────────────────────
async function loadAdminAlumni() {
  const el = document.getElementById("alumni-admin-list");
  if (!el) return;
  try {
    const snap = await db.collection("alumni").orderBy("addedAt","desc").get();
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><div class="es-icon">🎓</div><p>No alumni added yet.</p></div>'; return; }
    el.innerHTML = snap.docs.map(d => {
      const a = d.data();
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div><strong style="color:#fff">${a.name}</strong> <span style="color:#e63946;font-size:12px">Batch ${a.batch||"—"}</span><br>
        <span style="color:var(--muted);font-size:13px">${a.role||""} ${a.company?"at "+a.company:""}</span></div>
        <button class="btn btn-danger" style="padding:5px 12px;font-size:12px" onclick="deleteDoc('alumni','${d.id}',loadAdminAlumni)">🗑</button>
      </div>`;
    }).join("");
  } catch(e) { el.innerHTML = '<div class="empty-state"><p>Error loading.</p></div>'; }
}
async function saveAlumni() {
  if (!checkAuth()) return;
  const name = document.getElementById("al-name").value.trim();
  const batch = document.getElementById("al-batch").value.trim();
  if (!name || !batch) { showToast("Name and batch year are required","error"); return; }
  try {
    await db.collection("alumni").add({ name, batch, company: document.getElementById("al-company").value.trim(), role: document.getElementById("al-role").value.trim(), linkedin: document.getElementById("al-linkedin").value.trim(), addedBy: currentUser.email, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast("Alumni added!","success");
    ["al-name","al-batch","al-company","al-role","al-linkedin"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
    loadAdminAlumni();
  } catch(e) { handleFirebaseError(e, "saveAlumni"); }
}

// ── LEADERBOARD ─────────────────────────────────────────
async function loadAdminLeaderboard() {
  const el = document.getElementById("lb-admin-list");
  if (!el) return;
  try {
    const snap = await db.collection("leaderboard").get();
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><div class="es-icon">🏅</div><p>No entries yet.</p></div>'; return; }
    const lbDocs = snap.docs.slice().sort((a,b) => (b.data().points||0) - (a.data().points||0));
    el.innerHTML = lbDocs.map((d,i) => {
      const a = d.data();
      return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <strong style="color:#e63946;min-width:26px">#${i+1}</strong>
        <div style="flex:1"><strong style="color:#fff">${a.name}</strong><br><span style="color:var(--muted);font-size:12px">${a.dept||""} · ${a.points} pts</span></div>
        <button class="btn btn-danger" style="padding:5px 12px;font-size:12px" onclick="deleteDoc('leaderboard','${d.id}',loadAdminLeaderboard)">🗑</button>
      </div>`;
    }).join("");
  } catch(e) { el.innerHTML = '<div class="empty-state"><p>Error loading.</p></div>'; }
}
async function saveLeaderboard() {
  if (!checkAuth()) return;
  const name = document.getElementById("lb-name").value.trim();
  const pts = parseInt(document.getElementById("lb-points").value)||0;
  if (!name) { showToast("Name is required","error"); return; }
  const badges = (document.getElementById("lb-badges").value||"").split(",").map(b=>b.trim()).filter(Boolean);
  try {
    await db.collection("leaderboard").add({ name, dept: document.getElementById("lb-dept").value.trim(), points: pts, badges, addedBy: currentUser.email, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast("Entry added!","success");
    ["lb-name","lb-dept","lb-points","lb-badges"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
    loadAdminLeaderboard();
  } catch(e) { handleFirebaseError(e, "saveLeaderboard"); }
}

// ── PLACEMENTS ──────────────────────────────────────────
async function loadAdminPlacements() {
  const el = document.getElementById("placements-admin-list");
  if (!el) return;
  try {
    const snap = await db.collection("placements").orderBy("addedAt","desc").get();
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><div class="es-icon">💼</div><p>No placements yet.</p></div>'; return; }
    el.innerHTML = snap.docs.map(d => {
      const a = d.data();
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div><strong style="color:#fff">${a.name}</strong> <span style="color:var(--muted);font-size:12px">${a.year||""}</span><br>
        <span style="color:#27ae60;font-size:13px">${a.role||""} @ ${a.company||""} ${a.package?"· ₹"+a.package+" LPA":""}</span></div>
        <button class="btn btn-danger" style="padding:5px 12px;font-size:12px" onclick="deleteDoc('placements','${d.id}',loadAdminPlacements)">🗑</button>
      </div>`;
    }).join("");
  } catch(e) { el.innerHTML = '<div class="empty-state"><p>Error loading.</p></div>'; }
}
async function savePlacement() {
  if (!checkAuth()) return;
  const name = document.getElementById("pl-name").value.trim();
  const company = document.getElementById("pl-company").value.trim();
  if (!name || !company) { showToast("Name and company are required","error"); return; }
  try {
    await db.collection("placements").add({ name, company, role: document.getElementById("pl-role").value.trim(), year: document.getElementById("pl-year").value.trim(), package: document.getElementById("pl-package").value.trim(), companyEmoji: document.getElementById("pl-emoji").value.trim()||"🏢", addedBy: currentUser.email, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast("Placement added!","success");
    ["pl-name","pl-company","pl-role","pl-year","pl-package","pl-emoji"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
    loadAdminPlacements();
  } catch(e) { handleFirebaseError(e, "savePlacement"); }
}

// ── BLOG ────────────────────────────────────────────────
async function loadAdminBlog() {
  const el = document.getElementById("blog-admin-list");
  if (!el) return;
  try {
    const snap = await db.collection("blog").orderBy("addedAt","desc").get();
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><div class="es-icon">✍️</div><p>No articles yet.</p></div>'; return; }
    el.innerHTML = snap.docs.map(d => {
      const a = d.data();
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div><strong style="color:#fff">${a.title||"Untitled"}</strong><br>
        <span style="color:var(--muted);font-size:12px">${a.author||"—"} · ${a.category||""} · ${a.date||""}</span></div>
        <button class="btn btn-danger" style="padding:5px 12px;font-size:12px" onclick="deleteDoc('blog','${d.id}',loadAdminBlog)">🗑</button>
      </div>`;
    }).join("");
  } catch(e) { el.innerHTML = '<div class="empty-state"><p>Error loading.</p></div>'; }
}
async function saveBlog() {
  if (!checkAuth()) return;
  const title = document.getElementById("bl-title").value.trim();
  if (!title) { showToast("Title is required","error"); return; }
  try {
    await db.collection("blog").add({ title, author: document.getElementById("bl-author").value.trim(), category: document.getElementById("bl-cat").value.trim(), date: document.getElementById("bl-date").value, url: document.getElementById("bl-url").value.trim(), coverImage: document.getElementById("bl-cover").value.trim(), excerpt: document.getElementById("bl-excerpt").value.trim(), addedBy: currentUser.email, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast("Article published!","success");
    ["bl-title","bl-author","bl-cat","bl-url","bl-cover","bl-excerpt","bl-date"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
    loadAdminBlog();
  } catch(e) { handleFirebaseError(e, "saveBlog"); }
}

// ── NEWSLETTER ──────────────────────────────────────────
async function loadAdminNewsletter() {
  const el = document.getElementById("newsletter-admin-list");
  if (!el) return;
  try {
    const snap = await db.collection("newsletter").orderBy("subscribedAt","desc").get();
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><div class="es-icon">📧</div><p>No subscribers yet.</p></div>'; return; }
    el.innerHTML = `<table style="width:100%;border-collapse:collapse"><tr style="border-bottom:1px solid rgba(255,255,255,0.1)"><th style="text-align:left;padding:8px 12px;color:var(--muted);font-size:12px;font-weight:700">#</th><th style="text-align:left;padding:8px 12px;color:var(--muted);font-size:12px;font-weight:700">Email</th><th style="text-align:left;padding:8px 12px;color:var(--muted);font-size:12px;font-weight:700">Subscribed</th><th></th></tr>` +
    snap.docs.map((d,i) => {
      const a = d.data();
      const dt = a.subscribedAt?.toDate ? a.subscribedAt.toDate().toLocaleDateString("en-IN") : "—";
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05)"><td style="padding:10px 12px;color:var(--muted);font-size:13px">${i+1}</td><td style="padding:10px 12px;color:#fff;font-size:13px">${a.email||"—"}</td><td style="padding:10px 12px;color:var(--muted);font-size:12px">${dt}</td><td style="padding:10px 12px"><button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="deleteDoc('newsletter','${d.id}',loadAdminNewsletter)">🗑</button></td></tr>`;
    }).join("") + "</table>";
  } catch(e) { el.innerHTML = '<div class="empty-state"><p>Error loading.</p></div>'; }
}

// ── LIVE QUIZ ────────────────────────────────────────────
// ── QUIZ SYSTEM ─────────────────────────────────────────────────────────────
let QSid = null; // active quiz session ID
let QQuestions = []; // local question queue cache
let QAutoTimer = null; // auto-advance timer handle
let QPartUnsub = null; // participant listener unsub
let QFlagUnsub = null; // flag listener unsub

async function initQuizPanel() {
  // Check if there's already an active/open session
  try {
    const snap = await db.collection('quiz_sessions')
      .where('status','in',['setup','open','active'])
      .orderBy('createdAt','desc').limit(1).get();
    if (!snap.empty) {
      QSid = snap.docs[0].id;
      const d = snap.docs[0].data();
      QQuestions = [];
      // Load questions from Firestore
      const qsnap = await db.collection('quiz_questions').where('sessionId','==',QSid).orderBy('order','asc').get();
      qsnap.docs.forEach(doc => QQuestions.push({id:doc.id,...doc.data()}));
      showQuizSessionUI(d.title, d.status);
    }
  } catch(e) { console.error('initQuizPanel', e); }
}

function showQuizSessionUI(title, status) {
  document.getElementById('qz-create-area').style.display = 'none';
  document.getElementById('qz-session-banner').style.display = 'block';
  document.getElementById('qz-session-title').textContent = title;
  document.getElementById('qz-addq-card').style.display = 'block';
  document.getElementById('qz-q-count').textContent = QQuestions.length;
  renderQuestionList();
  const statusMap = {setup:'Setup (not open)',open:'Open — Members can join',active:'LIVE — Quiz Running',ended:'Ended'};
  const statusColors = {setup:'#f5c842',open:'#27ae60',active:'#e63946',ended:'#aaa'};
  const sl = document.getElementById('qz-status-label');
  sl.textContent = statusMap[status] || status;
  sl.style.color = statusColors[status] || '#fff';
  if (status === 'open' || status === 'active') {
    document.getElementById('qz-host-card').style.display = 'block';
    startWaitingRoomListener();
  }
  if (status === 'active') {
    document.getElementById('qz-scores-card').style.display = 'block';
    loadLiveScores();
    startFlagListener();
  }
}

async function createQuizSession() {
  if (!checkAuth()) return;
  const title = document.getElementById('qz-title').value.trim();
  const gap = parseInt(document.getElementById('qz-gap').value) || 5;
  const defTimer = parseInt(document.getElementById('qz-def-timer').value) || 30;
  if (!title) { showToast('Enter a quiz title.','error'); return; }
  if (QSid) { showToast('A session already exists. Delete it first.','error'); return; }
  try {
    const ref = await db.collection('quiz_sessions').add({
      title, status:'setup', questionGap: gap, defaultTimer: defTimer,
      totalQuestions:0, currentQuestionIndex:0,
      createdBy: currentUser ? currentUser.email : 'admin',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    QSid = ref.id; QQuestions = [];
    document.getElementById('qz-q-timer').value = defTimer;
    showQuizSessionUI(title, 'setup');
    await logActivity('quiz','Created quiz session: '+title);
    showToast('Session created! Add your questions now.','success');
  } catch(e) { handleFirebaseError(e,'createQuizSession'); }
}

async function openQuizRegistration() {
  if (!QSid) { showToast('Create a session first.','error'); return; }
  if (!QQuestions.length) { showToast('Add at least one question before opening.','error'); return; }
  if (!confirm('Open quiz to registered members? They can now join the waiting room.')) return;
  try {
    // Update totalQuestions on all questions
    const batch = db.batch();
    QQuestions.forEach(q => batch.update(db.collection('quiz_questions').doc(q.id),{totalQuestions:QQuestions.length}));
    batch.update(db.collection('quiz_sessions').doc(QSid),{status:'open',totalQuestions:QQuestions.length});
    await batch.commit();
    document.getElementById('qz-status-label').textContent = 'Open — Members can join';
    document.getElementById('qz-status-label').style.color = '#27ae60';
    document.getElementById('qz-host-card').style.display = 'block';
    startWaitingRoomListener();
    startFlagListener();
    await logActivity('quiz','Opened quiz for registration: '+(QQuestions.length)+' questions');
    showToast('Quiz is open! Members can now join the waiting room.','success');
  } catch(e) { handleFirebaseError(e,'openQuizRegistration'); }
}

async function addQuizQuestion() {
  if (!QSid) { showToast('Create a session first.','error'); return; }
  const q = document.getElementById('qz-question').value.trim();
  const a = document.getElementById('qz-opt-a').value.trim();
  const b = document.getElementById('qz-opt-b').value.trim();
  const c = document.getElementById('qz-opt-c').value.trim();
  const d = document.getElementById('qz-opt-d').value.trim();
  const correct = parseInt(document.getElementById('qz-correct').value);
  const timer = parseInt(document.getElementById('qz-q-timer').value) || 30;
  if (!q||!a||!b) { showToast('Question, Option A and B are required.','error'); return; }
  const options = [a,b,...(c?[c]:[]),...(d?[d]:[])];
  if (correct>=options.length) { showToast('Correct option doesn\'t exist.','error'); return; }
  const order = QQuestions.length + 1;
  try {
    const ref = await db.collection('quiz_questions').add({
      sessionId:QSid, order, question:q, options, correctIndex:correct,
      timer, status:'waiting', totalQuestions:order,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    QQuestions.push({id:ref.id,order,question:q,options,correctIndex:correct,timer,status:'waiting'});
    await db.collection('quiz_sessions').doc(QSid).update({totalQuestions:QQuestions.length});
    ['qz-question','qz-opt-a','qz-opt-b','qz-opt-c','qz-opt-d'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('qz-q-count').textContent = QQuestions.length;
    renderQuestionList();
    showToast('Question '+order+' added!','success');
  } catch(e) { handleFirebaseError(e,'addQuizQuestion'); }
}

async function deleteQuizQuestionItem(qid, idx) {
  if (!confirm('Remove this question?')) return;
  try {
    await db.collection('quiz_questions').doc(qid).delete();
    QQuestions.splice(idx,1);
    const batch = db.batch();
    QQuestions.forEach((q,i)=>{ q.order=i+1; batch.update(db.collection('quiz_questions').doc(q.id),{order:i+1,totalQuestions:QQuestions.length}); });
    if (QSid) batch.update(db.collection('quiz_sessions').doc(QSid),{totalQuestions:QQuestions.length});
    await batch.commit();
    document.getElementById('qz-q-count').textContent = QQuestions.length;
    renderQuestionList();
    showToast('Question removed.','info');
  } catch(e) { showToast('Error removing question.','error'); }
}

function renderQuestionList() {
  const list = document.getElementById('qz-question-list');
  if (!QQuestions.length) { list.innerHTML='<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px">No questions yet.</div>'; return; }
  const statusIcon = {waiting:'&#9201;',active:'&#9679;',ended:'&#10003;'};
  const statusColor = {waiting:'#f5c842',active:'#27ae60',ended:'#aaa'};
  list.innerHTML = QQuestions.map((q,i)=>{
    const canDelete = q.status==='waiting';
    return '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:11px 14px;display:flex;align-items:center;gap:10px">'
      +'<div style="width:26px;height:26px;border-radius:7px;background:rgba(230,57,70,0.12);color:#e63946;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+q.order+'</div>'
      +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:13px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+q.question+'</div>'
        +'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+q.options.length+' opts &middot; '+q.timer+'s &middot; Correct: '+['A','B','C','D'][q.correctIndex]+'</div>'
      +'</div>'
      +'<span style="font-size:11px;font-weight:700;color:'+(statusColor[q.status]||'#fff')+'">'+(statusIcon[q.status]||'')+'</span>'
      +(canDelete?'<button onclick="deleteQuizQuestionItem(\''+q.id+'\','+i+')" style="background:none;border:none;color:#e63946;cursor:pointer;font-size:15px;padding:3px;flex-shrink:0">&#128465;</button>':'')
      +'</div>';
  }).join('');
}

// ── WAITING ROOM LISTENER ────────────────────────────────────────────────────
function startWaitingRoomListener() {
  if (!QSid || QPartUnsub) return;
  QPartUnsub = db.collection('quiz_participants').where('sessionId','==',QSid)
    .onSnapshot(snap => {
      const waiting = snap.docs.filter(d=>d.data().status==='waiting');
      const admitted = snap.docs.filter(d=>['admitted','active'].includes(d.data().status));
      document.getElementById('qz-waiting-count').textContent = waiting.length;
      document.getElementById('qz-admitted-count').textContent = admitted.length;
      renderWaitingList(waiting.map(d=>({id:d.id,...d.data()})));
      renderAdmittedList(admitted.map(d=>({id:d.id,...d.data()})));
    });
}

function renderWaitingList(participants) {
  const el = document.getElementById('qz-waiting-list');
  if (!participants.length) { el.innerHTML='<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px">No one waiting yet. Share the quiz link.</div>'; return; }
  el.innerHTML = participants.map(p=>'<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px">'
    +'<div style="font-size:18px">&#128100;</div>'
    +'<div style="flex:1;font-size:13px;font-weight:600;color:#fff">'+p.name+'</div>'
    +'<button onclick="admitParticipant(\''+p.id+'\',\''+p.name.replace(/\'/g,"\\'")+'\')" style="font-size:12px;padding:6px 12px;background:rgba(39,174,96,0.15);border:1px solid rgba(39,174,96,0.3);border-radius:8px;color:#27ae60;cursor:pointer;font-family:inherit">&#9989; Admit</button>'
    +'<button onclick="banParticipant(\''+p.id+'\',\''+p.name.replace(/\'/g,"\\'")+'\')" style="font-size:12px;padding:6px 12px;background:rgba(230,57,70,0.12);border:1px solid rgba(230,57,70,0.25);border-radius:8px;color:#e63946;cursor:pointer;font-family:inherit">&#10060; Deny</button>'
    +'</div>'
  ).join('');
}

function renderAdmittedList(participants) {
  const el = document.getElementById('qz-admitted-list');
  if (!participants.length) { el.innerHTML='<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px">No one admitted yet.</div>'; return; }
  el.innerHTML = participants.map(p=>'<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(39,174,96,0.05);border:1px solid rgba(39,174,96,0.15);border-radius:10px">'
    +'<div style="font-size:18px">&#9989;</div>'
    +'<div style="flex:1;font-size:13px;font-weight:600;color:#fff">'+p.name+'</div>'
    +'<div style="font-size:11px;color:#27ae60;font-weight:700">Score: '+(p.score||0)+'</div>'
    +'<div style="font-size:11px;color:'+(( p.tabSwitches||0)>0?'#e63946':'var(--muted)')+';font-weight:700">Tabs: '+(p.tabSwitches||0)+'</div>'
    +'<button onclick="warnParticipant(\''+p.id+'\',\''+p.name.replace(/\'/g,"\\'")+'\')" style="font-size:11px;padding:4px 8px;background:rgba(245,200,66,0.1);border:1px solid rgba(245,200,66,0.25);border-radius:6px;color:#f5c842;cursor:pointer;font-family:inherit">&#9888;</button>'
    +'<button onclick="banParticipant(\''+p.id+'\',\''+p.name.replace(/\'/g,"\\'")+'\')" style="font-size:11px;padding:4px 8px;background:rgba(230,57,70,0.1);border:1px solid rgba(230,57,70,0.25);border-radius:6px;color:#e63946;cursor:pointer;font-family:inherit">&#128683;</button>'
    +'</div>'
  ).join('');
}

async function admitAll() {
  if (!QSid) return;
  try {
    const snap = await db.collection('quiz_participants').where('sessionId','==',QSid).where('status','==','waiting').get();
    const batch = db.batch();
    snap.docs.forEach(d=>batch.update(d.ref,{status:'admitted'}));
    await batch.commit();
    showToast('All waiting participants admitted!','success');
    await logActivity('quiz','Admitted all '+snap.size+' waiting participants');
  } catch(e) { showToast('Error admitting all.','error'); }
}

async function admitParticipant(pid, name) {
  try {
    await db.collection('quiz_participants').doc(pid).update({status:'admitted'});
    showToast(name+' admitted.','success');
  } catch(e) { showToast('Error.','error'); }
}

async function warnParticipant(pid, name) {
  if (!confirm('Send a warning to '+name+'?')) return;
  try {
    await db.collection('quiz_participants').doc(pid).update({status:'warned'});
    await logActivity('quiz','Warned: '+name);
    showToast('Warning sent to '+name,'info');
  } catch(e) { showToast('Error.','error'); }
}

async function banParticipant(pid, name) {
  if (!confirm('Remove '+name+' from the quiz?')) return;
  try {
    await db.collection('quiz_participants').doc(pid).update({status:'banned'});
    await logActivity('quiz','Removed: '+name);
    showToast(name+' removed.','info');
  } catch(e) { showToast('Error.','error'); }
}

// ── AUTO QUIZ START ──────────────────────────────────────────────────────────
async function startQuizAuto() {
  if (!QSid) { showToast('No session.','error'); return; }
  const waiting = QQuestions.filter(q=>q.status==='waiting');
  if (!waiting.length) { showToast('No questions in queue.','error'); return; }
  if (!confirm('Start the quiz now? Questions will auto-advance. Do not close this tab until the quiz ends.')) return;

  try {
    await db.collection('quiz_sessions').doc(QSid).update({status:'active',startedAt:firebase.firestore.FieldValue.serverTimestamp()});
    document.getElementById('qz-status-label').textContent='LIVE — Quiz Running';
    document.getElementById('qz-status-label').style.color='#e63946';
    document.getElementById('qz-scores-card').style.display='block';
    await logActivity('quiz','Quiz started — '+waiting.length+' questions auto-running');
    showToast('Quiz started! Questions running automatically.','success');
    runNextQuestion(waiting, 0);
  } catch(e) { handleFirebaseError(e,'startQuizAuto'); }
}

async function runNextQuestion(questions, index) {
  if (index >= questions.length) {
    // All done
    await db.collection('quiz_sessions').doc(QSid).update({status:'ended',endedAt:firebase.firestore.FieldValue.serverTimestamp()});
    document.getElementById('qz-auto-status').textContent='All questions done! Results shown to participants.';
    document.getElementById('qz-status-label').textContent='Ended';
    document.getElementById('qz-status-label').style.color='#aaa';
    await logActivity('quiz','Quiz auto-completed');
    showToast('Quiz complete! All results shown.','success');
    loadLiveScores();
    return;
  }
  const q = questions[index];
  const gap = parseInt(document.getElementById('qz-gap') && document.getElementById('qz-gap').value || 5);
  try {
    // End previous
    if (index > 0) {
      await db.collection('quiz_questions').doc(questions[index-1].id).update({status:'ended',endedAt:firebase.firestore.FieldValue.serverTimestamp()});
      QQuestions.find(x=>x.id===questions[index-1].id) && (QQuestions.find(x=>x.id===questions[index-1].id).status='ended');
    }
    // Launch current
    await db.collection('quiz_questions').doc(q.id).update({status:'active',launchedAt:firebase.firestore.FieldValue.serverTimestamp()});
    q.status='active';
    QQuestions.find(x=>x.id===q.id) && (QQuestions.find(x=>x.id===q.id).status='active');
    renderQuestionList();
    document.getElementById('qz-auto-status').textContent='Q'+(index+1)+'/'+questions.length+': '+q.question.substr(0,60)+' ('+q.timer+'s)';
    loadLiveScores();
    // Wait for timer + gap, then next
    const waitMs = (q.timer + gap) * 1000;
    QAutoTimer = setTimeout(()=>runNextQuestion(questions, index+1), waitMs);
  } catch(e) { console.error('runNextQuestion error',e); }
}

async function endQuizSession() {
  if (!QSid) return;
  if (!confirm('End the quiz now and show results to all participants?')) return;
  clearTimeout(QAutoTimer);
  try {
    // End any active question
    const activeQ = QQuestions.find(q=>q.status==='active');
    if (activeQ) await db.collection('quiz_questions').doc(activeQ.id).update({status:'ended',endedAt:firebase.firestore.FieldValue.serverTimestamp()});
    await db.collection('quiz_sessions').doc(QSid).update({status:'ended',endedAt:firebase.firestore.FieldValue.serverTimestamp()});
    document.getElementById('qz-auto-status').textContent='Quiz ended by admin.';
    document.getElementById('qz-status-label').textContent='Ended';
    if (QPartUnsub) { QPartUnsub(); QPartUnsub=null; }
    if (QFlagUnsub) { QFlagUnsub(); QFlagUnsub=null; }
    await logActivity('quiz','Ended quiz session manually');
    showToast('Quiz ended. Results shown to participants.','success');
    loadLiveScores();
    // Reset for next session after 5s
    setTimeout(()=>{
      QSid=null; QQuestions=[];
      document.getElementById('qz-create-area').style.display='block';
      document.getElementById('qz-session-banner').style.display='none';
      document.getElementById('qz-addq-card').style.display='none';
      document.getElementById('qz-host-card').style.display='none';
      document.getElementById('qz-scores-card').style.display='none';
      document.getElementById('qz-title').value='';
    },5000);
  } catch(e) { handleFirebaseError(e,'endQuizSession'); }
}

async function deleteQuizSession() {
  if (!QSid) return;
  if (!confirm('Delete this entire quiz session and all its questions?')) return;
  try {
    clearTimeout(QAutoTimer);
    if (QPartUnsub){QPartUnsub();QPartUnsub=null;}
    if (QFlagUnsub){QFlagUnsub();QFlagUnsub=null;}
    const batch = db.batch();
    batch.delete(db.collection('quiz_sessions').doc(QSid));
    QQuestions.forEach(q=>batch.delete(db.collection('quiz_questions').doc(q.id)));
    await batch.commit();
    QSid=null; QQuestions=[];
    document.getElementById('qz-create-area').style.display='block';
    document.getElementById('qz-session-banner').style.display='none';
    document.getElementById('qz-addq-card').style.display='none';
    document.getElementById('qz-host-card').style.display='none';
    document.getElementById('qz-scores-card').style.display='none';
    document.getElementById('qz-title').value='';
    document.getElementById('qz-q-count').textContent='0';
    await logActivity('quiz','Deleted quiz session');
    showToast('Session deleted.','info');
  } catch(e) { showToast('Error deleting session.','error'); }
}

// ── SCORES ───────────────────────────────────────────────────────────────────
async function loadLiveScores() {
  if (!QSid) return;
  try {
    const snap = await db.collection('quiz_participants').where('sessionId','==',QSid).where('status','!=','banned').get();
    const el = document.getElementById('qz-scores-list');
    if (snap.empty) { el.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted)">No participants yet.</div>'; return; }
    const sorted = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.score||0)-(a.score||0));
    el.innerHTML = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
      +'<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1)">'
      +'<th style="padding:8px 12px;text-align:left;color:var(--muted)">#</th>'
      +'<th style="padding:8px 12px;text-align:left;color:var(--muted)">Name</th>'
      +'<th style="padding:8px 12px;text-align:center;color:var(--muted)">Score</th>'
      +'<th style="padding:8px 12px;text-align:center;color:var(--muted)">Tab Sw.</th>'
      +'<th style="padding:8px 12px;text-align:center;color:var(--muted)">Status</th>'
      +'<th style="padding:8px 12px;text-align:center;color:var(--muted)">Actions</th>'
      +'</tr></thead><tbody>'
      +sorted.map((p,i)=>{
        const sc=statusColor(p.status); const tc=(p.tabSwitches||0)>1?'#e63946':(p.tabSwitches||0)>0?'#f5c842':'#27ae60';
        return '<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">'
          +'<td style="padding:8px 12px;color:var(--muted)">'+(i===0?'&#127947;':i===1?'&#129352;':i===2?'&#129353;':(i+1))+'</td>'
          +'<td style="padding:8px 12px;color:#fff;font-weight:600">'+p.name+'</td>'
          +'<td style="padding:8px 12px;text-align:center;color:#e63946;font-weight:800">'+(p.score||0)+'</td>'
          +'<td style="padding:8px 12px;text-align:center;color:'+tc+';font-weight:700">'+(p.tabSwitches||0)+'</td>'
          +'<td style="padding:8px 12px;text-align:center"><span style="color:'+sc+';font-size:11px;font-weight:700;text-transform:uppercase">'+(p.status||'active')+'</span></td>'
          +'<td style="padding:8px 12px;text-align:center;display:flex;gap:5px;justify-content:center">'
          +(p.status!=='warned'&&p.status!=='banned'?'<button onclick="warnParticipant(\''+p.id+'\',\''+p.name.replace(/\'/g,"\\'")+'\')" style="font-size:11px;padding:4px 8px;background:rgba(245,200,66,0.1);border:1px solid rgba(245,200,66,0.25);border-radius:6px;color:#f5c842;cursor:pointer">&#9888;</button>':'')
          +(p.status!=='banned'?'<button onclick="banParticipant(\''+p.id+'\',\''+p.name.replace(/\'/g,"\\'")+'\')" style="font-size:11px;padding:4px 8px;background:rgba(230,57,70,0.1);border:1px solid rgba(230,57,70,0.25);border-radius:6px;color:#e63946;cursor:pointer">&#128683;</button>':'<span style="font-size:11px;color:var(--muted)">Removed</span>')
          +'</td></tr>';
      }).join('')+'</tbody></table></div>';
  } catch(e) { console.error('loadLiveScores',e); }
}

function statusColor(s){ return s==='banned'?'#e63946':s==='warned'?'#f5c842':s==='admitted'||s==='active'?'#27ae60':'#aaa'; }

// ── FLAGS ────────────────────────────────────────────────────────────────────
function startFlagListener() {
  if (!QSid || QFlagUnsub) return;
  QFlagUnsub = db.collection('quiz_flags').where('sessionId','==',QSid)
    .orderBy('flaggedAt','desc').limit(60)
    .onSnapshot(snap=>{
      const unseen = snap.docs.filter(d=>!d.data().seen).length;
      document.getElementById('qz-flag-count').textContent = unseen;
      const el = document.getElementById('qz-flags-list');
      if (snap.empty){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted)">No flags. </div>';return;}
      const icons={tab_switch:'&#128260;',window_blur:'&#128065;',devtools:'&#128421;',auto_ban:'&#128683;',page_close:'&#128682;'};
      const colors={tab_switch:'#f5c842',window_blur:'#f5c842',devtools:'#e63946',auto_ban:'#e63946',page_close:'#e63946'};
      el.innerHTML=snap.docs.map(doc=>{
        const d=doc.data(),ts=d.flaggedAt?d.flaggedAt.toDate():new Date();
        const time=ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)'+(d.seen?';opacity:.4':'') +'">'
          +'<div style="font-size:16px;flex-shrink:0">'+(icons[d.type]||'&#9888;')+'</div>'
          +'<div style="flex:1"><div style="font-size:13px;color:#fff">'+(d.message||'Flag')+'</div>'
          +'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+time+' &middot; <span style="color:'+(colors[d.type]||'#f5c842')+';font-weight:700;text-transform:uppercase">'+(d.type||'')+'</span></div></div>'
          +'<div style="display:flex;gap:5px;flex-shrink:0">'
          +'<button onclick="warnParticipant(\''+d.participantId+'\',\''+d.participantName.replace(/\'/g,"\\'")+'\')" style="font-size:11px;padding:3px 8px;background:rgba(245,200,66,0.1);border:1px solid rgba(245,200,66,0.2);border-radius:6px;color:#f5c842;cursor:pointer">Warn</button>'
          +'<button onclick="banParticipant(\''+d.participantId+'\',\''+d.participantName.replace(/\'/g,"\\'")+'\')" style="font-size:11px;padding:3px 8px;background:rgba(230,57,70,0.1);border:1px solid rgba(230,57,70,0.2);border-radius:6px;color:#e63946;cursor:pointer">Remove</button>'
          +(d.seen?'':'<button onclick="markFlagSeen(\''+doc.id+'\',this)" style="font-size:11px;padding:3px 7px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--muted);cursor:pointer">&#10003;</button>')
          +'</div></div>';
      }).join('');
    });
}

async function loadQuizFlags() { startFlagListener(); }

async function markFlagSeen(fid,btn){
  try{await db.collection('quiz_flags').doc(fid).update({seen:true});btn.closest('div[style*="border-bottom"]').style.opacity='0.4';}catch(e){}
}

// Aliases for backward compatibility
async function checkQuizStatus(){}


async function logActivity(action, details) {
  if (!currentUser || !db) return;
  try {
    await db.collection("activity_logs").add({
      action,
      details,
      adminEmail: currentUser.email,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { /* silent fail */ }
}

async function loadActivityLog() {
  const container = document.getElementById("activity-log-list");
  if (!container) return;
  container.innerHTML = `<div class="hint-text" style="padding:20px">Loading...</div>`;
  const filter = document.getElementById("activity-filter") ? document.getElementById("activity-filter").value : "";
  try {
    const snap = await db.collection("activity_logs").orderBy("timestamp", "desc").limit(100).get();
    let docs = snap.docs;
    if (filter) docs = docs.filter(d => d.data().action === filter);
    if (docs.length === 0) {
      container.innerHTML = `<div class="hint-text" style="text-align:center;padding:40px">No activity recorded yet.</div>`;
      return;
    }
    const icons = {
      "event":"📅","gallery":"📷","achievement":"🏆","member":"🧑‍🤝‍🧑",
      "faculty":"👨‍🏫","announcement":"📢","resource":"📚","project":"💡",
      "alumni":"🎓","blog":"✍️","certificate":"🛡️","placement":"💼",
      "sponsor":"🤝","admin":"👥","quiz":"⚡","login":"🔐"
    };
    container.innerHTML = docs.map(doc => {
      const d = doc.data();
      const ts = d.timestamp ? d.timestamp.toDate() : new Date();
      const date = ts.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
      const time = ts.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
      const icon = icons[d.action] || "📝";
      return `
        <div class="activity-item">
          <div class="activity-icon">${icon}</div>
          <div class="activity-body">
            <div class="activity-detail">${d.details}</div>
            <div class="activity-meta">
              <span class="activity-badge">${d.action}</span>
              <span>${d.adminEmail}</span>
              <span>${date} at ${time}</span>
            </div>
          </div>
        </div>`;
    }).join("");
  } catch (e) {
    container.innerHTML = `<div class="hint-text" style="color:red;padding:20px">Failed to load activity log.</div>`;
  }
}

async function clearActivityLog() {
  if (!isPermanentAdmin) return showToast("Only permanent admin can clear logs.", "error");
  if (!confirm("Delete all activity logs? This cannot be undone.")) return;
  try {
    const snap = await db.collection("activity_logs").get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    showToast("Activity log cleared.", "info");
    loadActivityLog();
  } catch(e) { showToast("Error clearing log.", "error"); }
}
