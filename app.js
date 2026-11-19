import { 
    auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    onAuthStateChanged, signOut, collection, addDoc, getDocs, doc, 
    updateDoc, deleteDoc, setDoc, getDoc 
} from "./firebase-config.js";

let currentUser = null;
let categories = [];
let expenses = [];
let salaryData = { nextDate: "", base: 0, extra: 0, extraExpression: "" };

const PAOLO_2026_SALARIES = {
    "2026-01": { stipendio: 1733.19, extra: 112, extraExpression: "112" },
    "2026-02": { stipendio: 1895.23, extra: 136, extraExpression: "136" },
    "2026-03": { stipendio: 1163.78, extra: 8, extraExpression: "8" },
    "2026-04": { stipendio: 1327.81, extra: 16, extraExpression: "16" },
    "2026-05": { stipendio: 1562.19, extra: 72, extraExpression: "72" },
    "2026-06": { stipendio: 1149.45, extra: 0, extraExpression: "0" },
    "2026-07": { stipendio: 2864.79, extra: 0, extraExpression: "0" },
    "2026-08": { stipendio: 1369.93, extra: 30, extraExpression: "30" },
    "2026-09": { stipendio: 1512.63, extra: 90, extraExpression: "90" },
    "2026-10": { stipendio: 1415.57, extra: 20, extraExpression: "20" },
    "2026-11": { stipendio: 1473.15, extra: 60, extraExpression: "60" },
    "2026-12": { stipendio: 0, extra: 0, extraExpression: "0" }
};

const ELENA_2026_SALARIES = {
    "2026-11": { stipendio: 1048.71, extra: 0, extraExpression: "0" }
};

const todayLocal = new Date();
const year = todayLocal.getFullYear();
const month = String(todayLocal.getMonth() + 1).padStart(2, '0');
const day = String(todayLocal.getDate()).padStart(2, '0');
const todayStr = `${year}-${month}-${day}`;
const currentYearMonth = `${year}-${month}`;

const expenseDateEl = document.getElementById('expense-date');
if (expenseDateEl) expenseDateEl.value = todayStr;

function isUserElena(user) {
    if (!user || !user.email) return false;
    return user.email.toLowerCase().includes("ele");
}

function resolveExpenseOwner(data, user) {
    const rawOwner = (data.owner || data.utente || data.nome || data.account || data.user || "").toString().toLowerCase().trim();
    if (rawOwner.includes("ele")) return "elena";
    if (rawOwner.includes("pao")) return "paolo";

    const expUserId = data.userId || "";
    if (user && expUserId === user.uid) {
        return isUserElena(user) ? "elena" : "paolo";
    }

    return "paolo";
}

function getCategoryFieldKey() {
    return isUserElena(currentUser) ? "categorie_elena" : "categorie_paolo";
}

function notifyStoricoActiveUser() {
    const frame = document.getElementById('storico-frame');
    if (frame && frame.contentWindow && currentUser) {
        frame.contentWindow.postMessage({
            type: 'SET_ACTIVE_USER',
            email: currentUser.email || "",
            uid: currentUser.uid || ""
        }, '*');
    }
}

function showDashboardView() {
    document.getElementById('view-dashboard').classList.remove('hidden');
    document.getElementById('view-storico').classList.add('hidden');
    
    const btnDash = document.getElementById('nav-btn-dashboard');
    const btnStorico = document.getElementById('nav-btn-storico');
    btnDash.style.color = '#3b5998';
    btnStorico.style.color = '#666';
    
    checkPendingEditFromStorage();
    loadExpenses();
}

function showStoricoView() {
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-storico').classList.remove('hidden');
    
    const btnDash = document.getElementById('nav-btn-dashboard');
    const btnStorico = document.getElementById('nav-btn-storico');
    btnDash.style.color = '#666';
    btnStorico.style.color = '#3b5998';

    notifyStoricoActiveUser();

    const frame = document.getElementById('storico-frame');
    if (frame && frame.contentWindow && typeof frame.contentWindow.refreshStoricoData === 'function') {
        frame.contentWindow.refreshStoricoData();
    }
}

document.getElementById('nav-btn-dashboard').addEventListener('click', showDashboardView);
document.getElementById('nav-btn-storico').addEventListener('click', showStoricoView);

window.addEventListener('message', (event) => {
    if (event.data) {
        if (event.data.type === 'EDIT_EXPENSE_FROM_HISTORY') {
            showDashboardView();
        } else if (event.data.type === 'LOGOUT_FROM_HISTORY') {
            signOut(auth);
        }
    }
});

