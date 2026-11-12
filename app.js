import { 
    auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    onAuthStateChanged, signOut, collection, addDoc, getDocs, doc, 
    updateDoc, deleteDoc, setDoc, getDoc, query, where 
} from "./firebase-config.js";

let currentUser = null;
let categories = [];
let expenses = [];
let salaryData = { nextDate: "", base: 0, extra: 0, extraExpression: "" };

// Data di Oggi locale in formato YYYY-MM-DD
const todayLocal = new Date();
const year = todayLocal.getFullYear();
const month = String(todayLocal.getMonth() + 1).padStart(2, '0');
const day = String(todayLocal.getDate()).padStart(2, '0');
const todayStr = `${year}-${month}-${day}`;

document.getElementById('expense-date').value = todayStr;

// Controllo Stato Autenticazione Fluido con isolamento dati per utente (UID)
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        await loadUserData();
        
        // Controlla se arriviamo dallo Storico per modificare una spesa passata
        const editId = localStorage.getItem('edit_id');
        if (editId) {
            document.getElementById('edit-expense-id').value = editId;
            document.getElementById('expense-amount').value = localStorage.getItem('edit_amount');
            document.getElementById('expense-date').value = localStorage.getItem('edit_date');
            document.getElementById('expense-category').value = localStorage.getItem('edit_category');

            document.getElementById('form-expense-title').innerText = "Modifica Spesa Storico";
            document.getElementById('cancel-edit-btn').classList.remove('hidden');

            localStorage.removeItem('edit_id');
            localStorage.removeItem('edit_amount');
            localStorage.removeItem('edit_date');
            localStorage.removeItem('edit_category');
        }
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

// Caricamento Dati specifici dell'utente loggato
async function loadUserData() {
    await loadSalary();
    await loadCategories();
    await loadExpenses();
}

// Gestione Stipendio basata sul documento personale dell'utente (UID)
async function loadSalary() {
    try {
        const docRef = doc(db, "config", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            salaryData.nextDate = data.dataProssimoStipendio || "";
            salaryData.base = parseFloat((data.stipendio || 0).toString().replace(',', '.')) || 0;
            salaryData.extra = parseFloat((data.extra || 0).toString().replace(',', '.')) || 0;
            salaryData.extraExpression = data.extraExpression || (data.extra !== undefined ? data.extra.toString() : "0");

            document.getElementById('salary-date').value = salaryData.nextDate;
            document.getElementById('modal-salary-base').value = data.stipendio || "";
            document.getElementById('modal-salary-extra').value = salaryData.extraExpression;
        } else {
            // Valori di default se il documento non esiste ancora per questo utente
            salaryData = { nextDate: "", base: 0, extra: 0, extraExpression: "" };
            document.getElementById('salary-date').value = "";
            document.getElementById('modal-salary-base').value = "";
            document.getElementById('modal-salary-extra').value = "";
        }
    } catch (e) {
        console.log("Errore caricamento stipendio:", e);
    }
}

