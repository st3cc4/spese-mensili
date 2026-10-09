import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD-TUA_MESS_PLACEHOLDER_FIX",
    authDomain: "spese-mensili-58c04.firebaseapp.com",
    projectId: "spese-mensili-58c04",
    storageBucket: "spese-mensili-58c04.appspot.com",
    messagingSenderId: "33333333333",
    appId: "1:33333333333:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Riferimenti elementi UI
const initialBudgetEl = document.getElementById('initial-budget');
const totalSpentEl = document.getElementById('total-spent');
const remainingBudgetEl = document.getElementById('remaining-budget');
const daysRemainingEl = document.getElementById('days-remaining');
const dailyBudgetEl = document.getElementById('daily-budget');
const btnEditBudget = document.getElementById('btn-edit-budget');

const expenseForm = document.getElementById('expense-form');
const expenseAmountInput = document.getElementById('expense-amount');
const expenseCategorySelect = document.getElementById('expense-category');
const expenseDateInput = document.getElementById('expense-date');
const expenseListEl = document.getElementById('expense-list');

const newCategoryNameInput = document.getElementById('new-category-name');
const btnManageCat = document.getElementById('btn-manage-cat');
const categoryListEl = document.getElementById('category-list');

const statFilterSelect = document.getElementById('stat-filter');
const dateRangeInputs = document.getElementById('date-range-inputs');
const statStartDate = document.getElementById('stat-start-date');
const statEndDate = document.getElementById('stat-end-date');
const filteredTotalEl = document.getElementById('filtered-total');
const filteredCategoryBreakdown = document.getElementById('filtered-category-breakdown');

let categories = ["Alimentari", "Svago", "Bollette", "Trasporti"];
let expenses = [];
let initialBudget = 1000;

// Imposta data odierna come default nel form spesa
expenseDateInput.value = new Date().toISOString().split('T')[0];

// Calcolo ciclo stipendio (dal 10 del mese precedente al 10 corrente)
function getCurrentSalaryPeriod() {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let startDate, endDate;

    if (now.getDate() < 10) {
        startDate = new Date(year, month - 1, 10);
        endDate = new Date(year, month, 10);
    } else {
        startDate = new Date(year, month, 10);
        endDate = new Date(year, month + 1, 10);
    }
    return { startDate, endDate };
}

function calculateDays() {
    const now = new Date();
    const { endDate } = getCurrentSalaryPeriod();
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
}

async function loadData() {
    try {
        // Carica budget
        const budgetDoc = await getDoc(doc(db, "settings", "budget"));
        if (budgetDoc.exists()) {
            initialBudget = budgetDoc.data().amount || 1000;
        }

        // Carica categorie
        const catDoc = await getDoc(doc(db, "settings", "categories"));
        if (catDoc.exists()) {
            categories = catDoc.data().list || categories;
        }

        // Carica spese
        const querySnapshot = await getDocs(collection(db, "expenses"));
        expenses = [];
        querySnapshot.forEach((docSnap) => {
            expenses.push({ id: docSnap.id, ...docSnap.data() });
        });

        updateUI();
    } catch (e) {
        console.error("Errore nel caricamento dati: ", e);
    }
}

function updateUI() {
    initialBudgetEl.textContent = initialBudget.toFixed(2);
    
    // Calcolo spese nel periodo corrente (10 - 10)
    const { startDate, endDate } = getCurrentSalaryPeriod();
    let totalSpent = 0;

    expenses.forEach(exp => {
        const expDate = new Date(exp.date);
        if (expDate >= startDate && expDate < endDate) {
            totalSpent += parseFloat(exp.amount);
        }
    });

    totalSpentEl.textContent = totalSpent.toFixed(2);
    const remaining = initialBudget - totalSpent;
    remainingBudgetEl.textContent = remaining.toFixed(2);

    const days = calculateDays();
    daysRemainingEl.textContent = days;

    const daily = days > 0 ? (remaining / days) : 0;
    dailyBudgetEl.textContent = daily.toFixed(2);

    // Aggiorna select categorie
    expenseCategorySelect.innerHTML = "";
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        expenseCategorySelect.appendChild(opt);
    });

    // Aggiorna lista categorie gestione
    categoryListEl.innerHTML = "";
    categories.forEach((cat, index) => {
        const li = document.createElement('li');
        li.innerHTML = `${cat} <button data-index="${index}" class="btn-del-cat">Elimina</button>`;
        categoryListEl.appendChild(li);
    });

    // Aggiorna storico spese
    expenseListEl.innerHTML = "";
    expenses.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(exp => {
        const li = document.createElement('li');
        li.innerHTML = `${exp.date} - <strong>${exp.category}</strong>: ${parseFloat(exp.amount).toFixed(2)} € <button data-id="${exp.id}" class="btn-del-exp">X</button>`;
        expenseListEl.appendChild(li);
    });

    updateStatistics();
}

