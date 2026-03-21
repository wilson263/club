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
  registrations: "Event Registrations"
};

function showPanel(name) {
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
  if (name === "announcements") loadAnnouncements();
  if (name === "resources")     loadResources();
  if (name === "projects")      loadProjects();
  if (name === "contacts")      loadContacts();
  if (name === "registrations") { loadRegistrationEvents(); loadRegistrations(); }
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

// ─── HOME IMAGES ──────────────────────────────────
async function uploadHomeImages(files) {
  if (!files.length) return;
  const wrapper = document.getElementById("home-progress-wrapper");
  const fill    = document.getElementById("home-progress-fill");
  wrapper.style.display = "block";
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ref  = storage.ref(`home_images/${Date.now()}_${file.name}`);
    const task = ref.put(file);
    await new Promise((resolve, reject) => {
      task.on("state_changed",
        snap => { fill.style.width = (snap.bytesTransferred / snap.totalBytes * 100) + "%"; },
        reject,
        async () => {
          const url = await ref.getDownloadURL();
          await db.collection("home_images").add({ url, uploadedBy: currentUser.email, uploadedAt: firebase.firestore.FieldValue.serverTimestamp() });
          resolve();
        }
      );
    });
  }
  wrapper.style.display = "none"; fill.style.width = "0%";
  showToast(`${files.length} image(s) uploaded!`, "success");
  loadHomeImages();
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
      const ref  = storage.ref(`event_images/${Date.now()}_${file.name}`);
      const task = ref.put(file);
      await new Promise((resolve, reject) => {
        task.on("state_changed",
          snap => { fill.style.width = (snap.bytesTransferred / snap.totalBytes * 100) + "%"; },
          reject,
          async () => { imageUrl = await ref.getDownloadURL(); resolve(); }
        );
      });
    }
    await db.collection("events").add({ title, type, date, venue, desc, imageUrl, addedBy: currentUser.email, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast("Event added!", "success");
    ["evt-title","evt-date","evt-venue","evt-desc"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("evt-image-input").value = "";
    document.getElementById("evt-preview-area").innerHTML = `<div style="font-size:28px">🖼️</div><div style="font-size:14px">Click to select image</div>`;
    loadEvents();
  } catch(e) { showToast("Error: " + e.message, "error"); }
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
    showToast("Event deleted", "info"); loadEvents();
  } catch(e) { showToast("Error deleting event", "error"); }
}

// ─── GALLERY IMAGES ───────────────────────────────
async function uploadGalleryImages(files) {
  if (!files.length) return;
  const wrapper = document.getElementById("gallery-progress-wrapper");
  const fill    = document.getElementById("gallery-progress-fill");
  wrapper.style.display = "block";
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ref  = storage.ref(`gallery_images/${Date.now()}_${file.name}`);
    const task = ref.put(file);
    await new Promise((resolve, reject) => {
      task.on("state_changed",
        snap => { fill.style.width = (snap.bytesTransferred / snap.totalBytes * 100) + "%"; },
        reject,
        async () => {
          const url = await ref.getDownloadURL();
          await db.collection("gallery_images").add({ url, uploadedBy: currentUser.email, uploadedAt: firebase.firestore.FieldValue.serverTimestamp() });
          resolve();
        }
      );
    });
  }
  wrapper.style.display = "none"; fill.style.width = "0%";
  showToast(`${files.length} photo(s) uploaded!`, "success");
  loadGalleryImages();
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
    if (id) { await db.collection("achievements").doc(id).update(data); showToast("Achievement updated!", "success"); }
    else { data.addedBy = currentUser.email; data.addedAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection("achievements").add(data); showToast("Achievement added!", "success"); }
    closeAchievementModal(); loadAchievements(); loadStats();
  } catch(e) { showToast("Error saving achievement: " + e.message, "error"); }
}

async function deleteAchievement(docId) {
  if (!confirm("Delete this achievement?")) return;
  try {
    await db.collection("achievements").doc(docId).delete();
    showToast("Achievement deleted", "info"); loadAchievements(); loadStats();
  } catch(e) { showToast("Error deleting achievement", "error"); }
}

