import { auth, db, onAuthStateChanged, collection, getDocs, deleteDoc, doc } from "../firebase-config.js";

let currentUser = null;
let allExpenses = [];
let paoloConfig = { base: 0, extra: 0, uid: "" };
let elenaConfig = { base: 0, extra: 0, uid: "" };
let selectedCustomFrom = null;
let selectedCustomTo = null;

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

flatpickr("#date-range-picker", {
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

        await loadAllConfigsAndExpenses();
    } else {
        window.location.href = "../index.html";
    }
});

async function loadAllConfigsAndExpenses() {
    paoloConfig = { base: 0, extra: 0, uid: "" };
    elenaConfig = { base: 0, extra: 0, uid: "" };

    try {
        // Legge tutte le configurazioni salvate in "config" per associare Paolo ed Elena
        const configSnapshot = await getDocs(collection(db, "config"));
        configSnapshot.forEach((docSnap) => {
            if (docSnap.id === "impostazioni") return;
            const data = docSnap.data();
            const baseVal = parseFloat((data.stipendio || 0).toString().replace(',', '.')) || 0;
            const extraVal = parseFloat((data.extra || 0).toString().replace(',', '.')) || 0;

            // Riconosce l'account tramite le categorie dedicate o tramite l'utente attualmente loggato
            const isDocElena = Array.isArray(data.categorie_elena) || 
                               ((currentUser.email || "").toLowerCase().includes("ele") && docSnap.id === currentUser.uid);

            if (isDocElena) {
                elenaConfig = { base: baseVal, extra: extraVal, uid: docSnap.id };
            } else {
                paoloConfig = { base: baseVal, extra: extraVal, uid: docSnap.id };
            }
        });
    } catch (e) {
        console.error("Errore caricamento configurazioni:", e);
    }

    try {
        const querySnapshot = await getDocs(collection(db, "spese"));
        allExpenses = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const expUserId = data.userId || "";
            const owner = (elenaConfig.uid && expUserId === elenaConfig.uid) ? "elena" : "paolo";

            allExpenses.push({ 
                id: docSnap.id, 
                amount: parseFloat((data.importo || data.amount || 0).toString().replace(',', '.')) || 0,
                date: data.data || data.date,
                category: data.categoria || data.category,
                userId: expUserId,
                owner: owner
            });
        });
    } catch (e) {
        console.error("Errore caricamento spese:", e);
    }

    populateYearsDropdown();
    setupSearchAutocomplete();
    applyFilter();
}

function populateYearsDropdown() {
    const yearsSet = new Set();
    allExpenses.forEach(e => {
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
    allExpenses.forEach(e => {
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

    searchInput.onfocus = () => renderSearchDropdown(suggestions);

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

function parseLocalDate(dateStr) {
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
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
        from = parseLocalDate(dayVal); from.setHours(0, 0, 0, 0);
        to = parseLocalDate(dayVal); to.setHours(23, 59, 59, 999);
    } else if (type === 'month') {
        const monthVal = document.getElementById('select-month').value;
        if (!monthVal) return;
        const [y, m] = monthVal.split('-');
        from = new Date(parseInt(y), parseInt(m) - 1, 1, 0, 0, 0, 0);
        to = new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999);
    } else if (type === 'week') {
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
        from = new Date(ISOweekStart); from.setHours(0, 0, 0, 0);
        to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999);
    } else if (type === 'year') {
        const yearNum = parseInt(document.getElementById('select-year').value);
        if (!yearNum) return;
        from = new Date(yearNum, 0, 1, 0, 0, 0, 0);
        to = new Date(yearNum, 11, 31, 23, 59, 59, 999);
    } else if (type === 'custom') {
        if (!selectedCustomFrom || !selectedCustomTo) return;
        from = new Date(selectedCustomFrom); from.setHours(0, 0, 0, 0);
        to = new Date(selectedCustomTo); to.setHours(23, 59, 59, 999);
    }

    const finalFiltered = allExpenses.filter(e => {
        if (!e.date) return false;
        
        // Filtro account
        if (e.owner === "paolo" && !chkPaolo) return false;
        if (e.owner === "elena" && !chkElena) return false;

        // Filtro data
        const d = parseLocalDate(e.date);
        if (d < from || d > to) return false;

        // Filtro testo
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
    document.getElementById('filter-total-val').innerText = `€ ${totalSpent.toFixed(2)}`;

    let totalIncome = 0;
    if (chkPaolo) {
        totalIncome += (paoloConfig.base || 0) + (paoloConfig.extra || 0);
    }
    if (chkElena) {
        totalIncome += (elenaConfig.base || 0) + (elenaConfig.extra || 0);
    }
    document.getElementById('filter-income-val').innerText = `€ ${totalIncome.toFixed(2)}`;

    const netBalance = totalIncome - totalSpent;
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
        catContainer.innerHTML = '<div style="font-size: 13px; color: #888; padding: 6px;">Nessuna spesa trovata.</div>';
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
        listContainer.innerHTML = '<div style="font-size: 13px; color: #888; text-align: center; padding: 10px;">Nessun dettaglio spesa trovato.</div>';
        return;
    }

    const bothAccounts = chkPaolo && chkElena;
    list.sort((a, b) => parseLocalDate(b.date) - parseLocalDate(a.date)).forEach(exp => {
        const dateEu = formatDateToEu(exp.date);
        const ownerBadge = bothAccounts ? ` • ${exp.owner === 'elena' ? 'Elena' : 'Paolo'}` : '';
        listContainer.innerHTML += `
            <div class="expense-item">
                <div class="item-info">
                    <span class="item-title">${exp.category || "Altro"}</span>
                    <span class="item-sub">${dateEu}${ownerBadge}</span>
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
            await loadAllConfigsAndExpenses();
        } catch (err) {
            alert("Errore durante l'eliminazione: " + err.message);
        }
    }
};