// Gestione salvataggio spesa
expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newExpense = {
        amount: parseFloat(expenseAmountInput.value),
        category: expenseCategorySelect.value,
        date: expenseDateInput.value
    };

    try {
        await addDoc(collection(db, "expenses"), newExpense);
        expenseAmountInput.value = "";
        expenseDateInput.value = new Date().toISOString().split('T')[0];
        loadData();
    } catch (e) {
        console.error("Errore salvataggio spesa: ", e);
    }
});

// Eliminazione spesa
expenseListEl.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-del-exp')) {
        const id = e.target.getAttribute('data-id');
        await deleteDoc(doc(db, "expenses", id));
        loadData();
    }
});

// Modifica budget
btnEditBudget.addEventListener('click', async () => {
    const newB = prompt("Inserisci il nuovo budget iniziale:", initialBudget);
    if (newB !== null && !isNaN(newB)) {
        initialBudget = parseFloat(newB);
        await setDoc(doc(db, "settings", "budget"), { amount: initialBudget });
        updateUI();
    }
});

// Aggiungi categoria
btnManageCat.addEventListener('click', async () => {
    const catName = newCategoryNameInput.value.trim();
    if (catName && !categories.includes(catName)) {
        categories.push(catName);
        newCategoryNameInput.value = "";
        await setDoc(doc(db, "settings", "categories"), { list: categories });
        updateUI();
    }
});

// Elimina categoria
categoryListEl.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-del-cat')) {
        const index = e.target.getAttribute('data-index');
        categories.splice(index, 1);
        await setDoc(doc(db, "settings", "categories"), { list: categories });
        updateUI();
    }
});

// Statistiche e filtri
statFilterSelect.addEventListener('change', (e) => {
    if (e.target.value === 'range') {
        dateRangeInputs.style.display = 'block';
    } else {
        dateRangeInputs.style.display = 'none';
    }
    updateStatistics();
});

[statStartDate, statEndDate].forEach(el => el.addEventListener('change', updateStatistics));

function updateStatistics() {
    const filterType = statFilterSelect.value;
    const now = new Date();
    let filtered = [];

    expenses.forEach(exp => {
        const expDate = new Date(exp.date);
        let include = false;

        if (filterType === 'day') {
            if (expDate.toDateString() === now.toDateString()) include = true;
        } else if (filterType === 'week') {
            const firstDayOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
            if (expDate >= firstDayOfWeek) include = true;
        } else if (filterType === 'month') {
            if (expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear()) include = true;
        } else if (filterType === 'year') {
            if (expDate.getFullYear() === now.getFullYear()) include = true;
        } else if (filterType === 'range') {
            const start = statStartDate.value ? new Date(statStartDate.value) : null;
            const end = statEndDate.value ? new Date(statEndDate.value) : null;
            if (start && end && expDate >= start && expDate <= end) include = true;
        }

        if (include) filtered.push(exp);
    });

    let totalFiltered = 0;
    let catTotals = {};
    categories.forEach(c => catTotals[c] = 0);

    filtered.forEach(exp => {
        totalFiltered += parseFloat(exp.amount);
        if (catTotals[exp.category] !== undefined) {
            catTotals[exp.category] += parseFloat(exp.amount);
        } else {
            catTotals[exp.category] = parseFloat(exp.amount);
        }
    });

    filteredTotalEl.textContent = totalFiltered.toFixed(2);
    filteredCategoryBreakdown.innerHTML = "";
    for (const [cat, sum] of Object.entries(catTotals)) {
        const p = document.createElement('p');
        p.textContent = `${cat}: ${sum.toFixed(2)} €`;
        filteredCategoryBreakdown.appendChild(p);
    }
}

// Avvio applicazione
loadData();
