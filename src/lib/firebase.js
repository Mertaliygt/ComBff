// src/lib/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBlt17y-JckKVV1dDMOx6-3nP65dT6yKRA",
    authDomain: "combff-52df7.firebaseapp.com",
    projectId: "combff-52df7",
    storageBucket: "combff-52df7.firebasestorage.app",
    messagingSenderId: "715897785866",
    appId: "1:715897785866:web:b59a5ce80e23995c2319f3",
    measurementId: "G-17R7YLT3NT"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
