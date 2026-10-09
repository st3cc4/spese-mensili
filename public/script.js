// --- CONFIGURAZIONE FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyAXvgC2P16ScZb5SCynIY2LF7oqbGbSRWo",
    authDomain: "spese-mensili-58c04.firebaseapp.com",
    databaseURL: "https://spese-mensili-58c04-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "spese-mensili-58c04",
    storageBucket: "spese-mensili-58c04.firebasestorage.app",
    messagingSenderId: "835516006997",
    appId: "1:835516006997:web:7a74ff965ab4cd59d88adc"
};

// Inizializza Firebase (versione compatibile)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- VARIABILI GLOBALI E DATI DI BASE ---
let speseData = [];
let categorieData = ["Alimentari", "Casa", "Svago", "Trasporti", "Bollette", "Altro"];
let stipendioConfig = {
    importo: 0,
    prossimaData: ""
};

// All'avvio dell'app
window.onload = function() {
    // Imposta la data odierna come default nel form spesa
    const oggiStr = new Date().toISOString().split('T')[0];
    document.getElementById('dataSpesa').value = oggiStr;

    // Carica dati da Firebase
    caricaDatiDaFirebase();
};

// --- GESTIONE SCHEDE (TABS) ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById('tab-' + tabId).classList.add('active');
    event.currentTarget.classList.add('active');

    if(tabId === 'stats') {
        applicaFiltri();
    }
}

// --- SINCRONIZZAZIONE FIREBASE ---
function caricaDatiDaFirebase() {
    db.ref('gestione_spese_stecca').on('value', (snapshot) => {
        const data = snapshot.val();
        if(data) {
            speseData = data.spese ? Object.values(data.spese) : [];
            if(data.categorie) categorieData = data.categorie;
            if(data.stipendioConfig) stipendioConfig = data.stipendioConfig;
        }
        
        // Aggiorna interfaccia
        popolaSelezioniCategorie();
        aggiornaCampiConfigurazioneUI();
        calcolaStatistichePrincipali();
        mostraSpeseOggi();
        applicaFiltri();
    });
}

function salvaDatiSuFirebase() {
    db.ref('gestione_spese_stecca').set({
        spese: speseData,
        categorie: categorieData,
        stipendioConfig: stipendioConfig
    });
}

// --- IMPOSTAZIONI STIPENDIO E CALCOLI (10 DEL MESE) ---
function salvaImpostazioniStipendio() {
    stipendioConfig.importo = parseFloat(document.getElementById('stipendioImporto').value) || 0;
    stipendioConfig.prossimaData = document.getElementById('prossimoStipendioData').value;
    salvaDatiSuFirebase();
    calcolaStatistichePrincipali();
}

function aggiornaCampiConfigurazioneUI() {
    if(stipendioConfig.importo) {
        document.getElementById('stipendioImporto').value = stipendioConfig.importo;
    }
    if(stipendioConfig.prossimaData) {
        document.getElementById('prossimoStipendioData').value = stipendioConfig.prossimaData;
    }
}

function calcolaStatistichePrincipali() {
    if(!stipendioConfig.prossimaData || !stipendioConfig.importo) {
        document.getElementById('giorniMancanti').innerText = "-";
        document.getElementById('residuoStipendio').innerText = "0.00 €";
        document.getElementById('budgetGiornaliero').innerText = "0.00 €";
        document.getElementById('spesoOggi').innerText = "0.00 €";
        return;
    }

    const oggi = new Date();
    oggi.setHours(0,0,0,0);
    const dataProssima = new Date(stipendioConfig.prossimaData);
    dataProssima.setHours(0,0,0,0);

    // Calcolo giorni mancanti
    const diffTime = dataProssima - oggi;
    const giorniMancanti = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    document.getElementById('giorniMancanti').innerText = giorniMancanti > 0 ? giorniMancanti : 0;

    // Calcoliamo il periodo contabile in corso (dal 10 scorso al 10 corrente/prossimo)
    let inizioPeriodo = new Date(dataProssima);
    inizioPeriodo.setMonth(inizioPeriodo.getMonth() - 1);

    // Somma spese effettuate nel periodo corrente (dal 10 scorso al 10 prossimo)
    let spesoNelPeriodo = 0;
    let spesoOggiTotale = 0;
    const oggiStringa = oggi.toISOString().split('T')[0];

    speseData.forEach(spesa => {
        const dSpesa = new Date(spesa.data);
        dSpesa.setHours(0,0,0,0);

        if(dSpesa >= inizioPeriodo && dSpesa < dataProssima) {
            spesoNelPeriodo += parseFloat(spesa.importo);
        }

        if(spesa.data === oggiStringa) {
            spesoOggiTotale += parseFloat(spesa.importo);
        }
    });

    document.getElementById('spesoOggi').innerText = spesoOggiTotale.toFixed(2) + ' €';

    const residuo = stipendioConfig.importo - spesoNelPeriodo;
    document.getElementById('residuoStipendio').innerText = residuo.toFixed(2) + ' €';

    // Budget giornaliero dal residuo sui giorni mancanti
    if(giorniMancanti > 0) {
        const budgetG = residuo / giorniMancanti;
        document.getElementById('budgetGiornaliero').innerText = budgetG.toFixed(2) + ' €';
    } else {
        document.getElementById('budgetGiornaliero').innerText = "0.00 €";
    }
}

