import { 
    auth, db, onAuthStateChanged, signOut, 
    collection, getDocs, doc, deleteDoc 
} from "../firebase-config.js";

let allExpenses = [];
let currentUser = null;
let currentUserEmail = "";
let lastAppliedUserKey = null;

// Mappe mensili 2026 per Paolo ed Elena (aggiornate automaticamente con quanto salvato su Firestore)
let monthlyIncomeByOwner = {
    paolo: {
        "2026-01": 1845.19,
        "2026-02": 2031.23,
        "2026-03": 1171.78,
        "2026-04": 1343.81,
        "2026-05": 1634.19,
        "2026-06": 1149.45,
        "2026-07": 2864.79,
        "2026-08": 1399.93,
        "2026-09": 1602.63,
        "2026-10": 1435.57,
        "2026-11": 1533.15,
        "2026-12": 0
    },
    elena: {
        "2026-11": 1048.71
    }
};

function applyAccountCheckboxForUser(email, uid, force = false) {
    const chk1 = document.getElementById('chk-user1'); // Paolo
    const chk2 = document.getElementById('chk-user2'); // Elena
    if (!chk1 || !chk2) return;

    const cleanEmail = (email || "").toLowerCase().trim();
    const key = `${uid || ""}|${cleanEmail}`;
    if (!force && lastAppliedUserKey === key) return;

    const isElena = cleanEmail.includes("ele");
    chk1.checked = !isElena;
    chk2.checked = isElena;
    lastAppliedUserKey = key;
}

window.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'SET_ACTIVE_USER') {
        currentUserEmail = event.data.email || currentUserEmail;
        applyAccountCheckboxForUser(currentUserEmail, event.data.uid || currentUser?.uid || "", false);
        loadStoricoData();
    } else if (event.data.type === 'REFRESH_STORICO') {
        const emailToCheck = event.data.email || currentUser?.email || currentUserEmail;
        if (emailToCheck && !lastAppliedUserKey) {
            applyAccountCheckboxForUser(emailToCheck, currentUser?.uid || "", false);
        }
        loadStoricoData();
    }
});

window.refreshStoricoData = function() {
    const emailToCheck = currentUser?.email || currentUserEmail;
    if (emailToCheck && !lastAppliedUserKey) {
        applyAccountCheckboxForUser(emailToCheck, currentUser?.uid || "", false);
    }
    loadStoricoData();
};

document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const filterType = document.getElementById('filter-type');
    if (filterType) {
        filterType.value = 'day';
    }

    const dayInput = document.getElementById('select-day');
    if (dayInput) {
        dayInput.value = `${year}-${month}-${day}`;
    }

    const monthInput = document.getElementById('select-month');
    if (monthInput) {
        monthInput.value = `${year}-${month}`;
    }

    const yearSelect = document.getElementById('select-year');
    if (yearSelect) {
        yearSelect.innerHTML = '';
        for (let y = year; y >= 2024; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === year) opt.selected = true;
            yearSelect.appendChild(opt);
        }
    }

    if (typeof flatpickr !== 'undefined') {
        flatpickr("#date-range-picker", {
            mode: "range",
            dateFormat: "Y-m-d",
            locale: "it",
            onChange: function(selectedDates) {
                if (selectedDates.length === 2) {
                    applyFilters();
                }
            }
        });
    }

    updateFilterVisibility();

    if (filterType) {
        filterType.addEventListener('change', () => {
            updateFilterVisibility();
            applyFilters();
        });
    }

    const inputsToWatch = [
        'search-input', 'filter-type', 'select-day', 'select-month', 
        'select-week', 'select-year', 'chk-user1', 'chk-user2'
    ];
    
    inputsToWatch.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', applyFilters);
            el.addEventListener('change', applyFilters);
        }
    });

    const logoutBtnStorico = document.getElementById('logout-btn-storico');
    if (logoutBtnStorico) {
        logoutBtnStorico.addEventListener('click', async () => {
            try {
                window.parent.postMessage({ type: 'LOGOUT_FROM_HISTORY' }, '*');
                await signOut(auth);
            } catch (e) {
                console.error("Errore durante il logout:", e);
            }
        });
    }
});

function updateFilterVisibility() {
    const type = document.getElementById('filter-type').value;
    
    document.getElementById('selector-day-container').classList.add('hidden');
    document.getElementById('selector-week-container').classList.add('hidden');
    document.getElementById('selector-month-container').classList.add('hidden');
    document.getElementById('selector-year-container').classList.add('hidden');
    document.getElementById('custom-date-container').classList.add('hidden');

    if (type === 'day') {
        document.getElementById('selector-day-container').classList.remove('hidden');
    } else if (type === 'week') {
        document.getElementById('selector-week-container').classList.remove('hidden');
    } else if (type === 'month') {
        document.getElementById('selector-month-container').classList.remove('hidden');
    } else if (type === 'year') {
        document.getElementById('selector-year-container').classList.remove('hidden');
    } else if (type === 'custom') {
        document.getElementById('custom-date-container').classList.remove('hidden');
    }
}