// Salvataggio automatico data prossimo stipendio associata all'utente
document.getElementById('salary-date').addEventListener('change', async () => {
    const nextDate = document.getElementById('salary-date').value;
    salaryData.nextDate = nextDate;

    const docRef = doc(db, "config", currentUser.uid);
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

// Salvataggio dati stipendio nel documento personale dell'utente
document.getElementById('save-salary-modal-btn').addEventListener('click', async () => {
    const baseRaw = document.getElementById('modal-salary-base').value.trim().replace(',', '.');
    const base = parseFloat(baseRaw) || 0;
    const extraInput = document.getElementById('modal-salary-extra').value.trim();

    let evaluatedExtra = 0;
    try {
        const normalizedExtra = extraInput.replace(',', '.');
        const sanitized = normalizedExtra.replace(/[^0-9+\-.\s]/g, '');
        evaluatedExtra = sanitized ? eval(sanitized) : 0;
    } catch (err) {
        alert("Formato extra non valido. Controlla i valori inseriti.");
        return;
    }

    salaryData.base = base;
    salaryData.extra = evaluatedExtra;
    salaryData.extraExpression = extraInput;

    const docRef = doc(db, "config", currentUser.uid);
    const docSnap = await getDoc(docRef);
    let currentData = docSnap.exists() ? docSnap.data() : {};
    
    currentData.stipendio = document.getElementById('modal-salary-base').value.trim();
    currentData.extra = evaluatedExtra;
    currentData.extraExpression = extraInput;

    await setDoc(docRef, currentData);
    salaryModal.classList.add('hidden');
    alert("Dati stipendio ed extra salvati!");
    calculateDashboard();
});

function capitalizeFirstOnly(str) {
    if (!str) return "";
    str = str.trim();
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDateToEu(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// Gestione Categorie personali dell'utente (salvate nel suo documento config)
async function loadCategories() {
    try {
        const docRef = doc(db, "config", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().categorie) {
            let rawCategories = docSnap.data().categorie;
            let normalizedSet = new Set(rawCategories.map(c => capitalizeFirstOnly(c)));
            categories = Array.from(normalizedSet).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
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
    select.innerHTML = '<option value="" disabled selected>Seleziona categoria...</option>';

    categories.forEach((catName) => {
        select.innerHTML += `<option value="${catName}">${catName}</option>`;
    });
}

document.getElementById('quick-add-category-btn').addEventListener('click', async () => {
    const inputName = prompt("Inserisci il nome della nuova categoria (o scrivi una categoria esistente preceduta da '-' es. '-Sigarette' per eliminarla):");
    if (!inputName || !inputName.trim()) return;
    
    let trimmed = inputName.trim();

    if (trimmed.startsWith('-')) {
        let targetCat = capitalizeFirstOnly(trimmed.substring(1));
        const index = categories.indexOf(targetCat);
        if (index > -1) {
            if (confirm(`Vuoi davvero eliminare la categoria "${targetCat}"?`)) {
                categories.splice(index, 1);
                await saveCategoriesToFirebase();
                renderCategories();
                document.getElementById('expense-category').value = '';
                alert(`Categoria "${targetCat}" eliminata.`);
            }
        } else {
            alert(`La categoria "${targetCat}" non è stata trovata.`);
        }
        return;
    }

    const formattedName = capitalizeFirstOnly(trimmed);

    if (!categories.includes(formattedName)) {
        categories.push(formattedName);
        categories.sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
        await saveCategoriesToFirebase();
        renderCategories();
        document.getElementById('expense-category').value = formattedName;
    } else {
        alert("Questa categoria esiste già!");
        document.getElementById('expense-category').value = formattedName;
    }
});

async function saveCategoriesToFirebase() {
    const docRef = doc(db, "config", currentUser.uid);
    const docSnap = await getDoc(docRef);
    let currentData = docSnap.exists() ? docSnap.data() : {};
    currentData.categorie = categories;
    await setDoc(docRef, currentData);
}

// Caricamento Spese filtrate esclusivamente per l'utente corrente tramite userId
async function loadExpenses() {
    try {
        const q = query(collection(db, "spese"), where("userId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        expenses = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            expenses.push({ 
                id: docSnap.id, 
                amount: parseFloat((data.importo || data.amount || 0).toString().replace(',', '.')) || 0,
                date: data.data || data.date,
                category: data.categoria || data.category 
            });
        });
        renderExpenses();
        calculateDashboard(); 
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
        const dateEu = formatDateToEu(exp.date);
        list.innerHTML += `
            <div class="expense-item">
                <div class="item-info">
                    <span class="item-title">${exp.category}</span>
                    <span class="item-sub">${dateEu}</span>
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

// Salvataggio spesa associata all'userId dell'utente loggato
document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-expense-id').value;
    const amountInput = document.getElementById('expense-amount').value.toString().replace(',', '.');
    const amount = parseFloat(amountInput) || 0;
    const date = document.getElementById('expense-date').value;
    const category = document.getElementById('expense-category').value;

    if (!category) {
        alert("Seleziona una categoria valida.");
        return;
    }

    const data = { 
        importo: amount, 
        data: date, 
        categoria: category, 
        userId: currentUser.uid, 
        timestamp: new Date() 
    };

    if (id) {
        await updateDoc(doc(db, "spese", id), data);
    } else {
        await addDoc(collection(db, "spese"), data);
    }

    resetForm();
    await loadExpenses();
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
    }
};

// Calcoli Dashboard
function calculateDashboard() {
    const spentToday = expenses
        .filter(e => e.date === todayStr)
        .reduce((sum, e) => sum + e.amount, 0);
    document.getElementById('spent-today').innerText = `€ ${spentToday.toFixed(2)}`;

    if (!salaryData.nextDate) {
        document.getElementById('days-left').innerText = "0";
        document.getElementById('salary-residue').innerText = "€ 0.00";
        document.getElementById('daily-budget').innerText = "€ 0.00";
        return;
    }

    const nextSalaryParts = salaryData.nextDate.split('-');
    const nextSalary = new Date(parseInt(nextSalaryParts[0]), parseInt(nextSalaryParts[1]) - 1, parseInt(nextSalaryParts[2]));
    nextSalary.setHours(0,0,0,0);

    const todayDateObj = new Date(year, parseInt(month) - 1, parseInt(day));
    todayDateObj.setHours(0,0,0,0);

    const diffTime = nextSalary - todayDateObj;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    document.getElementById('days-left').innerText = diffDays > 0 ? diffDays : 0;

    const lastSalaryDate = new Date(nextSalary);
    lastSalaryDate.setMonth(lastSalaryDate.getMonth() - 1);

    const currentPeriodExpenses = expenses.filter(e => {
        if (!e.date) return false;
        const p = e.date.split('-');
        const expDate = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
        expDate.setHours(0,0,0,0);
        return expDate >= lastSalaryDate && expDate <= todayDateObj;
    }).reduce((sum, e) => sum + e.amount, 0);

    const totalIncome = (salaryData.base || 0) + (salaryData.extra || 0);
    const residue = totalIncome - currentPeriodExpenses;
    document.getElementById('salary-residue').innerText = `€ ${residue.toFixed(2)}`;

    const daysRemaining = diffDays > 0 ? diffDays : 1;
    const dailyBudget = residue > 0 ? (residue / daysRemaining) : 0;
    document.getElementById('daily-budget').innerText = `€ ${dailyBudget.toFixed(2)}`;
}
