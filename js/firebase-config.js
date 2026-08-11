// =====================================================
// FIREBASE CONFIGURATION — bracket-c1974
// =====================================================

const firebaseConfig = {
  apiKey:            "AIzaSyA3DjtMFyMWgJfS4G_UWuc9_eZXeNSDIT0",
  authDomain:        "bracket-c1974.firebaseapp.com",
  // ⚠️ PENTING: Cek URL Realtime Database kamu di:
  // Firebase Console → Realtime Database → tab Data
  // URL biasanya: https://bracket-c1974-default-rtdb.firebaseio.com
  // Atau versi Asia: https://bracket-c1974-default-rtdb.asia-southeast1.firebasedatabase.app
  databaseURL:       "https://bracket-c1974-default-rtdb.firebaseio.com",
  projectId:         "bracket-c1974",
  storageBucket:     "bracket-c1974.firebasestorage.app",
  messagingSenderId: "362401290877",
  appId:             "1:362401290877:web:e3c3f8687803c63531ef14",
  measurementId:     "G-KYS284DT9Z"
};

// Initialize Firebase (menggunakan compat SDK via CDN)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Root path di database
const ROOT = 'tournament';