function isUserElenaByEmail(email) {
    if (!email) return false;
    return email.toLowerCase().includes("ele");
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        currentUserEmail = user.email || currentUserEmail;
        applyAccountCheckboxForUser(currentUserEmail, user.uid, false);
        await loadStoricoData();
    } else {
        currentUser = null;
        currentUserEmail = "";
        lastAppliedUserKey = null;
        allExpenses = [];
        applyFilters();
    }
});

function resolveExpenseOwner(data, user) {
    const rawOwner = (data.owner || data.utente || data.nome || data.account || data.user || "").toString().toLowerCase().trim();
    if (rawOwner.includes("ele")) return "elena";
    if (rawOwner.includes("pao")) return "paolo";

    const expUserId = data.userId || "";
    const emailToCheck = user?.email || currentUserEmail;
    if (user && expUserId === user.uid) {
        return isUserElenaByEmail(emailToCheck) ? "elena" : "paolo";
    }

    return "paolo";
}

async function loadConfigSalaries() {
    try {
        const configSnap = await getDocs(collection(db, "config"));
        configSnap.forEach(docSnap => {
            const data = docSnap.data();
            const docId = docSnap.id.toLowerCase();
            const emailField = (data.email || "").toLowerCase();
            const isElenaDoc = docId.includes("ele") || emailField.includes("ele") ||
                (currentUser && isUserElenaByEmail(currentUser.email) && docSnap.id === currentUser.uid);

            const targetOwner = isElenaDoc ? "elena" : "paolo";

            if (data.entrateMensili && typeof data.entrateMensili === "object") {
                for (const [ym, entry] of Object.entries(data.entrateMensili)) {
                    const tot = entry.totale !== undefined
                        ? parseFloat(entry.totale) || 0
                        : (parseFloat((entry.stipendio || 0).toString().replace(',', '.')) || 0) +
                          (parseFloat((entry.extra || 0).toString().replace(',', '.')) || 0);
                    monthlyIncomeByOwner[targetOwner][ym] = tot;
                }
            }
        });
    } catch (e) {
        console.error("Errore caricamento entrate mensili da config:", e);
    }
}

function getIncomeForSelection(owner, filterType) {
    const map = monthlyIncomeByOwner[owner] || {};

    if (filterType === 'month') {
        const monthVal = document.getElementById('select-month').value;
        return parseFloat(map[monthVal] || 0);
    } else if (filterType === 'year') {
        const yearVal = document.getElementById('select-year').value;
        return Object.entries(map)
            .filter(([ym]) => ym.startsWith(`${yearVal}-`))
            .reduce((sum, [, val]) => sum + (parseFloat(val) || 0), 0);
    } else if (filterType === 'day') {
        const dayVal = document.getElementById('select-day').value || "";
        const ym = dayVal.slice(0, 7);
        return parseFloat(map[ym] || 0);
    } else if (filterType === 'custom') {
        const rangePicker = document.getElementById('date-range-picker');
        if (rangePicker && rangePicker._flatpickr && rangePicker._flatpickr.selectedDates.length === 2) {
            const start = rangePicker._flatpickr.selectedDates[0];
            const end = rangePicker._flatpickr.selectedDates[1];
            const monthsInRange = new Set();
            const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
            const limit = new Date(end.getFullYear(), end.getMonth(), 1);
            while (cursor <= limit) {
                const y = cursor.getFullYear();
                const m = String(cursor.getMonth() + 1).padStart(2, '0');
                monthsInRange.add(`${y}-${m}`);
                cursor.setMonth(cursor.getMonth() + 1);
            }
            return Array.from(monthsInRange).reduce((sum, ym) => sum + (parseFloat(map[ym] || 0)), 0);
        }
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return parseFloat(map[ym] || 0);
    }

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return parseFloat(map[ym] || 0);
}

async function loadStoricoData() {
    try {
        await loadConfigSalaries();

        const querySnapshot = await getDocs(collection(db, "spese"));
        allExpenses = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const expUserId = data.userId || "";
            const owner = resolveExpenseOwner(data, currentUser);

            allExpenses.push({ 
                id: docSnap.id, 
                amount: parseFloat((data.importo || data.amount || 0).toString().replace(',', '.')) || 0,
                date: data.data || data.date || "",
                category: data.categoria || data.category || "Altro",
                userId: expUserId,
                owner: owner
            });
        });

        applyFilters();
    } catch (e) {
        console.error("Errore caricamento dati storico:", e);
    }
}

