// ──────────────────────────────────────────────────
// Neural Nexus Admin Panel — admin.js
// ──────────────────────────────────────────────────

const PERMANENT_ADMIN_EMAIL = "battawilson7@gmail.com";
const PERMANENT_ADMIN_PASSWORD = "John@1982";
const MAX_TEMP_ADMINS = 3;

// ─── FIREBASE CONFIG ─────────────────────────────
// Paste your Firebase project config here
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

// Always show login first — Firebase check only happens on login attempt
if (isConfigured) {
  firebase.initializeApp(firebaseConfig);
  auth    = firebase.auth();
  db      = firebase.firestore();
  storage = firebase.storage();

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      await loadCurrentUser(user);
      showDashboard();
    } else {
      currentUser = null;
      showLogin();
    }
  });
} else {
  // Show login page with a config banner — don't replace page
  showLogin();
  document.getElementById("config-banner").style.display = "flex";
}

// ─── AUTH ─────────────────────────────────────────
async function doLogin() {
  if (!isConfigured) {
    showLoginError("Firebase is not configured yet. Please fill in the Firebase config in admin.js.");
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
    // First-time setup: auto-create the permanent admin account
    if ((err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") &&
        email === PERMANENT_ADMIN_EMAIL && password === PERMANENT_ADMIN_PASSWORD) {
      try {
        btn.innerHTML = '<span class="spin">⟳</span> Setting up account...';
        await auth.createUserWithEmailAndPassword(email, password);
        return;
      } catch (createErr) {
        showLoginError("Could not create admin account: " + createErr.message);
        btn.innerHTML = '🔐 Sign In';
        btn.disabled = false;
        return;
      }
    }

    let msg = "Invalid email or password.";
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential")
      msg = "No admin account found with this email.";
    if (err.code === "auth/wrong-password")
      msg = "Incorrect password.";
    if (err.code === "auth/too-many-requests")
      msg = "Too many attempts. Please try again later.";

    showLoginError(msg);
    btn.innerHTML = '🔐 Sign In';
    btn.disabled = false;
  }
}

async function doLogout() {
  await auth.signOut();
  showToast("Logged out successfully", "info");
}

function showLoginError(msg) {
  const el = document.getElementById("login-error");
  el.style.display = "flex";
  document.getElementById("login-error-msg").textContent = msg;
}

function hideLoginError() {
  document.getElementById("login-error").style.display = "none";
}

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

// ─── LOAD USER ─────────────────────────────────────
async function loadCurrentUser(user) {
  try {
    const doc = await db.collection("admins").doc(user.uid).get();
    if (doc.exists) {
      isPermanentAdmin = doc.data().isPermanent === true;
    } else if (user.email === PERMANENT_ADMIN_EMAIL) {
      isPermanentAdmin = true;
      await db.collection("admins").doc(user.uid).set({
        email: user.email,
        name: "Super Admin",
        isPermanent: true,
        addedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    const initial = (user.email || "A")[0].toUpperCase();
    document.getElementById("sidebar-avatar").textContent = initial;
    document.getElementById("sidebar-name").textContent = user.email || "Admin";
    document.getElementById("sidebar-role").textContent = isPermanentAdmin ? "Permanent Admin" : "Temp Admin";

    if (isPermanentAdmin) {
      document.getElementById("admin-mgmt-label").style.display = "block";
      document.getElementById("admin-mgmt-btn").style.display = "flex";
      document.getElementById("guide-admin").style.display = "flex";
    }
  } catch (e) { console.error("Error loading user:", e); }
}

// ─── PANEL SWITCHING ──────────────────────────────
const panelTitles = {
  overview: "Dashboard",
  "home-images": "Home Page Images",
  events: "Events",
  gallery: "Photo Gallery",
  admins: "Admin Accounts"
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

  if (name === "home-images") loadHomeImages();
  if (name === "events")       loadEvents();
  if (name === "gallery")      loadGalleryImages();
  if (name === "admins")       loadAdmins();
  if (name === "overview")     loadStats();
}

// ─── STATS ────────────────────────────────────────
async function loadStats() {
  try {
    const [homeSnap, eventsSnap, gallerySnap, adminsSnap] = await Promise.all([
      db.collection("home_images").get(),
      db.collection("events").get(),
      db.collection("gallery_images").get(),
      db.collection("admins").get()
    ]);
    document.getElementById("stat-home-images").textContent = homeSnap.size;
    document.getElementById("stat-events").textContent      = eventsSnap.size;
    document.getElementById("stat-gallery").textContent     = gallerySnap.size;
    document.getElementById("stat-admins").textContent      = adminsSnap.size;
  } catch(e) { console.error(e); }
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
          await db.collection("home_images").add({
            url, uploadedBy: currentUser.email,
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          resolve();
        }
      );
    });
  }
  wrapper.style.display = "none";
  fill.style.width = "0%";
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
    snap.forEach(doc => {
      grid.appendChild(makeImageItem(doc.data().url, () => deleteHomeImage(doc.id, doc.data().url)));
    });
  } catch(e) { console.error(e); }
}