function checkPendingEditFromStorage() {
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
}

onAuthStateChanged(auth, async (user) => {
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');

    if (user) {
        currentUser = user;
        if (authScreen) authScreen.classList.add('hidden');
        if (appScreen) appScreen.classList.remove('hidden');
        notifyStoricoActiveUser();
        await loadUserData();
        checkPendingEditFromStorage();
    } else {
        currentUser = null;
        if (authScreen) authScreen.classList.remove('hidden');
        if (appScreen) appScreen.classList.add('hidden');
    }
});

const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            try {
                await createUserWithEmailAndPassword(auth, email, password);
            } catch (err) {
                console.error("Errore autenticazione:", err);
                alert("Errore durante l'accesso: " + err.message);
            }
        }
    });
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => signOut(auth));
}

async function seedDefaultMonthlySalariesIfNeeded(userDocRef, existingData) {
    const elena = isUserElena(currentUser);
    const defaults = elena ? ELENA_2026_SALARIES : PAOLO_2026_SALARIES;
    const existingMonthly = existingData.entrateMensili || {};

    let updated = false;
    const mergedMonthly = { ...existingMonthly };

    for (const [ym, entry] of Object.entries(defaults)) {
        if (!mergedMonthly[ym]) {
            const tot = (parseFloat(entry.stipendio) || 0) + (parseFloat(entry.extra) || 0);
            mergedMonthly[ym] = {
                stipendio: entry.stipendio,
                extra: entry.extra,
                extraExpression: entry.extraExpression || String(entry.extra || 0),
                totale: tot
            };
            updated = true;
        }
    }

    const activeMonthData = mergedMonthly[currentYearMonth];
    const updatePayload = { ...existingData, entrateMensili: mergedMonthly };

    if (activeMonthData && (existingData.stipendio === undefined || existingData.stipendio === "" || existingData.stipendio === 0)) {
        updatePayload.stipendio = activeMonthData.stipendio;
        updatePayload.extra = activeMonthData.extra;
        updatePayload.extraExpression = activeMonthData.extraExpression;
        updated = true;
    }

    if (updated || !existingData.entrateMensili) {
        await setDoc(userDocRef, updatePayload);
        return updatePayload;
    }

    return existingData;
}

async function loadUserData() {
    await loadSalaryAndCategories();
    await loadExpenses();
}

async function loadSalaryAndCategories() {
    try {
        const userDocRef = doc(db, "config", currentUser.uid);
        let docSnap = await getDoc(userDocRef);

        if (!docSnap.exists() && !isUserElena(currentUser)) {
            const legacyDocRef = doc(db, "config", "impostazioni");
            const legacySnap = await getDoc(legacyDocRef);
            if (legacySnap.exists()) {
                await setDoc(userDocRef, legacySnap.data());
                docSnap = await getDoc(userDocRef);
            }
        }

        const catKey = getCategoryFieldKey();
        const legacyCatKey = "categorie";

        let rawData = docSnap.exists() ? docSnap.data() : {};
        rawData = await seedDefaultMonthlySalariesIfNeeded(userDocRef, rawData);

        salaryData.nextDate = rawData.dataProssimoStipendio || "";
        const monthEntry = rawData.entrateMensili && rawData.entrateMensili[currentYearMonth];

        const baseVal = monthEntry !== undefined
            ? parseFloat((monthEntry.stipendio || 0).toString().replace(',', '.')) || 0
            : parseFloat((rawData.stipendio || 0).toString().replace(',', '.')) || 0;

        const extraVal = monthEntry !== undefined
            ? parseFloat((monthEntry.extra || 0).toString().replace(',', '.')) || 0
            : parseFloat((rawData.extra || 0).toString().replace(',', '.')) || 0;

        const extraExpr = monthEntry !== undefined
            ? (monthEntry.extraExpression || String(extraVal))
            : (rawData.extraExpression || (rawData.extra !== undefined ? rawData.extra.toString() : "0"));

        salaryData.base = baseVal;
        salaryData.extra = extraVal;
        salaryData.extraExpression = extraExpr;

        const salaryDateInput = document.getElementById('salary-date');
        const modalSalaryBase = document.getElementById('modal-salary-base');
        const modalSalaryExtra = document.getElementById('modal-salary-extra');

        if (salaryDateInput) salaryDateInput.value = salaryData.nextDate;
        if (modalSalaryBase) modalSalaryBase.value = baseVal || "";
        if (modalSalaryExtra) modalSalaryExtra.value = extraExpr;

        let rawCategories = rawData[catKey] || rawData[legacyCatKey] || [];
        let normalizedSet = new Set(rawCategories.map(c => formatCategoryName(c)));
        categories = Array.from(normalizedSet).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));

        setupCategoryAutocomplete();
    } catch (e) {
        console.error("Errore caricamento impostazioni:", e);
    }
}

