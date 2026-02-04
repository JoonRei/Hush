// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // <--- 1. IMPORT THIS

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAFNPjZlxS7V6ukuRdcSCOcVCyNEwR9LC0",
  authDomain: "hush-app-3fd49.firebaseapp.com",
  projectId: "hush-app-3fd49",
  storageBucket: "hush-app-3fd49.firebasestorage.app",
  messagingSenderId: "935965128005",
  appId: "1:935965128005:web:ef0b7dd54c523df7e5ba2c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 2. EXPORT THE DATABASE (Crucial!)
export const db = getFirestore(app);