async function deleteHomeImage(docId, url) {
  if (!confirm("Delete this image?")) return;
  try {
    await db.collection("home_images").doc(docId).delete();
    await storage.refFromURL(url).delete().catch(() => {});
    showToast("Image deleted", "info");
    loadHomeImages();
  } catch(e) { showToast("Error deleting image", "error"); }
}

// ─── EVENTS ───────────────────────────────────────
function previewEventImage(input) {
  const file = input.files[0];
  if (!file) return;
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
    await db.collection("events").add({
      title, type, date, venue, desc, imageUrl,
      addedBy: currentUser.email,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("Event added!", "success");
    ["evt-title","evt-date","evt-venue","evt-desc"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("evt-image-input").value = "";
    document.getElementById("evt-preview-area").innerHTML = `<div style="font-size:28px">🖼️</div><div style="font-size:14px">Click to select image</div>`;
    loadEvents();
  } catch(e) { showToast("Error: " + e.message, "error"); }

  wrapper.style.display = "none";
  fill.style.width = "0%";
}

let currentEventFilter = "all";

async function loadEvents() {
  const list = document.getElementById("events-list");
  list.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa">Loading...</div>';
  try {
    const snap = await db.collection("events").orderBy("addedAt", "desc").get();
    allEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEventList(currentEventFilter);
  } catch(e) {
    list.innerHTML = `<div class="empty-state">⚠️<p>Error loading events</p></div>`;
  }
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
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">📅<p>No events yet</p></div>';
    return;
  }
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
        <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:100px;background:${ev.type==='conducted'?'rgba(39,174,96,0.2)':'rgba(41,128,185,0.2)'};color:${ev.type==='conducted'?'#27ae60':'#5dade2'}">${ev.type==='conducted'?'Conducted':'Upcoming'}</span>
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
    showToast("Event deleted", "info");
    loadEvents();
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
          await db.collection("gallery_images").add({
            url, uploadedBy: currentUser.email,
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          resolve();
        }
      );
    });
  }
  wrapper.style.display = "none";
  fill.style.width = "0%";
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
    snap.forEach(doc => {
      grid.appendChild(makeImageItem(doc.data().url, () => deleteGalleryImage(doc.id, doc.data().url)));
    });
  } catch(e) { console.error(e); }
}

async function deleteGalleryImage(docId, url) {
  if (!confirm("Delete this photo?")) return;
  try {
    await db.collection("gallery_images").doc(docId).delete();
    await storage.refFromURL(url).delete().catch(() => {});
    showToast("Photo deleted", "info");
    loadGalleryImages();
  } catch(e) { showToast("Error deleting photo", "error"); }
}

// ─── ADMIN MANAGEMENT ─────────────────────────────
async function loadAdmins() {
  if (!isPermanentAdmin) return;
  const list = document.getElementById("admin-list");
  const limitMsg = document.getElementById("admin-limit-msg");
  list.innerHTML = "";

  try {
    const snap = await db.collection("admins").get();
    const admins = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const tempCount = admins.filter(a => !a.isPermanent).length;
    limitMsg.style.display = tempCount >= MAX_TEMP_ADMINS ? "block" : "none";

    if (!admins.length) {
      list.innerHTML = '<div class="empty-state">👤<p>No admins found</p></div>';
      return;
    }

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
  } catch(e) {
    list.innerHTML = '<div class="empty-state">⚠️<p>Error loading admins</p></div>';
  }
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

    const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary_" + Date.now());
    const secondaryAuth = secondaryApp.auth();
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    const newUid = cred.user.uid;
    await secondaryAuth.signOut();
    secondaryApp.delete();

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
    showToast(e.code === "auth/email-already-in-use" ? "Email already registered." : "Error: " + e.message, "error");
  }
}

async function removeTempAdmin(docId, email) {
  if (!isPermanentAdmin) { showToast("Only the permanent admin can remove admins", "error"); return; }
  if (!confirm(`Remove admin: ${email}?`)) return;
  try {
    await db.collection("admins").doc(docId).delete();
    showToast(`Admin removed: ${email}`, "info");
    loadAdmins();
  } catch(e) { showToast("Error removing admin", "error"); }
}

// ─── HELPERS ──────────────────────────────────────
function makeImageItem(url, onDelete) {
  const item = document.createElement("div");
  item.className = "image-item";
  item.innerHTML = `
    <img src="${url}" loading="lazy" alt="image">
    <div class="overlay">
      <button class="delete-btn">🗑 Delete</button>
    </div>
  `;
  item.querySelector(".delete-btn").onclick = onDelete;
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