// ─── CLUB MEMBERS ─────────────────────────────────
async function loadMembers() {
  const grid = document.getElementById("member-admin-grid");
  grid.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted);grid-column:1/-1">⏳ Loading...</div>';
  try {
    const snap = await db.collection("club_members").orderBy("order").get();
    if (snap.empty) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">🧑‍🤝‍🧑</div><p>No members yet. Click "Add Member" to add one.</p></div>';
      return;
    }
    grid.innerHTML = "";
    snap.forEach(doc => {
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
      const ref  = storage.ref(`member_photos/${Date.now()}_${file.name}`);
      const task = ref.put(file);
      await new Promise((resolve, reject) => {
        task.on("state_changed",
          snap => { fill.style.width = (snap.bytesTransferred / snap.totalBytes * 100) + "%"; },
          reject,
          async () => { photoUrl = await ref.getDownloadURL(); resolve(); }
        );
      });
    }

    const data = { name, year, role, phone, order, photoUrl, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

    if (id) {
      await db.collection("club_members").doc(id).update(data);
      showToast("Member updated!", "success");
    } else {
      data.addedBy = currentUser.email;
      data.addedAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("club_members").add(data);
      showToast("Member added!", "success");
    }
    closeMemberModal();
    loadMembers();
    loadStats();
  } catch(e) { showToast("Error saving member: " + e.message, "error"); console.error(e); }

  wrapper.style.display = "none"; fill.style.width = "0%";
}

async function deleteMember(docId, photoUrl) {
  if (!confirm("Delete this member?")) return;
  try {
    await db.collection("club_members").doc(docId).delete();
    if (photoUrl) await storage.refFromURL(photoUrl).delete().catch(() => {});
    showToast("Member deleted", "info"); loadMembers(); loadStats();
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
    const snap = await db.collection("faculty_members").orderBy("order").get();
    if (snap.empty) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">👨‍🏫</div><p>No faculty yet. Click "Add Faculty" to add one.</p></div>';
      return;
    }
    grid.innerHTML = "";
    snap.forEach(doc => {
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
      const ref  = storage.ref(`faculty_photos/${Date.now()}_${file.name}`);
      const task = ref.put(file);
      await new Promise((resolve, reject) => {
        task.on("state_changed",
          snap => { fill.style.width = (snap.bytesTransferred / snap.totalBytes * 100) + "%"; },
          reject,
          async () => { photoUrl = await ref.getDownloadURL(); resolve(); }
        );
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
  } catch(e) { showToast("Error saving faculty: " + e.message, "error"); console.error(e); }

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
    const snap = await db.collection("announcements").orderBy("order").get();
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
  } catch(e) { list.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><p>Error loading announcements</p></div>'; }
}

async function addAnnouncement() {
  const text = document.getElementById("ann-text").value.trim();
  if (!text) { showToast("Please enter announcement text", "error"); return; }
  try {
    const snap = await db.collection("announcements").orderBy("order", "desc").limit(1).get();
    const maxOrder = snap.empty ? 0 : (snap.docs[0].data().order || 0);
    await db.collection("announcements").add({ text, order: maxOrder + 1, addedBy: currentUser.email, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById("ann-text").value = "";
    showToast("Announcement added!", "success");
    loadAnnouncements();
  } catch(e) { showToast("Error: " + e.message, "error"); }
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
  } catch(e) { showToast("Error saving resource: " + e.message, "error"); }
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
  } catch(e) { showToast("Error saving project: " + e.message, "error"); }
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
    const snap = await db.collection("events").where("type", "==", "upcoming").orderBy("addedAt", "desc").get();
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
    if (eventId !== "all") query = db.collection("registrations").where("eventId", "==", eventId).orderBy("registeredAt", "desc");
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
              <th style="padding:10px 12px;text-align:left;color:#aaa;font-weight:600">Action</th>
            </tr>
          </thead>
          <tbody>
            ${snap.docs.map((doc, i) => {
              const d = doc.data();
              return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
                <td style="padding:10px 12px;color:#aaa">${i+1}</td>
                <td style="padding:10px 12px;font-weight:600">${d.name || "—"}</td>
                <td style="padding:10px 12px;color:#aaa">${d.email || "—"}</td>
                <td style="padding:10px 12px;color:#aaa">${d.phone || "—"}</td>
                <td style="padding:10px 12px;color:#aaa">${d.yearDept || "—"}</td>
                <td style="padding:10px 12px;color:#aaa">${d.eventTitle || d.eventId || "—"}</td>
                <td style="padding:10px 12px"><button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="deleteRegistration('${doc.id}')">🗑</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch(e) { list.innerHTML = '<div class="empty-state"><div class="es-icon">⚠️</div><p>Error loading registrations. Ensure Firestore indexes are set up.</p></div>'; console.error(e); }
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
