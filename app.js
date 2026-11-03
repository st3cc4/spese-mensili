import { 
    auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    onAuthStateChanged, signOut, collection, addDoc, getDocs, doc, 
    updateDoc, deleteDoc, setDoc, getDoc 
} from "./firebase-config.js";

let currentUser = null;
let categories = [];
let expenses = [];
let salaryData = { nextDate: "", base: 0, extra: 0, extraExpression: "" };

// Data di Oggi locale
const todayLocal = new Date();
const year = todayLocal.getFullYear();
const month = String(todayLocal.getMonth() + 1).padStart(2, '0');
const day = String(todayLocal.getDate()).padStart(2, '0');
const todayStr = `${year}-${month}-${day}`;

document.getElementById('expense-date').value = todayStr;

// Controllo Stato Autenticazione
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        await loadUserData();
    } else {
        currentUser = null;
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }
});

// Login / Registrazione
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        try {
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (err) {
            alert("Errore durante l'accesso: " + err.message);
        }
    }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// Caricamento Dati
async function loadUserData() {
    await loadSalary();
    await loadCategories();
    await loadExpenses();
    calculateDashboard();
}

// Gestione Stipendio e salvataggio automatico data
async function loadSalary() {
    try {
        const docRef = doc(db, "config", "impostazioni");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            salaryData.nextDate = data.dataProssimoStipendio || "";
            salaryData.base = parseFloat(data.stipendio || 0);
            salaryData.extraExpression = data.extraExpression || (data.extra !== undefined ? data.extra.toString() : "0");

            document.getElementById('salary-date').value = salaryData.nextDate;
            document.getElementById('modal-salary-base').value = salaryData.base;
            document.getElementById('modal-salary-extra').value = salaryData.extraExpression;
        }
    } catch (e) {
        console.log("Errore caricamento stipendio:", e);
    }
}

// Salvataggio automatico quando cambi la data direttamente in home
document.getElementById('salary-date').addEventListener('change', async () => {
    const nextDate = document.getElementById('salary-date').value;
    salaryData.nextDate = nextDate;

    const docRef = doc(db, "config", "impostazioni");
    const docSnap = await getDoc(docRef);
    let currentData = docSnap.exists() ? docSnap.data() : {};
    
    currentData.dataProssimoStipendio = nextDate;
    await setDoc(docRef, currentData);
    calculateDashboard();
});

// Gestione Apertura / Chiusura Modale Stipendio
const salaryModal = document.getElementById('salary-modal');
document.getElementById('open-salary-modal').addEventListener('click', () => {
    salaryModal.classList.remove('hidden');
});
document.getElementById('close-salary-modal').addEventListener('click', () => {
    salaryModal.classList.add('hidden');
});

// Salvataggio dati da dentro il pop-up
document.getElementById('save-salary-modal-btn').addEventListener('click', async () => {
    const base = parseFloat(document.getElementById('modal-salary-base').value) || 0;
    const extraInput = document.getElementById('modal-salary-extra').value.trim();

    let evaluatedExtra = 0;
    try {
        const sanitized = extraInput.replace(/[^0-9+\-.\s]/g, '');
        evaluatedExtra = sanitized ? eval(sanitized) : 0;
    } catch (err) {
        alert("Formato extra non valido. Controlla i valori inseriti.");
        return;
    }

    salaryData.base = base;
    salaryData.extra = evaluatedExtra;
    salaryData.extraExpression = extraInput;

    const docRef = doc(db, "config", "impostazioni");
    const docSnap = await getDoc(docRef);
    let currentData = docSnap.exists() ? docSnap.data() : {};
    
    currentData.stipendio = base;
    currentData.extra = evaluatedExtra;
    currentData.extraExpression = extraInput;

    await setDoc(docRef, currentData);
    salaryModal.classList.add('hidden');
    alert("Dati stipendio ed extra salvati!");
    calculateDashboard();
});

// Funzione di utilità per Capitalize
function capitalize(str) {
    if (!str) return "";
    str = str.trim();
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Gestione Categorie
async function loadCategories() {
    try {
        const docRef = doc(db, "config", "impostazioni");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().categorie) {
            let rawCategories = docSnap.data().categorie;
            let normalizedSet = new Set(rawCategories.map(c => capitalize(c)));
            categories = Array.from(normalizedSet).sort();
        } else {
            categories = [];
        }
        renderCategories();
    } catch (e) {
        console.error("Errore caricamento categorie:", e);
    }
}

function renderCategories(selectedCategory = "") {
    const select = document.getElementById('expense-category');
    select.innerHTML = '<option value="">Seleziona...</option>';

    categories.forEach((catName) => {
        const isSelected = catName === selectedCategory ? 'selected' : '';
        select.innerHTML += `<option value="${catName}" ${isSelected}>${catName}</option>`;
    });
}

// Aggiunta o Eliminazione Rapida Categoria
document.getElementById('quick-add-category-btn').addEventListener('click', async () => {
    const inputName = prompt("Inserisci il nome della nuova categoria (o scrivi una categoria esistente preceduta da '-' es. '-Sigarette' per eliminarla):");
    if (!inputName || !inputName.trim()) return;
    
    let trimmed = inputName.trim();

    if (trimmed.startsWith('-')) {
        let targetCat = capitalize(trimmed.substring(1));
        const index = categories.indexOf(targetCat);
        if (index > -1) {
            if (confirm(`Vuoi davvero eliminare la categoria "${targetCat}"?`)) {
                categories.splice(index, 1);
                await saveCategoriesToFirebase();
                renderCategories();
                alert(`Categoria "${targetCat}" eliminata.`);
            }
        } else {
            alert(`La categoria "${targetCat}" non è stata trovata.`);
        }
        return;
    }

    const formattedName = capitalize(trimmed);

    if (!categories.includes(formattedName)) {
        categories.push(formattedName);
        categories.sort();
        await saveCategoriesToFirebase();
        renderCategories(formattedName);
    } else {
        alert("Questa categoria esiste già!");
        document.getElementById('expense-category').value = formattedName;
    }
});

