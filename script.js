// --- CONFIGURAZIONE FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyAXvgC2P16ScZb5SCynIY2LF70oqbGbSRWo",
    authDomain: "spese-mensili-58c04.firebaseapp.com",
    databaseURL: "https://spese-mensili-58c04-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "spese-mensili-58c04",
    storageBucket: "spese-mensili-58c04.firebasestorage.app",
    messagingSenderId: "83551600697",
    appId: "1:83551600697:web:7a74ff965ab4cd59d88adc"
};

// Inizializzazione Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Variabili globali per i dati locali
let spese = [];
let categorie = ["Alimentari", "Casa", "Svago", "Trasporti", "Bollette", "Altro"];
let stipendioMese = 1500.00; // Valore di default modificabile

// Al caricamento della pagina
window.onload = function() {
    // Imposta la data odierna nel campo input spesa
    const oggi = new Date().toISOString().split('T')[0];
    document.getElementById('data-spesa').value = oggi;
    
    caricaDatiDaFirebase();
};

// --- GESTIONE SCHEDE (TABS) ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    if(tabId === 'dashboard') {
        document.getElementById('dashboard-tab').classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
    } else {
        document.getElementById('stats-tab').classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        applicaFiltri(); // Aggiorna le statistiche all'apertura
    }
}

// --- LOGICA DEL CICLO STIPENDIO (Dal 10 al 10) ---
function calcolaPeriodoStipendioCorrente() {
    const adesso = new Date();
    let anno = adesso.getFullYear();
    let mese = adesso.getMonth(); // 0-11
    let giorno = adesso.getDate();

    let inizioPeriodo, finePeriodo;

    if (giorno >= 10) {
        // Dal 10 di questo mese al 10 del mese prossimo
        inizioPeriodo = new Date(anno, mese, 10);
        finePeriodo = new Date(anno, mese + 1, 10);
    } else {
        // Dal 10 del mese scorso al 10 di questo mese
        inizioPeriodo = new Date(anno, mese - 1, 10);
        finePeriodo = new Date(anno, mese, 10);
    }

    return { inizio: inizioPeriodo, fine: finePeriodo };
}

// --- COMUNICAZIONE CON FIREBASE ---
function caricaDatiDaFirebase() {
    db.collection("config").doc("impostazioni").get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            if(data.stipendio) stipendioMese = data.stipendio;
            if(data.categorie) categorie = data.categorie;
        }
        aggiornaSelectCategorie();
        caricaSpese();
    }).catch((error) => {
        console.error("Errore caricamento impostazioni: ", error);
        aggiornaSelectCategorie();
        caricaSpese();
    });
}

function salvaImpostazioniFirebase() {
    db.collection("config").doc("impostazioni").set({
        stipendio: stipendioMese,
        categorie: categorie
    }).catch((error) => {
        console.error("Errore salvataggio impostazioni: ", error);
    });
}

function caricaSpese() {
    db.collection("spese").orderBy("data", "desc").get().then((querySnapshot) => {
        spese = [];
        querySnapshot.forEach((doc) => {
            spese.push({ id: doc.id, ...doc.data() });
        });
        aggiornaInterfaccia();
    }).catch((error) => {
        console.error("Errore caricamento spese: ", error);
    });
}

// --- AGGIORNA INTERFACCIA DASHBOARD ---
function aggiornaInterfaccia() {
    document.getElementById('disp-stipendio').innerText = `€ ${stipendioMese.toFixed(2)}`;

    const periodo = calcolaPeriodoStipendioCorrente();
    
    let spesePeriodo = spese.filter(s => {
        let d = new Date(s.data);
        return d >= periodo.inizio && d < periodo.fine;
    });

    let totaleSpesoPeriodo = spesePeriodo.reduce((sum, s) => sum + parseFloat(s.importo), 0);
    let residuo = stipendioMese - totaleSpesoPeriodo;
    document.getElementById('disp-residuo').innerText = `€ ${residuo.toFixed(2)}`;

    let oggi = new Date();
    oggi.setHours(0,0,0,0);
    let diffTempo = periodo.fine - oggi;
    let giorniMancanti = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));
    if (giorniMancanti < 1) giorniMancanti = 1;
    document.getElementById('disp-giorni').innerText = giorniMancanti;

    let budgetGiornaliero = residuo / giorniMancanti;
    document.getElementById('disp-budget-giorno').innerText = `€ ${budgetGiornaliero > 0 ? budgetGiornaliero.toFixed(2) : '0.00'}`;

    let dataOggiStr = new Date().toISOString().split('T')[0];
    let speseOggi = spese.filter(s => s.data === dataOggiStr);
    let totaleOggi = speseOggi.reduce((sum, s) => sum + parseFloat(s.importo), 0);
    document.getElementById('totale-oggi').innerText = `€ ${totaleOggi.toFixed(2)}`;

    let htmlOggi = '';
    speseOggi.forEach(s => {
        htmlOggi += `<tr>
            <td>${s.data}</td>
            <td>${s.categoria}</td>
            <td>€ ${parseFloat(s.importo).toFixed(2)}</td>
            <td><button class="btn-danger" onclick="eliminaSpesa('${s.id}')">Elimina</button></td>
        </tr>`;
    });
    document.getElementById('lista-spese-oggi').innerHTML = htmlOggi || '<tr><td colspan="4" style="text-align:center;">Nessuna spesa registrata oggi.</td></tr>';
}