const salaryDateEl = document.getElementById('salary-date');
if (salaryDateEl) {
    salaryDateEl.addEventListener('change', async () => {
        const nextDate = salaryDateEl.value;
        salaryData.nextDate = nextDate;

        const docRef = doc(db, "config", currentUser.uid);
        const docSnap = await getDoc(docRef);
        let currentData = docSnap.exists() ? docSnap.data() : {};
        
        currentData.dataProssimoStipendio = nextDate;
        await setDoc(docRef, currentData);
        calculateDashboard();
    });
}

const salaryModal = document.getElementById('salary-modal');
const openSalaryModalBtn = document.getElementById('open-salary-modal');
const closeSalaryModalBtn = document.getElementById('close-salary-modal');

if (openSalaryModalBtn && salaryModal) {
    openSalaryModalBtn.addEventListener('click', () => salaryModal.classList.remove('hidden'));
}
if (closeSalaryModalBtn && salaryModal) {
    closeSalaryModalBtn.addEventListener('click', () => salaryModal.classList.add('hidden'));
}

const saveSalaryModalBtn = document.getElementById('save-salary-modal-btn');
if (saveSalaryModalBtn) {
    saveSalaryModalBtn.addEventListener('click', async () => {
        const baseRaw = document.getElementById('modal-salary-base').value.trim().replace(',', '.');
        const base = parseFloat(baseRaw) || 0;
        const extraInput = document.getElementById('modal-salary-extra').value.trim();

        let evaluatedExtra = 0;
        try {
            const normalizedExtra = extraInput.replace(',', '.');
            const sanitized = normalizedExtra.replace(/[^0-9+\-.\s]/g, '');
            evaluatedExtra = sanitized ? eval(sanitized) : 0;
        } catch (err) {
            alert("Formato extra non valido.");
            return;
        }

        salaryData.base = base;
        salaryData.extra = evaluatedExtra;
        salaryData.extraExpression = extraInput;

        const docRef = doc(db, "config", currentUser.uid);
        const docSnap = await getDoc(docRef);
        let currentData = docSnap.exists() ? docSnap.data() : {};
        
        const monthlyMap = currentData.entrateMensili || {};
        monthlyMap[currentYearMonth] = {
            stipendio: base,
            extra: evaluatedExtra,
            extraExpression: extraInput,
            totale: base + evaluatedExtra
        };

        currentData.stipendio = base;
        currentData.extra = evaluatedExtra;
        currentData.extraExpression = extraInput;
        currentData.entrateMensili = monthlyMap;

        await setDoc(docRef, currentData);
        salaryModal.classList.add('hidden');
        alert(`Dati stipendio ed extra per ${currentYearMonth} salvati!`);
        calculateDashboard();
    });
}

function formatCategoryName(str) {
    if (!str) return "";
    str = str.trim();
    const words = str.split(/\s+/);
    if (words.length === 0) return "";
    
    const firstWord = words[0];
    const capitalizedFirst = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
    words[0] = capitalizedFirst;
    return words.join(" ");
}

function formatDateToEu(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function setupCategoryAutocomplete() {
    const input = document.getElementById('expense-category');
    const dropdown = document.getElementById('category-dropdown');
    if (!input || !dropdown) return;

    function renderDropdown(filteredList) {
        dropdown.innerHTML = '';
        if (filteredList.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }
        filteredList.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'category-suggestion-item';
            item.innerText = cat;
            item.onclick = () => {
                input.value = cat;
                dropdown.classList.add('hidden');
            };
            dropdown.appendChild(item);
        });
        dropdown.classList.remove('hidden');
    }

    input.onfocus = () => {
        renderDropdown(categories);
    };

    input.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        const filtered = categories.filter(c => c.toLowerCase().includes(val));
        renderDropdown(filtered);
    };

    document.onclick = (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    };
}

