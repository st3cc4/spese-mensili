import { auth, db, onAuthStateChanged, collection, getDocs, deleteDoc, doc, getDoc } from "../firebase-config.js";

let currentUser = null;
let expenses = [];
let rangePickerInstance = null;
let selectedCustomFrom = null;
let selectedCustomTo = null;

// Tabella dei tuoi stipendi reali 2026 (Paolo)
const paoloSalaries2026 = {
    "2026-01": 1733.19,
    "2026-02": 1895.23,
    "2026-03": 1163.78,
    "2026-04": 1327.81,
    "2026-05": 1562.19,
    "2026-06": 1149.45,
    "2026-07": 2864.79,
    "2026-08": 1369.93,
    "2026-09": 1512.63,
    "2026-10": 1415.57 + 139.20,
    "2026-11": 1473.15 + 60,
    "2026-12": 0.00
};

function getISOWeekString(date) {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    const weekNumber = 1 + Math.round((firstThursday - target.valueOf()) / 604800000);
    const year = target.getFullYear();
    const weekStr = String(weekNumber).padStart(2, '0');
    return `${year}-W${weekStr}`;
}

const now = new Date();
const curYear = now.getFullYear();
const curMonth = String(now.getMonth() + 1).padStart(2, '0');
const curDay = String(now.getDate()).padStart(2, '0');

document.getElementById('select-day').value = `${curYear}-${curMonth}-${curDay}`;
document.getElementById('select-month').value = `${curYear}-${curMonth}`;
document.getElementById('select-week').value = getISOWeekString(now);

rangePickerInstance = flatpickr("#date-range-picker", {
    mode: "range",
    locale: "it",
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d/m/Y",
    onChange: function(selectedDates) {
        if (selectedDates.length === 2) {
            selectedCustomFrom = selectedDates[0];
            selectedCustomTo = selectedDates[1];
            applyFilter();
        }
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const email = (user.email || "").toLowerCase();
        const isUserElena = email.includes("ele");
        
        document.getElementById('chk-user1').checked = !isUserElena;
        document.getElementById('chk-user2').checked = isUserElena;

        await loadConfigAndExpenses();
    } else {
        window.location.href = "../index.html";
    }
});

let userSalaryConfig = { base: 0, extra: 0 };
let elenaSalaryConfig = { base: 0, extra: 0 };

async function loadConfigAndExpenses() {
    try {
        // Carica configurazione utente corrente
        const userDocRef = doc(db, "config", currentUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            userSalaryConfig.base = parseFloat((data.stipendio || 0).toString().replace(',', '.')) || 0;
            userSalaryConfig.extra = parseFloat((data.extra || 0).toString().replace(',', '.')) || 0;
        }

        // Se l'utente loggato è Paolo, proviamo a recuperare anche i dati di Elena da Firebase se salvati con il suo UID specifico
        // (o viceversa)
    } catch (e) {
        console.error("Errore caricamento stipendio:", e);
    }

    const q = collection(db, "spese");
    const querySnapshot = await getDocs(q);
    expenses = [];
    const loggedIsElena = (currentUser.email || "").toLowerCase().includes("ele");

    querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const expUserId = data.userId || "";
        
        const belongsToUser = loggedIsElena 
            ? (expUserId === currentUser.uid)
            : (expUserId === currentUser.uid || expUserId === "");

        if (belongsToUser) {
            expenses.push({ 
                id: docSnap.id, 
                amount: parseFloat((data.importo || data.amount || 0).toString().replace(',', '.')) || 0,
                date: data.data || data.date,
                category: data.categoria || data.category,
                userId: expUserId 
            });
        }
    });

    populateYearsDropdown();
    setupSearchAutocomplete();
    applyFilter();
}

function populateYearsDropdown() {
    const yearsSet = new Set();
    expenses.forEach(e => {
        if (e.date) {
            const y = new Date(e.date).getFullYear();
            if (!isNaN(y)) yearsSet.add(y);
        }
    });
    yearsSet.add(curYear);

    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
    const yearSelect = document.getElementById('select-year');
    yearSelect.innerHTML = '';
    sortedYears.forEach(y => {
        yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
    });
}