// --- GESTIONE SPESE ---
function aggiungiSpesa(event) {
    event.preventDefault();
    let importo = parseFloat(document.getElementById('importo').value);
    let categoria = document.getElementById('categoria').value;
    let data = document.getElementById('data-spesa').value;

    let nuovaSpesa = { importo, categoria, data, timestamp: firebase.firestore.FieldValue.serverTimestamp() };

    db.collection("spese").add(nuovaSpesa).then(() => {
        document.getElementById('form-spesa').reset();
        const oggi = new Date().toISOString().split('T')[0];
        document.getElementById('data-spesa').value = oggi;
        caricaSpese();
    }).catch((error) => {
        alert("Errore durante il salvataggio: " + error);
    });
}

function eliminaSpesa(id) {
    if(confirm("Sei sicuro di voler eliminare questa spesa?")) {
        db.collection("spese").doc(id).delete().then(() => {
            caricaSpese();
        }).catch((error) => {
            alert("Errore durante l'eliminazione: " + error);
        });
    }
}

// --- MODALE STIPENDIO ---
function apriModaleStipendio() {
    document.getElementById('input-nuovo-stipendio').value = stipendioMese;
    document.getElementById('modale-stipendio').style.display = 'flex';
}
function chiudiModaleStipendio() {
    document.getElementById('modale-stipendio').style.display = 'none';
}
function salvaStipendio() {
    let nuovoValore = parseFloat(document.getElementById('input-nuovo-stipendio').value);
    if(!isNaN(nuovoValore)) {
        stipendioMese = nuovoValore;
        salvaImpostazioniFirebase();
        chiudiModaleStipendio();
        aggiornaInterfaccia();
    }
}

// --- GESTIONE CATEGORIE ---
function aggiornaSelectCategorie() {
    let selectSpesa = document.getElementById('categoria');
    let selectFiltro = document.getElementById('filtro-categoria');
    
    let htmlSelect = '';
    let htmlFiltro = '<option value="">Tutte le categorie</option>';
    
    categorie.forEach(cat => {
        htmlSelect += `<option value="${cat}">${cat}</option>`;
        htmlFiltro += `<option value="${cat}">${cat}</option>`;
    });
    
    selectSpesa.innerHTML = htmlSelect;
    selectFiltro.innerHTML = htmlFiltro;

    let htmlModale = '';
    categorie.forEach(cat => {
        htmlModale += `<li style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span>${cat}</span>
            <button class="btn-danger" onclick="eliminaCategoria('${cat}')">Elimina</button>
        </li>`;
    });
    document.getElementById('lista-categorie-modale').innerHTML = htmlModale;
}

function apriModaleCategoria() {
    document.getElementById('modale-categoria').style.display = 'flex';
}
function chiudiModaleCategoria() {
    document.getElementById('modale-categoria').style.display = 'none';
}
function aggiungiCategoria() {
    let nomeCat = document.getElementById('nuova-cat-nome').value.trim();
    if(nomeCat && !categorie.includes(nomeCat)) {
        categorie.push(nomeCat);
        document.getElementById('nuova-cat-nome').value = '';
        salvaImpostazioniFirebase();
        aggiornaSelectCategorie();
    }
}
function eliminaCategoria(cat) {
    if(categorie.length <= 1) {
        alert("Devi mantenere almeno una categoria.");
        return;
    }
    if(confirm(`Vuoi davvero eliminare la categoria "${cat}"?`)) {
        categorie = categorie.filter(c => c !== cat);
        salvaImpostazioniFirebase();
        aggiornaSelectCategorie();
    }
}