function applyFilters() {
    const chk1 = document.getElementById('chk-user1');
    const chk2 = document.getElementById('chk-user2');
    const showPaolo = chk1 ? chk1.checked : false;
    const showElena = chk2 ? chk2.checked : false;
    const filterType = document.getElementById('filter-type').value;
    const searchText = (document.getElementById('search-input').value || "").toLowerCase().trim();

    let filtered = allExpenses.filter(exp => {
        const matchesAccount = (exp.owner === 'elena' && showElena) || (exp.owner !== 'elena' && showPaolo);
        if (!matchesAccount) return false;

        if (searchText) {
            const matchCat = exp.category.toLowerCase().includes(searchText);
            const matchAmount = exp.amount.toString().includes(searchText);
            const matchDate = exp.date.includes(searchText);
            if (!matchCat && !matchAmount && !matchDate) return false;
        }
        return true;
    });

    filtered = filtered.filter(exp => {
        if (!exp.date) return false;
        const parts = exp.date.split('-');
        if (parts.length !== 3) return false;
        const expDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));

        if (filterType === 'day') {
            const dayVal = document.getElementById('select-day').value;
            return exp.date === dayVal;
        } else if (filterType === 'month') {
            const monthVal = document.getElementById('select-month').value;
            if (!monthVal) return true;
            const [selYear, selMonth] = monthVal.split('-');
            return parts[0] === selYear && parts[1] === selMonth;
        } else if (filterType === 'year') {
            const yearVal = document.getElementById('select-year').value;
            return parts[0] === yearVal;
        } else if (filterType === 'custom') {
            const rangePicker = document.getElementById('date-range-picker');
            if (rangePicker && rangePicker._flatpickr) {
                const dates = rangePicker._flatpickr.selectedDates;
                if (dates.length === 2) {
                    const start = new Date(dates[0]);
                    start.setHours(0,0,0,0);
                    const end = new Date(dates[1]);
                    end.setHours(23,59,59,999);
                    return expDate >= start && expDate <= end;
                }
            }
        }
        return true;
    });

    const totalExpenses = filtered.reduce((sum, e) => sum + e.amount, 0);
    let totalIncome = 0;
    if (showPaolo) totalIncome += getIncomeForSelection('paolo', filterType);
    if (showElena) totalIncome += getIncomeForSelection('elena', filterType);

    const balance = totalIncome - totalExpenses;

    document.getElementById('filter-total-val').innerText = `€ ${totalExpenses.toFixed(2)}`;
    document.getElementById('filter-income-val').innerText = `€ ${totalIncome.toFixed(2)}`;
    
    const balanceEl = document.getElementById('filter-balance');
    balanceEl.innerText = `€ ${balance.toFixed(2)}`;
    balanceEl.style.color = balance >= 0 ? '#28a745' : '#dc3545';

    const categoryMap = {};
    filtered.forEach(exp => {
        categoryMap[exp.category] = (categoryMap[exp.category] || 0) + exp.amount;
    });

    const categoryListEl = document.getElementById('category-totals-list');
    categoryListEl.innerHTML = '';
    
    const sortedCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
    if (sortedCategories.length === 0) {
        categoryListEl.innerHTML = '<div style="font-size: 13px; color: #888; padding: 5px;">Nessuna spesa trovata per i filtri selezionati.</div>';
    } else {
        sortedCategories.forEach(([cat, amount]) => {
            categoryListEl.innerHTML += `
                <div class="metric-box-row" style="padding: 6px 10px; margin-bottom: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">
                    <span style="font-size: 13px; font-weight: 500;">${cat}</span>
                    <strong style="font-size: 13px;">€ ${amount.toFixed(2)}</strong>
                </div>
            `;
        });
    }

    const expensesListEl = document.getElementById('filtered-expenses-list');
    expensesListEl.innerHTML = '';

    if (filtered.length === 0) {
        expensesListEl.innerHTML = '<div style="font-size: 13px; color: #888; text-align: center; padding: 10px;">Nessun movimento trovato.</div>';
        return;
    }

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(exp => {
        const parts = exp.date.split('-');
        const dateEu = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : exp.date;
        
        expensesListEl.innerHTML += `
            <div class="expense-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid #eee;">
                <div class="item-info">
                    <span class="item-title" style="font-weight: bold; font-size: 14px; display: block;">${exp.category}</span>
                    <span class="item-sub" style="font-size: 12px; color: #666;">${dateEu} (${exp.owner.toUpperCase()})</span>
                </div>
                <div class="item-actions" style="display: flex; align-items: center; gap: 6px;">
                    <strong style="margin-right:6px; font-size: 14px; color: #dc3545;">€ ${exp.amount.toFixed(2)}</strong>
                    <button class="btn-edit" onclick="window.editExpenseFromHistory('${exp.id}', ${exp.amount}, '${exp.date}', '${exp.category}')" style="background: #ffc107; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">✏️</button>
                    <button class="btn-danger" onclick="window.deleteExpenseFromHistory('${exp.id}')" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">🗑️</button>
                </div>
            </div>
        `;
    });
}

window.editExpenseFromHistory = function(id, amount, date, category) {
    localStorage.setItem('edit_id', id);
    localStorage.setItem('edit_amount', amount);
    localStorage.setItem('edit_date', date);
    localStorage.setItem('edit_category', category);

    window.parent.postMessage({ type: 'EDIT_EXPENSE_FROM_HISTORY', id }, '*');
};

window.deleteExpenseFromHistory = async function(id) {
    if (confirm("Vuoi cancellare questa spesa?")) {
        try {
            await deleteDoc(doc(db, "spese", id));
            await loadStoricoData();
        } catch (e) {
            console.error("Errore durante la cancellazione:", e);
            alert("Errore durante la cancellazione della spesa.");
        }
    }
};
