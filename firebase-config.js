import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    setPersistence,
    browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    setDoc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAXvgC2P16ScZb5SCynIY2LF7oqbGbSRWo",
    authDomain: "spese-mensili-58c04.firebaseapp.com",
    databaseURL: "https://spese-mensili-58c04-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "spese-mensili-58c04",
    storageBucket: "spese-mensili-58c04.firebasestorage.app",
    messagingSenderId: "835516006997",
    appId: "1:835516006997:web:7a74ff965ab4cd59d88adc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Mantiene il login salvato per i successivi accessi
setPersistence(auth, browserLocalPersistence);

export { 
    auth, 
    db, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    setDoc, 
    getDoc 
};