// --- STATISTICHE E FILTRI AVANZATI ---
function cambiaTipoFiltro() {
    let tipo = document.getElementById('filtro-tipo').value;
    document.getElementById('box-giorno').style.display = tipo === 'giorno' ? 'block' : 'none';
    document.getElementById('box-intervallo').style.display = tipo === 'periodo' ? 'block' : 'none';
    document.getElementById('box-mese').style.display = tipo === 'mese' ? 'block' : 'none';
    document.getElementById('box-anno').style.display = tipo === 'anno' ? 'block' : 'none';
    applicaFiltri();
}

function applicaFiltri() {
    let tipoFiltro = document.getElementById('filtro-tipo').value;
    let catFiltro = document.getElementById('filtro-categoria').value;
    let testoRicerca = document.getElementById('filtro-ricerca-testo').value.toLowerCase();

    let speseFiltrate = spese.filter(s => {
        let matchPeriodo = true;
        let dataSpesa = new Date(s.data);

        if (tipoFiltro === 'giorno') {
            let valGiorno = document.getElementById('filtro-data-singola').value;
            if (valGiorno) matchPeriodo = (s.data === valGiorno);
            else matchPeriodo = false;
        } else if (tipoFiltro === 'settimana') {
            let oggi = new Date();
            let inizioSettimana = new Date(oggi.setDate(oggi.getDate() - oggi.getDay() + 1));
            inizioSettimana.setHours(0,0,0,0);
            matchPeriodo = (dataSpesa >= inizioSettimana);
        } else if (tipoFiltro === 'mese') {
            let valMese = document.getElementById('filtro-mese-val').value;
            if (valMese) {
                let [anno, mese] = valMese.split('-');
                matchPeriodo = (dataSpesa.getFullYear() == anno && (dataSpesa.getMonth() + 1) == mese);
            } else {
                matchPeriodo = false;
            }
        } else if (tipoFiltro === 'anno') {
            let valAnno = document.getElementById('filtro-anno-val').value;
            if (valAnno) {
                matchPeriodo = (dataSpesa.getFullYear() == valAnno);
            } else {
                matchPeriodo = false;
            }
        } else if (tipoFiltro === 'periodo') {
            let da = document.getElementById('filtro-data-da').value;
            let a = document.getElementById('filtro-data-a').value;
            if (da && a) {
                matchPeriodo = (s.data >= da && s.data <= a);
            } else {
                matchPeriodo = false;
            }
        }

        let matchCategoria = catFiltro ? (s.categoria === catFiltro) : true;
        let matchTesto = testoRicerca ? (s.importo.toString().includes(testoRicerca) || s.categoria.toLowerCase().includes(testoRicerca) || s.data.includes(testoRicerca)) : true;

        return matchPeriodo && matchCategoria && matchTesto;
    });

    let totaleFiltrato = speseFiltrate.reduce((sum, s) => sum + parseFloat(s.importo), 0);
    document.getElementById('stat-totale-filtrato').innerText = `€ ${totaleFiltrato.toFixed(2)}`;

    let catTotali = {};
    speseFiltrate.forEach(s => {
        catTotali[s.categoria] = (catTotali[s.categoria] || 0) + parseFloat(s.importo);
    });

    let htmlCatTotali = '';
    for (let [cat, tot] of Object.entries(catTotali)) {
        htmlCatTotali += `<div class="cat-total-item"><strong>${cat}:</strong> € ${tot.toFixed(2)}</div>`;
    }
    document.getElementById('stat-per-categoria').innerHTML = htmlCatTotali || '<p style="font-size:0.85rem; color:#666;">Nessun dato per le categorie filtrate.</p>';

    let htmlTabella = '';
    speseFiltrate.forEach(s => {
        htmlTabella += `<tr>
            <td>${s.data}</td>
            <td>${s.categoria}</td>
            <td>€ ${parseFloat(s.importo).toFixed(2)}</td>
            <td><button class="btn-danger" onclick="eliminaSpesa('${s.id}')">Elimina</button></td>
        </tr>`;
    });
    document.getElementById('lista-spese-filtrate').innerHTML = htmlTabella || '<tr><td colspan="4" style="text-align:center;">Nessuna spesa trovata con i filtri selezionati.</td></tr>';
}