function setupSearchAutocomplete() {
    const searchInput = document.getElementById('search-input');
    const searchDropdown = document.getElementById('search-dropdown');
    if (!searchInput || !searchDropdown) return;

    const suggestionsSet = new Set();
    expenses.forEach(e => {
        if (e.category) suggestionsSet.add(e.category);
    });
    const suggestions = Array.from(suggestionsSet).sort();

    function renderSearchDropdown(list) {
        searchDropdown.innerHTML = '';
        if (list.length === 0) {
            searchDropdown.classList.add('hidden');
            return;
        }
        list.forEach(itemText => {
            const item = document.createElement('div');
            item.className = 'search-suggestion-item';
            item.innerText = itemText;
            item.onclick = () => {
                searchInput.value = itemText;
                searchDropdown.classList.add('hidden');
                applyFilter();
            };
            searchDropdown.appendChild(item);
        });
        searchDropdown.classList.remove('hidden');
    }

    searchInput.onfocus = () => {
        renderSearchDropdown(suggestions);
    };

    searchInput.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        const filtered = suggestions.filter(s => s.toLowerCase().includes(val));
        renderSearchDropdown(filtered);
        applyFilter();
    };

    document.onclick = (e) => {
        if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
            searchDropdown.classList.add('hidden');
        }
    };
}

document.getElementById('filter-type').addEventListener('change', (e) => {
    const val = e.target.value;
    document.getElementById('selector-day-container').classList.add('hidden');
    document.getElementById('selector-month-container').classList.add('hidden');
    document.getElementById('selector-week-container').classList.add('hidden');
    document.getElementById('selector-year-container').classList.add('hidden');
    document.getElementById('custom-date-container').classList.add('hidden');

    if (val === 'day') {
        document.getElementById('selector-day-container').classList.remove('hidden');
    } else if (val === 'month') {
        document.getElementById('selector-month-container').classList.remove('hidden');
    } else if (val === 'week') {
        document.getElementById('selector-week-container').classList.remove('hidden');
    } else if (val === 'year') {
        document.getElementById('selector-year-container').classList.remove('hidden');
    } else if (val === 'custom') {
        document.getElementById('custom-date-container').classList.remove('hidden');
    }
    applyFilter();
});

document.getElementById('select-day').addEventListener('change', applyFilter);
document.getElementById('select-month').addEventListener('change', applyFilter);
document.getElementById('select-week').addEventListener('input', applyFilter);
document.getElementById('select-year').addEventListener('change', applyFilter);
document.getElementById('chk-user1').addEventListener('change', applyFilter);
document.getElementById('chk-user2').addEventListener('change', applyFilter);

function formatDateToEu(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function applyFilter() {
    const chkPaolo = document.getElementById('chk-user1').checked;
    const chkElena = document.getElementById('chk-user2').checked;
    const type = document.getElementById('filter-type').value;
    const searchText = document.getElementById('search-input').value.toLowerCase().trim();
    let from, to;

    if (type === 'day') {
        const dayVal = document.getElementById('select-day').value;
        if (!dayVal) return;
        from = new Date(dayVal); from.setHours(0,0,0,0);
        to = new Date(dayVal); to.setHours(23,59,59,999);
    }
    else if (type === 'month') {
        const monthVal = document.getElementById('select-month').value;
        if (!monthVal) return;
        const [y, m] = monthVal.split('-');
        from = new Date(parseInt(y), parseInt(m) - 1, 1);
        to = new Date(parseInt(y), parseInt(m), 0, 23, 59, 59);
    } 
    else if (type === 'week') {
        const weekVal = document.getElementById('select-week').value;
        if (!weekVal) return;
        const [yearStr, weekStr] = weekVal.split('-W');
        const yearNum = parseInt(yearStr);
        const weekNum = parseInt(weekStr);
        const simple = new Date(yearNum, 0, 1 + (weekNum - 1) * 7);
        const dow = simple.getDay();
        const ISOweekStart = simple;
        if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
        else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        from = new Date(ISOweekStart); from.setHours(0,0,0,0);
        to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23,59,59,999);
    } 
    else if (type === 'year') {
        const yearNum = parseInt(document.getElementById('select-year').value);
        if (!yearNum) return;
        from = new Date(yearNum, 0, 1);
        to = new Date(yearNum, 11, 31, 23, 59, 59);
    } 
    else if (type === 'custom') {
        if (!selectedCustomFrom || !selectedCustomTo) return;
        from = new Date(selectedCustomFrom); from.setHours(0,0,0,0);
        to = new Date(selectedCustomTo); to.setHours(23,59,59,999);
    }

    const finalFiltered = expenses.filter(e => {
        const d = new Date(e.date);
        const matchDate = (d >= from && d <= to);
        if (!matchDate) return false;

        if (searchText) {
            const catMatch = (e.category || "").toLowerCase().includes(searchText);
            const amountMatch = e.amount.toFixed(2).includes(searchText) || e.amount.toString().includes(searchText);
            if (!catMatch && !amountMatch) return false;
        }
        return true;
    });

    renderResults(finalFiltered, chkPaolo, chkElena);
}

