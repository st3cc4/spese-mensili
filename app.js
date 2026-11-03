import { 
    auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    onAuthStateChanged, signOut, collection, addDoc, getDocs, doc, 
    updateDoc, deleteDoc, setDoc, getDoc 
} from "./firebase-config.js";

let currentUser = null;
let categories = [];
let expenses = [];
let salaryData = { nextDate: "", base: 0, extra: 0, extraExpression: "" };

// Inizializzazione della Data di Oggi per l'Input Spesa
document.getElementById('expense-date').valueAsDate = new Date();

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

// Caricamento Dati Dalle Collezioni Firestore
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
            
            // Gestiamo il campo extra sia se è un numero sia se è una stringa/espressione
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
        // Valuta in sicurezza l'espressione matematica inserita (es. "139.20 + 90")
        // Permettiamo solo numeri, spazi, punti, più e meno per sicurezza
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
    currentData.extraExpression = extraInput; // Salviamo la stringa originale digitata

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

function renderCategories() {
    const select = document.getElementById('expense-category');
    const list = document.getElementById('categories-list');
    
    select.innerHTML = '<option value="">Seleziona...</option>';
    list.innerHTML = '';

    categories.forEach((catName, index) => {
        select.innerHTML += `<option value="${catName}">${catName}</option>`;
        list.innerHTML += `
            <div class="category-item">
                <span class="item-title">${catName}</span>
                <button class="btn-danger" onclick="deleteCategory(${index})">Elimina</button>
            </div>
        `;
    });
}

document.getElementById('add-category-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-category-name');
    const name = input.value.trim();
    if (!name) return;

    if (!categories.includes(name)) {
        categories.push(name);
        const docRef = doc(db, "config", "impostazioni");
        const docSnap = await getDoc(docRef);
        let currentData = docSnap.exists() ? docSnap.data() : {};
        currentData.categorie = categories;
        await setDoc(docRef, currentData);
        input.value = '';
        renderCategories();
    } else {
        alert("Questa categoria esiste già!");
    }
});

window.deleteCategory = async (index) => {
    if (confirm("Vuoi cancellare questa categoria?")) {
        categories.splice(index, 1);
        const docRef = doc(db, "config", "impostazioni");
        const docSnap = await getDoc(docRef);
        let currentData = docSnap.exists() ? docSnap.data() : {};
        currentData.categorie = categories;
        await setDoc(docRef, currentData);
        renderCategories();
    }
};

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

    const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    sorted.forEach(exp => {
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
    document.getElementById('expense-date').valueAsDate = new Date();
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
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = today.toISOString().split('T')[0];

    const spentToday = expenses
        .filter(e => e.date === todayStr)
        .reduce((sum, e) => sum + e.amount, 0);
    document.getElementById('spent-today').innerText = `€ ${spentToday.toFixed(2)}`;

    if (!salaryData.nextDate) return;

    const nextSalary = new Date(salaryData.nextDate);
    nextSalary.setHours(0,0,0,0);

    const diffTime = nextSalary - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    document.getElementById('days-left').innerText = diffDays > 0 ? diffDays : 0;

    const lastSalaryDate = new Date(nextSalary);
    lastSalaryDate.setMonth(lastSalaryDate.getMonth() - 1);

    const currentPeriodExpenses = expenses.filter(e => {
        const expDate = new Date(e.date);
        return expDate >= lastSalaryDate && expDate <= today;
    }).reduce((sum, e) => sum + e.amount, 0);

    const totalSalary = (salaryData.base || 0) + (salaryData.extra || 0);
    const residue = totalSalary - currentPeriodExpenses;
    document.getElementById('salary-residue').innerText = `€ ${residue.toFixed(2)}`;

    const daysRemaining = diffDays > 0 ? diffDays : 1;
    const dailyBudget = residue > 0 ? (residue / daysRemaining) : 0;
    document.getElementById('daily-budget').innerText = `€ ${dailyBudget.toFixed(2)}`;
}
