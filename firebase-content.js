// firebase-content.js
// Loads dynamic content from Firebase for public pages.
// Replace firebaseConfig below with your actual Firebase config.

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
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

// Load home page gallery images
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

// Load events for gallery page
async function loadFirebaseEvents() {
  if (!db) return;

  try {
    const snap = await db.collection("events").orderBy("addedAt", "desc").get();
    if (snap.empty) return;

    const conducted = snap.docs.filter(d => d.data().type === "conducted").map(d => d.data());
    const upcoming  = snap.docs.filter(d => d.data().type === "upcoming").map(d => d.data());

    // Append to conducted events list
    const condList = document.getElementById("conducted-events-list");
    if (condList && conducted.length) {
      conducted.forEach(ev => {
        condList.insertAdjacentHTML("beforeend", makeEventCard(ev));
      });
    }

    // Append to upcoming events list
    const upList = document.getElementById("upcoming-events-list");
    if (upList && upcoming.length) {
      upcoming.forEach(ev => {
        upList.insertAdjacentHTML("beforeend", makeEventCard(ev));
      });
    }
  } catch(e) {
    console.warn("Could not load events:", e);
  }
}

// Load gallery images
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
          ${ev.venue ? `<p><i class="fa-solid fa-location-dot"></i> ${ev.venue}</p>` : ""}
          ${ev.desc  ? `<p>${ev.desc}</p>` : ""}
        </div>
      </div>
    </div>
  `;
}