async function saveCategoriesToFirebase() {
    const docRef = doc(db, "config", "impostazioni");
    const docSnap = await getDoc(docRef);
    let currentData = docSnap.exists() ? docSnap.data() : {};
    currentData.categorie = categories;
    await setDoc(docRef, currentData);
}

// Gestione Spese
async function loadExpenses() {
    try {
        const q = collection(db, "spese");
        const querySnapshot = await getDocs(q);
        expenses = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            expenses.push({ 
                id: docSnap.id, 
                amount: parseFloat(data.importo || data.amount || 0),
                date: data.data || data.date,
                category: data.categoria || data.category 
            });
        });
        renderExpenses();
    } catch (e) {
        console.error("Errore caricamento spese:", e);
    }
}

function renderExpenses() {
    const list = document.getElementById('recent-expenses-list');
    list.innerHTML = '';

    const todayExpenses = expenses.filter(exp => exp.date === todayStr);

    if (todayExpenses.length === 0) {
        list.innerHTML = '<div style="font-size: 12px; color: #888; text-align: center; padding: 10px;">Nessuna spesa registrata oggi.</div>';
        return;
    }

    todayExpenses.forEach(exp => {
        list.innerHTML += `
            <div class="expense-item">
                <div class="item-info">
                    <span class="item-title">${exp.category}</span>
                    <span class="item-sub">${exp.date}</span>
                </div>
                <div class="item-actions">
                    <strong style="margin-right:8px;">€ ${exp.amount.toFixed(2)}</strong>
                    <button class="btn-edit" onclick="editExpense('${exp.id}')">✏️</button>
                    <button class="btn-danger" onclick="deleteExpense('${exp.id}')">🗑️</button>
                </div>
            </div>
        `;
    });
}

document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-expense-id').value;
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const date = document.getElementById('expense-date').value;
    const category = document.getElementById('expense-category').value;

    const data = { importo: amount, data: date, categoria: category, timestamp: new Date() };

    if (id) {
        await updateDoc(doc(db, "spese", id), data);
    } else {
        await addDoc(collection(db, "spese"), data);
    }

    resetForm();
    await loadExpenses();
    calculateDashboard();
});

window.editExpense = (id) => {
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;

    document.getElementById('edit-expense-id').value = exp.amount; // fix piccolo campo
    document.getElementById('edit-expense-id').value = exp.id;
    document.getElementById('expense-amount').value = exp.amount;
    document.getElementById('expense-date').value = exp.date;
    document.getElementById('expense-category').value = exp.category;

    document.getElementById('form-expense-title').innerText = "Modifica Spesa";
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
};

document.getElementById('cancel-edit-btn').addEventListener('click', resetForm);

function resetForm() {
    document.getElementById('edit-expense-id').value = '';
    document.getElementById('expense-form').reset();
    document.getElementById('expense-date').value = todayStr;

    document.getElementById('form-expense-title').innerText = "Aggiungi Nuova Spesa";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

window.deleteExpense = async (id) => {
    if (confirm("Vuoi cancellare questa spesa?")) {
        await deleteDoc(doc(db, "spese", id));
        await loadExpenses();
        calculateDashboard();
    }
};

// Calcoli Dashboard
function calculateDashboard() {
    const spentToday = expenses
        .filter(e => e.date === todayStr)
        .reduce((sum, e) => sum + e.amount, 0);
    document.getElementById('spent-today').innerText = `€ ${spentToday.toFixed(2)}`;

    if (!salaryData.nextDate) return;

    const nextSalary = new Date(salaryData.nextDate);
    nextSalary.setHours(0,0,0,0);

    const todayDateObj = new Date(year, month - 1, day);
    todayDateObj.setHours(0,0,0,0);

    const diffTime = nextSalary - todayDateObj;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    document.getElementById('days-left').innerText = diffDays > 0 ? diffDays : 0;

    const lastSalaryDate = new Date(nextSalary);
    lastSalaryDate.setMonth(lastSalaryDate.getMonth() - 1);

    const currentPeriodExpenses = expenses.filter(e => {
        const expDate = new Date(e.date);
        return expDate >= lastSalaryDate && expDate <= todayDateObj;
    }).reduce((sum, e) => sum + e.amount, 0);

    const totalSalary = (salaryData.base || 0) + (salaryData.extra || 0);
    const residue = totalSalary - currentPeriodExpenses;
    document.getElementById('salary-residue').innerText = `€ ${residue.toFixed(2)}`;

    const daysRemaining = diffDays > notDefined(diffDays) ? diffDays : (diffDays > 0 ? diffDays : 1);
    const dailyBudget = residue > 0 ? (residue / (diffDays > 0 ? diffDays : 1)) : 0;
    document.getElementById('daily-budget').innerText = `€ ${dailyBudget.toFixed(2)}`;
}

// Funzione di utilità per evitare errori se una variabile non è definita
function notDefined(v) {
    return typeof v === 'undefined';
}
