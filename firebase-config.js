// ============================================================
// FIREBASE CONFIGURATION
// Replace the values below with your own Firebase project config.
// Steps:
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or use an existing one)
// 3. Click "Web" to add a web app → copy the config object here
// 4. Enable Authentication > Sign-in Method > Email/Password
// 5. Enable Firestore Database (start in test mode)
// 6. Enable Storage (start in test mode)
// ============================================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Permanent admin credentials (do not change)
const PERMANENT_ADMIN_EMAIL = "battawilson7@gmail.com";

export { firebaseConfig, PERMANENT_ADMIN_EMAIL };
