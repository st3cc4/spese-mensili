import { 
    auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    onAuthStateChanged, signOut, collection, addDoc, getDocs, doc, 
    updateDoc, deleteDoc, query, where, setDoc, getDoc 
} from "./firebase-config.js";

let currentUser = null;
let categories = [];
let expenses = [];
let salaryData = { nextDate: "", base: 0, extra: 0 };

// Inizializzazione della Data di Oggi per l'Input Spesa
document.getElementById('expense-date').valueAsDate = new Date();

// Controllo Stato Autenticazione (Login Persistente)
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

// Evento Login / Registrazione
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

// Caricamento Dati Utente
async function loadUserData() {
    await loadSalary();
    await loadCategories();
    await loadExpenses();
    calculateDashboard();
}

// Gestione Stipendio
async function loadSalary() {
    const docRef = doc(db, "users", currentUser.uid, "settings", "salary");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        salaryData = docSnap.data();
        document.getElementById('salary-date').value = salaryData.nextDate || "";
        document.getElementById('salary-base').value = salaryData.base || 0;
        document.getElementById('salary-extra').value = salaryData.extra || 0;
    }
}

document.getElementById('save-salary-btn').addEventListener('click', async () => {
    salaryData = {
        nextDate: document.getElementById('salary-date').value,
        base: parseFloat(document.getElementById('salary-base').value) || 0,
        extra: parseFloat(document.getElementById('salary-extra').value) || 0
    };

    const docRef = doc(db, "users", currentUser.uid, "settings", "salary");
    await setDoc(docRef, salaryData);
    alert("Dati stipendio salvati!");
    calculateDashboard();
});

// Gestione Categorie
async function loadCategories() {
    const q = collection(db, "users", currentUser.uid, "categories");
    const querySnapshot = await getDocs(q);
    categories = [];
    querySnapshot.forEach((doc) => {
        categories.push({ id: doc.id, ...doc.data() });
    });
    renderCategories();
}

function renderCategories() {
    const select = document.getElementById('expense-category');
    const list = document.getElementById('categories-list');
    
    select.innerHTML = '<option value="">Seleziona...</option>';
    list.innerHTML = '';

    categories.forEach(cat => {
        select.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
        list.innerHTML += `
            <div class="category-item">
                <span class="item-title">${cat.name}</span>
                <button class="btn-danger" onclick="deleteCategory('${cat.id}')">Elimina</button>
            </div>
        `;
    });
}

document.getElementById('add-category-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-category-name');
    const name = input.value.trim();
    if (!name) return;

    await addDoc(collection(db, "users", currentUser.uid, "categories"), { name });
    input.value = '';
    await loadCategories();
});

window.deleteCategory = async (id) => {
    if (confirm("Vuoi cancellare questa categoria?")) {
        await deleteDoc(doc(db, "users", currentUser.uid, "categories", id));
        await loadCategories();
    }
};

// Gestione Spese
async function loadExpenses() {
    const q = collection(db, "users", currentUser.uid, "expenses");
    const querySnapshot = await getDocs(q);
    expenses = [];
    querySnapshot.forEach((doc) => {
        expenses.push({ id: doc.id, ...doc.data() });
    });
    renderExpenses();
}

function renderExpenses() {
    const list = document.getElementById('recent-expenses-list');
    list.innerHTML = '';

    const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    sorted.forEach(exp => {
        list.innerHTML += `
            <div class="expense-item">
                <div class="item-info">
                    <span class="item-title">${exp.category}</span>
                    <span class="item-sub">${exp.date}</span>
                </div>
                <div class="item-actions">
                    <strong style="margin-right:8px;">€ ${parseFloat(exp.amount).toFixed(2)}</strong>
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

    const data = { amount, date, category };

    if (id) {
        await updateDoc(doc(db, "users", currentUser.uid, "expenses", id), data);
    } else {
        await addDoc(collection(db, "users", currentUser.uid, "expenses"), data);
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
    document.getElementById('expense-date').valueAsDate = new Date();
    document.getElementById('form-expense-title').innerText = "Aggiungi Nuova Spesa";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

window.deleteExpense = async (id) => {
    if (confirm("Vuoi cancellare questa spesa?")) {
        await deleteDoc(doc(db, "users", currentUser.uid, "expenses", id));
        await loadExpenses();
        calculateDashboard();
    }
};

// Algoritmo di Calcolo Dashboard & Giorni Mancanti
function calculateDashboard() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = today.toISOString().split('T')[0];

    // Speso Oggi
    const spentToday = expenses
        .filter(e => e.date === todayStr)
        .reduce((sum, e) => sum + e.amount, 0);
    document.getElementById('spent-today').innerText = `€ ${spentToday.toFixed(2)}`;

    // Calcolo Giorni Mancanti
    if (!salaryData.nextDate) return;

    const nextSalary = new Date(salaryData.nextDate);
    nextSalary.setHours(0,0,0,0);

    const diffTime = nextSalary - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    document.getElementById('days-left').innerText = diffDays > 0 ? diffDays : 0;

    // Calcolo del ciclo mensile dello stipendio
    // Troviamo il mese precedente dello stipendio come data d'inizio del periodo
    const lastSalaryDate = new Date(nextSalary);
    lastSalaryDate.setMonth(lastSalaryDate.getMonth() - 1);

    // Spese nel periodo di stipendio corrente (da ultimo stipendio a oggi)
    const currentPeriodExpenses = expenses.filter(e => {
        const expDate = new Date(e.date);
        return expDate >= lastSalaryDate && expDate <= today;
    }).reduce((sum, e) => sum + e.amount, 0);

    const totalSalary = (salaryData.base || 0) + (salaryData.extra || 0);
    const residue = totalSalary - currentPeriodExpenses;
    document.getElementById('salary-residue').innerText = `€ ${residue.toFixed(2)}`;

    // Budget giornaliero
    const daysRemaining = diffDays > 0 ? diffDays : 1;
    const dailyBudget = residue > 0 ? (residue / daysRemaining) : 0;
    document.getElementById('daily-budget').innerText = `€ ${dailyBudget.toFixed(2)}`;
}
