import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  initializeFirestore,
  getFirestore, 
  setLogLevel,
  collection, 
  getDocs, 
  getDoc, 
  addDoc, 
  setDoc,
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e",
  authDomain: "nuqtha-c0900.firebaseapp.com",
  projectId: "nuqtha-c0900",
  storageBucket: "nuqtha-c0900.firebasestorage.app",
  messagingSenderId: "902747954424",
  appId: "1:902747954424:web:af61e4fc48033b20e1",
  measurementId: "G-W383N5EMVT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Silence Firestore internal transient connection log messages
setLogLevel("silent");

// Initialize Firestore with experimentalForceLongPolling to eliminate the 10-second backend timeout in browser iframe & proxy environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export { 
  collection, 
  getDocs, 
  getDoc, 
  addDoc, 
  setDoc,
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot 
};