const deleteCategoryBtn = document.getElementById('delete-category-btn');
if (deleteCategoryBtn) {
    deleteCategoryBtn.addEventListener('click', async () => {
        const inputVal = document.getElementById('expense-category').value.trim();
        if (!inputVal) {
            alert("Scrivi o seleziona nel campo categoria il nome della categoria da eliminare.");
            return;
        }

        const targetCat = formatCategoryName(inputVal);
        const index = categories.indexOf(targetCat);

        if (index > -1) {
            if (confirm(`Vuoi davvero eliminare la categoria "${targetCat}"?`)) {
                categories.splice(index, 1);
                await saveCategoriesToFirebase();
                setupCategoryAutocomplete();
                document.getElementById('expense-category').value = '';
                alert(`Categoria "${targetCat}" eliminata con successo.`);
            }
        } else {
            alert(`La categoria "${targetCat}" non è presente nell'elenco.`);
        }
    });
}

async function saveCategoriesToFirebase() {
    const docRef = doc(db, "config", currentUser.uid);
    const docSnap = await getDoc(docRef);
    let currentData = docSnap.exists() ? docSnap.data() : {};
    
    const catKey = getCategoryFieldKey();
    currentData[catKey] = categories;
    await setDoc(docRef, currentData);
}

async function loadExpenses() {
    try {
        const q = collection(db, "spese");
        const querySnapshot = await getDocs(q);
        expenses = [];
        const elenaLogged = isUserElena(currentUser);
        const expectedOwner = elenaLogged ? "elena" : "paolo";

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const expUserId = data.userId || "";
            const expOwner = resolveExpenseOwner(data, currentUser);
            
            const belongsToUser = (expOwner === expectedOwner) || (expUserId === currentUser.uid);

            if (belongsToUser) {
                expenses.push({ 
                    id: docSnap.id, 
                    amount: parseFloat((data.importo || data.amount || 0).toString().replace(',', '.')) || 0,
                    date: data.data || data.date,
                    category: data.categoria || data.category,
                    owner: expOwner
                });
            }
        });
        renderExpenses();
        calculateDashboard(); 
    } catch (e) {
        console.error("Errore caricamento spese:", e);
    }
}

function renderExpenses() {
    const list = document.getElementById('recent-expenses-list');
    if (!list) return;
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

const expenseForm = document.getElementById('expense-form');
if (expenseForm) {
    expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-expense-id').value;
        const amountInput = document.getElementById('expense-amount').value.toString().replace(',', '.');
        const amount = parseFloat(amountInput) || 0;
        const date = document.getElementById('expense-date').value;
        const rawCategory = document.getElementById('expense-category').value.trim();

        if (!rawCategory) {
            alert("Seleziona una categoria valida.");
            return;
        }

        const formattedCategory = formatCategoryName(rawCategory);

        if (!categories.includes(formattedCategory)) {
            categories.push(formattedCategory);
            categories.sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
            await saveCategoriesToFirebase();
            setupCategoryAutocomplete();
        }

        const isElena = isUserElena(currentUser);
        const ownerName = isElena ? "elena" : "paolo";
        const data = { 
            importo: amount, 
            data: date, 
            categoria: formattedCategory, 
            userId: currentUser.uid, 
            owner: ownerName,
            utente: isElena ? "Elena" : "Paolo",
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
}

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

const cancelEditBtn = document.getElementById('cancel-edit-btn');
if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', resetForm);
}

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
    lastSalaryDate.setHours(0,0,0,0);

    const startOfCurrentMonth = new Date(year, parseInt(month) - 1, 1);
    startOfCurrentMonth.setHours(0,0,0,0);

    const effectiveStartDate = lastSalaryDate < startOfCurrentMonth ? lastSalaryDate : startOfCurrentMonth;

    const currentPeriodExpenses = expenses.filter(e => {
        if (!e.date) return false;
        const p = e.date.split('-');
        if (p.length !== 3) return false;
        const expDate = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
        expDate.setHours(0,0,0,0);
        return expDate >= effectiveStartDate && expDate <= todayDateObj;
    }).reduce((sum, e) => sum + e.amount, 0);

    const totalIncome = (salaryData.base || 0) + (salaryData.extra || 0);
    const residue = totalIncome - currentPeriodExpenses;
    document.getElementById('salary-residue').innerText = `€ ${residue.toFixed(2)}`;

    const daysRemaining = diffDays > 0 ? diffDays : 1;
    const dailyBudget = residue > 0 ? (residue / daysRemaining) : 0;
    document.getElementById('daily-budget').innerText = `€ ${dailyBudget.toFixed(2)}`;
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then((reg) => console.log('Service Worker registrato con successo!', reg.scope))
            .catch((err) => console.log('Registrazione Service Worker fallita:', err));
    });
}