// --- GESTIONE CATEGORIE ---
function popolaSelezioniCategorie() {
    const selectSpesa = document.getElementById('categoriaSpesa');
    const selectFiltro = document.getElementById('filtroCategoria');
    
    let optionsHtml = '<option value="">-- Seleziona Categoria --</option>';
    let optionsFiltroHtml = '<option value="">Tutte le categorie</option>';

    categorieData.forEach(cat => {
        optionsHtml += `<option value="${cat}">${cat}</option>`;
        optionsFiltroHtml += `<option value="${cat}">${cat}</option>`;
    });

    selectSpesa.innerHTML = optionsHtml;
    selectFiltro.innerHTML = optionsFiltroHtml;
}

function aggiungiCategoria() {
    const nuovaCat = document.getElementById('nuovaCategoriaInput').value.trim();
    if(nuovaCat && !categorieData.includes(nuovaCat)) {
        categorieData.push(nuovaCat);
        document.getElementById('nuovaCategoriaInput').value = '';
        salvaDatiSuFirebase();
    } else {
        alert("Inserisci una categoria valida o non duplicata.");
    }
}

function eliminaCategoriaSelezionata() {
    const select = document.getElementById('categoriaSpesa');
    const catScelta = select.value;
    if(!catScelta) {
        alert("Seleziona prima una categoria dal menu a tendina della spesa.");
        return;
    }
    if(confirm(`Vuoi davvero eliminare la categoria "${catScelta}"?`)) {
        categorieData = categorieData.filter(c => c !== catScelta);
        salvaDatiSuFirebase();
    }
}

// --- GESTIONE SPESE ---
function aggiungiSpesa(event) {
    event.preventDefault();
    const importo = parseFloat(document.getElementById('importoSpesa').value);
    const categoria = document.getElementById('categoriaSpesa').value;
    const data = document.getElementById('dataSpesa').value;

    const nuovaSpesa = {
        id: Date.now(),
        importo: importo,
        categoria: categoria,
        data: data
    };

    speseData.push(nuovaSpesa);
    salvaDatiSuFirebase();

    // Reset form importo
    document.getElementById('importoSpesa').value = '';
}

function eliminaSpesa(id) {
    if(confirm("Vuoi eliminare questa spesa?")) {
        speseData = speseData.filter(s => s.id !== id);
        salvaDatiSuFirebase();
    }
}

