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

// Gestione Stipendio
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
            document.getElementById('salary-base').value = salaryData.base;
            document.getElementById('salary-extra').value = salaryData.extraExpression;
        }
    } catch (e) {
        console.log("Errore caricamento stipendio:", e);
    }
}

document.getElementById('save-salary-btn').addEventListener('click', async () => {
    const nextDate = document.getElementById('salary-date').value;
    const base = parseFloat(document.getElementById('salary-base').value) || 0;
    const extraInput = document.getElementById('salary-extra').value.trim();

    let evaluatedExtra = 0;
    try {
        const sanitized = extraInput.replace(/[^0-9+\-.\s]/g, '');
        evaluatedExtra = sanitized ? eval(sanitized) : 0;
    } catch (err) {
        alert("Formato extra non valido. Controlla i valori inseriti.");
        return;
    }

    salaryData = { 
        nextDate, 
        base, 
        extra: evaluatedExtra, 
        extraExpression: extraInput 
    };

    const docRef = doc(db, "config", "impostazioni");
    const docSnap = await getDoc(docRef);
    let currentData = docSnap.exists() ? docSnap.data() : {};
    
    currentData.dataProssimoStipendio = nextDate;
    currentData.stipendio = base;
    currentData.extra = evaluatedExtra;
    currentData.extraExpression = extraInput;

    await setDoc(docRef, currentData);
    alert("Dati stipendio salvati!");
    calculateDashboard();
});

// Gestione Categorie
async function loadCategories() {
    try {
        const docRef = doc(db, "config", "impostazioni");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().categorie) {
            categories = docSnap.data().categorie;
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

// Aggiunta Rapida Categoria con Pulsante Arancione +
document.getElementById('quick-add-category-btn').addEventListener('click', async () => {
    const name = prompt("Inserisci il nome della nuova categoria:");
    if (!name || !name.trim()) return;
    
    const trimmedName = name.trim();

    if (!categories.includes(trimmedName)) {
        categories.push(trimmedName);
        categories.sort();
        
        const docRef = doc(db, "config", "impostazioni");
        const docSnap = await getDoc(docRef);
        let currentData = docSnap.exists() ? docSnap.data() : {};
        currentData.categorie = categories;
        
        await setDoc(docRef, currentData);
        renderCategories(trimmedName);
    } else {
        alert("Questa categoria esiste già!");
        document.getElementById('expense-category').value = trimmedName;
    }
});

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

    // Filtriamo solo le spese che hanno la data uguale a oggi
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

    const daysRemaining = diffDays > 0 ? diffDays : 1;
    const dailyBudget = residue > 0 ? (residue / daysRemaining) : 0;
    document.getElementById('daily-budget').innerText = `€ ${dailyBudget.toFixed(2)}`;
}
