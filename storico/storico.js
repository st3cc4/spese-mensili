import { 
    auth, db, onAuthStateChanged, signOut, 
    collection, getDocs, doc, deleteDoc 
} from "../firebase-config.js";

let allExpenses = [];
let currentUser = null;

// Ascolta i messaggi inviati dalla Dashboard principale
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'REFRESH_STORICO') {
        loadStoricoData();
    }
});

// Funzione richiamata dalla Dashboard quando si apre la scheda Storico
window.refreshStoricoData = function() {
    loadStoricoData();
};

document.addEventListener('DOMContentLoaded', () => {
    // Inizializza i filtri al mese corrente
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    const monthInput = document.getElementById('select-month');
    if (monthInput) {
        monthInput.value = `${year}-${month}`;
    }

    // Imposta anno corrente nel selettore anno
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

    // Imposta giorno corrente
    const dayInput = document.getElementById('select-day');
    if (dayInput) {
        const d = String(now.getDate()).padStart(2, '0');
        dayInput.value = `${year}-${month}-${d}`;
    }

    // Inizializza flatpickr per intervallo personalizzato
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

    // Ascoltatori per i cambi tipo di filtro
    const filterType = document.getElementById('filter-type');
    if (filterType) {
        filterType.addEventListener('change', () => {
            updateFilterVisibility();
            applyFilters();
        });
    }

    // Ascoltatori per tutti i campi di input e filtri
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

    // Logout dallo storico
    const logoutBtnStorico = document.getElementById('logout-btn-storico');
    if (logoutBtnStorico) {
        logoutBtnStorico.addEventListener('click', () => signOut(auth));
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
        const chk1 = document.getElementById('chk-user1');
        const chk2 = document.getElementById('chk-user2');
        if (chk1 && chk2 && !chk1.checked && !chk2.checked) {
            chk1.checked = true;
            chk2.checked = true;
        }
        await loadStoricoData();
    } else {
        currentUser = null;
        allExpenses = [];
        applyFilters();
    }
});

async function loadStoricoData() {
    try {
        const querySnapshot = await getDocs(collection(db, "spese"));
        allExpenses = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const expUserId = data.userId || "";
            
            let owner = "paolo";
            if (data.owner) {
                owner = data.owner.toLowerCase();
            } else if (expUserId) {
                if (expUserId === currentUser?.uid && isUserElenaByEmail(currentUser?.email)) {
                    owner = "elena";
                }
            }

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
    const showPaolo = document.getElementById('chk-user1').checked;
    const showElena = document.getElementById('chk-user2').checked;
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
    if (showPaolo) totalIncome += 1500;
    if (showElena) totalIncome += 1500;

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