function mostraSpeseOggi() {
    const oggiStr = new Date().toISOString().split('T')[0];
    const tbody = document.querySelector('#tabellaSpeseOggi tbody');
    tbody.innerHTML = '';

    const speseOggi = speseData.filter(s => s.data === oggiStr);

    if(speseOggi.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Nessuna spesa registrata oggi.</td></tr>`;
        return;
    }

    speseOggi.forEach(s => {
        tbody.innerHTML += `
            <tr>
                <td>${s.data}</td>
                <td>${s.categoria}</td>
                <td>${s.importo.toFixed(2)} €</td>
                <td><button class="btn-danger" onclick="eliminaSpesa(${s.id})">Elimina</button></td>
            </tr>
        `;
    });
}

// --- STATISTICHE E FILTRI AVANZATI ---
document.getElementById('filtroTipoPeriodo').addEventListener('change', function() {
    const box = document.getElementById('boxDatePersonalizzate');
    if(this.value === 'personalizzato') {
        box.style.display = 'flex';
    } else {
        box.style.display = 'none';
    }
});

function applicaFiltri() {
    const tipoPeriodo = document.getElementById('filtroTipoPeriodo').value;
    const categoriaFiltro = document.getElementById('filtroCategoria').value;
    const testoFiltro = document.getElementById('filtroTesto').value.toLowerCase();
    
    const dataDa = document.getElementById('filtroDataDa').value;
    const dataA = document.getElementById('filtroDataA').value;

    const oggi = new Date();
    oggi.setHours(0,0,0,0);

    let filtrate = speseData.filter(s => {
        const dSpesa = new Date(s.data);
        dSpesa.setHours(0,0,0,0);

        // Filtro Periodo
        if(tipoPeriodo === 'oggi') {
            const oggiStr = oggi.toISOString().split('T')[0];
            if(s.data !== oggiStr) return false;
        } else if(tipoPeriodo === 'settimana') {
            let primoGiorno = new Date(oggi);
            let day = primoGiorno.getDay();
            let diff = primoGiorno.getDate() - day + (day === 0 ? -6 : 1);
            let inizioSettimana = new Date(primoGiorno.setDate(diff));
            if(dSpesa < inizioSettimana || dSpesa > oggi) return false;
        } else if(tipoPeriodo === 'mese') {
            let fineMese = stipendioConfig.prossimaData ? new Date(stipendioConfig.prossimaData) : new Date(oggi.getFullYear(), oggi.getMonth() + 1, 10);
            let inizioMese = new Date(fineMese);
            inizioMese.setMonth(inizioMese.getMonth() - 1);
            if(dSpesa < inizioMese || dSpesa >= fineMese) return false;
        } else if(tipoPeriodo === 'anno') {
            if(dSpesa.getFullYear() !== oggi.getFullYear()) return false;
        } else if(tipoPeriodo === 'personalizzato') {
            if(dataDa && s.data < dataDa) return false;
            if(dataA && s.data > dataA) return false;
        }

        // Filtro Categoria
        if(categoriaFiltro && s.categoria !== categoriaFiltro) return false;

        // Filtro Testo / Importo
        if(testoFiltro) {
            const matchCategoria = s.categoria.toLowerCase().includes(testoFiltro);
            const matchImporto = s.importo.toString().includes(testoFiltro);
            const matchData = s.data.includes(testoFiltro);
            if(!matchCategoria && !matchImporto && !matchData) return false;
        }

        return true;
    });

    // Ordina per data decrescente
    filtrate.sort((a, b) => new Date(b.data) - new Date(a.data));

    // Calcola Totale Filtrato
    let totaleGenerale = 0;
    let TotalePerCat = {};

    filtrate.forEach(s => {
        totaleGenerale += parseFloat(s.importo);
        if(!TotalePerCat[s.categoria]) {
            TotalePerCat[s.categoria] = 0;
        }
        TotalePerCat[s.categoria] += parseFloat(s.importo);
    });

    document.getElementById('totaleFiltrato').innerText = totaleGenerale.toFixed(2) + ' €';

    // Mostra Totali per Categoria
    const catContainer = document.getElementById('totalePerCategoriaContainer');
    catContainer.innerHTML = '';
    if(Object.keys(TotalePerCat).length === 0) {
        catContainer.innerHTML = `<span style="color: #7f8c8d;">Nessun dato per le categorie selezionate.</span>`;
    } else {
        for(let cat in TotalePerCat) {
            catContainer.innerHTML += `<div class="cat-badge"><strong>${cat}:</strong> ${TotalePerCat[cat].toFixed(2)} €</div>`;
        }
    }

    // Mostra Tabella Filtrata
    const tbody = document.querySelector('#tabellaSpeseFiltrate tbody');
    tbody.innerHTML = '';

    if(filtrate.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Nessuna spesa trovata con i filtri correnti.</td></tr>`;
        return;
    }

    filtrate.forEach(s => {
        tbody.innerHTML += `
            <tr>
                <td>${s.data}</td>
                <td>${s.categoria}</td>
                <td>${s.importo.toFixed(2)} €</td>
                <td><button class="btn-danger" onclick="eliminaSpesa(${s.id})">Elimina</button></td>
            </tr>
        `;
    });
}