function renderResults(list, chkPaolo, chkElena) {
    const totalSpent = list.reduce((sum, e) => sum + e.amount, 0);
    document.getElementById('filter-total-val').innerText = totalSpent.toFixed(2);

    const loggedIsElena = (currentUser.email || "").toLowerCase().includes("ele");
    let totalIncome = 0;

    // Calcolo entrate in base all'account spuntato nello Storico
    if (chkPaolo) {
        let paoloIncome = 0;
        const nowTime = new Date();
        nowTime.setHours(23,59,59,999);
        Object.entries(paoloSalaries2026).forEach(([mKey, amount]) => {
            const [yStr, mStr] = mKey.split('-');
            const monthDate = new Date(parseInt(yStr), parseInt(mStr) - 1, 1);
            if (monthDate <= nowTime) {
                paoloIncome += (amount || 0);
            }
        });
        totalIncome += paoloIncome;
    }

    if (chkElena) {
        // Prende lo stipendio configurato da Elena (es. 2000 €)
        const elenaIncome = (userSalaryConfig.base || 0) + (userSalaryConfig.extra || 0);
        totalIncome += elenaIncome;
    }

    document.getElementById('filter-income-val').innerText = totalIncome.toFixed(2);

    const totalSpentYearAll = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netBalance = totalIncome - totalSpentYearAll;

    const balanceElement = document.getElementById('filter-balance');
    balanceElement.innerText = `€ ${netBalance.toFixed(2)}`;
    balanceElement.style.color = netBalance >= 0 ? '#28a745' : '#dc3545';

    const catTotals = {};
    list.forEach(e => {
        const cat = e.category || "Altro";
        catTotals[cat] = (catTotals[cat] || 0) + e.amount;
    });

    const catContainer = document.getElementById('category-totals-list');
    catContainer.innerHTML = '';
    
    if (Object.keys(catTotals).length === 0) {
        catContainer.innerHTML = '<div style="font-size: 12px; color: #888; padding: 6px;">Nessuna spesa trovata.</div>';
    } else {
        const sortedCategories = Object.keys(catTotals).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
        sortedCategories.forEach(cat => {
            const sum = catTotals[cat];
            catContainer.innerHTML += `
                <div class="expense-item">
                    <span class="item-title">${cat}</span>
                    <strong>€ ${sum.toFixed(2)}</strong>
                </div>
            `;
        });
    }

    const listContainer = document.getElementById('filtered-expenses-list');
    listContainer.innerHTML = '';

    if (list.length === 0) {
        listContainer.innerHTML = '<div style="font-size: 12px; color: #888; text-align: center; padding: 10px;">Nessun dettaglio spesa trovato.</div>';
        return;
    }

    list.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(exp => {
        const dateEu = formatDateToEu(exp.date);
        listContainer.innerHTML += `
            <div class="expense-item">
                <div class="item-info">
                    <span class="item-title">${exp.category || "Altro"}</span>
                    <span class="item-sub">${dateEu}</span>
                </div>
                <div class="item-actions">
                    <strong style="margin-right:8px;">€ ${parseFloat(exp.amount).toFixed(2)}</strong>
                    <button class="btn-edit" onclick="editExpenseRedirect('${exp.id}', '${exp.amount}', '${exp.date}', '${exp.category}')">✏️</button>
                    <button class="btn-danger" onclick="deleteExpenseFromHistory('${exp.id}')">🗑️</button>
                </div>
            </div>
        `;
    });
}

window.editExpenseRedirect = (id, amount, date, category) => {
    localStorage.setItem('edit_id', id);
    localStorage.setItem('edit_amount', amount);
    localStorage.setItem('edit_date', date);
    localStorage.setItem('edit_category', category);
    window.location.href = "../index.html";
};

window.deleteExpenseFromHistory = async (id) => {
    if (confirm("Vuoi cancellare questa spesa?")) {
        try {
            await deleteDoc(doc(db, "spese", id));
            await loadConfigAndExpenses();
        } catch (err) {
            alert("Errore durante l'eliminazione: " + err.message);
        }
    }
};
