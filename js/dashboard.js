import { db } from './firebase-config.js';
import { spese, setSpese, stipendioMese, setStipendioMese, dataProssimoStipendio, setDataProssimoStipendio, categorie } from './state.js';
import { aggiornaSelectCategorie } from './categories.js';

export { stipendioMese, dataProssimoStipendio };

export function calcolaDataStipendioDefault() {
    const adesso = new Date();
    let anno = adesso.getFullYear();
    let mese = adesso.getMonth();
    let giorno = adesso.getDate();

    let dataStip;
    if (giorno >= 10) {
        dataStip = new Date(anno, mese + 1, 10);
    } else {
        dataStip = new Date(anno, mese, 10);
    }
    return dataStip.toISOString().split('T')[0];
}

export function caricaDatiDaFirebase() {
    db.collection("config").doc("impostazioni").get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            if(data.stipendio !== undefined) setStipendioMese(Number(data.stipendio));
            if(data.categorie) setCategorie(data.categorie);
            if(data.dataProssimoStipendio) setDataProssimoStipendio(data.dataProssimoStipendio);
        }
        
        categorie.sort((a, b) => a.localeCompare(b));
        
        if (!dataProssimoStipendio) {
            setDataProssimoStipendio(calcolaDataStipendioDefault());
        }
        
        document.getElementById('input-data-prossimo-stipendio').value = dataProssimoStipendio;

        aggiornaSelectCategorie();
        caricaSpese();
    }).catch((error) => {
        console.error("Errore caricamento impostazioni: ", error);
        if (!dataProssimoStipendio) {
            setDataProssimoStipendio(calcolaDataStipendioDefault());
        }
        document.getElementById('input-data-prossimo-stipendio').value = dataProssimoStipendio;
        aggiornaSelectCategorie();
        caricaSpese();
    });
}

export function salvaImpostazioniFirebase() {
    db.collection("config").doc("impostazioni").set({
        stipendio: stipendioMese,
        categorie: categorie,
        dataProssimoStipendio: dataProssimoStipendio
    }).catch((error) => {
        console.error("Errore salvataggio impostazioni: ", error);
    });
}

export function aggiornaDataProssimoStipendio() {
    let inputVal = document.getElementById('input-data-prossimo-stipendio').value;
    if (inputVal) {
        setDataProssimoStipendio(inputVal);
        salvaImpostazioniFirebase();
        aggiornaInterfaccia();
    }
}

export function caricaSpese() {
    db.collection("spese").orderBy("data", "desc").get().then((querySnapshot) => {
        let nuoveSpese = [];
        querySnapshot.forEach((doc) => {
            nuoveSpese.push({ id: doc.id, ...doc.data() });
        });
        setSpese(nuoveSpese);
        aggiornaInterfaccia();
    }).catch((error) => {
        console.error("Errore caricamento spese: ", error);
    });
}

export function aggiornaInterfaccia() {
    document.getElementById('btn-stipendio').innerText = `€ ${stipendioMese.toFixed(2)}`;

    let inputDataVal = document.getElementById('input-data-prossimo-stipendio').value;
    if (inputDataVal) {
        setDataProssimoStipendio(inputDataVal);
    } else if (dataProssimoStipendio) {
        document.getElementById('input-data-prossimo-stipendio').value = dataProssimoStipendio;
    }

    let dataStipendioObj = dataProssimoStipendio ? new Date(dataProssimoStipendio) : new Date();
    
    let oggi = new Date();
    oggi.setHours(0,0,0,0);
    dataStipendioObj.setHours(0,0,0,0);

    let diffTempo = dataStipendioObj - oggi;
    let giorniMancanti = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));
    if (giorniMancanti < 1) giorniMancanti = 1;
    document.getElementById('disp-giorni').innerText = giorniMancanti;

    let annoCorrente = oggi.getFullYear();
    let meseCorrente = oggi.getMonth();

    let spesePeriodo = spese.filter(s => {
        let d = new Date(s.data);
        return d.getFullYear() === annoCorrente && d.getMonth() === meseCorrente;
    });

    let totaleSpesoPeriodo = spesePeriodo.reduce((sum, s) => sum + parseFloat(s.importo), 0);
    let residuo = stipendioMese - totaleSpesoPeriodo;
    document.getElementById('disp-residuo').innerText = `€ ${residuo.toFixed(2)}`;

    let budgetGiornaliero = residuo / giorniMancanti;
    document.getElementById('disp-budget-giorno').innerText = `€ ${budgetGiornaliero > 0 ? budgetGiornaliero.toFixed(2) : '0.00'}`;

    let annoStr = oggi.getFullYear();
    let meseStr = String(oggi.getMonth() + 1).padStart(2, '0');
    let giornoStr = String(oggi.getDate()).padStart(2, '0');
    let dataOggiStr = `${annoStr}-${meseStr}-${giornoStr}`;

    let speseOggi = spese.filter(s => s.data === dataOggiStr);

    let htmlOggi = '';
    let totaleOggi = 0;

    speseOggi.forEach(s => {
        let importoNum = parseFloat(s.importo);
        totaleOggi += importoNum;
        let dataFormattata = s.data.split('-').reverse().join('/');
        htmlOggi += `<tr>
            <td>${dataFormattata}</td>
            <td>${s.categoria}</td>
            <td>€ ${importoNum.toFixed(2)}</td>
            <td><button class="btn-danger" onclick="eliminaSpesa('${s.id}')">Elimina</button></td>
        </tr>`;
    });

    document.getElementById('totale-oggi').innerText = `€ ${totaleOggi.toFixed(2)}`;
    document.getElementById('lista-spese-oggi').innerHTML = htmlOggi || '<tr><td colspan="4" style="text-align:center;">Nessuna spesa registrata oggi.</td></tr>';
}

export function aggiungiSpesa(event) {
    event.preventDefault();
    let importoInput = document.getElementById('importo').value.trim().replace(',', '.');
    let importo = parseFloat(importoInput);
    let categoria = document.getElementById('categoria').value;
    let data = document.getElementById('data-spesa').value;

    if (isNaN(importo)) {
        alert("Inserisci un importo valido.");
        return;
    }

    let nuovaSpesa = { importo, categoria, data, timestamp: firebase.firestore.FieldValue.serverTimestamp() };

    db.collection("spese").add(nuovaSpesa).then(() => {
        document.getElementById('form-spesa').reset();
        const oggi = new Date().toISOString().split('T')[0];
        document.getElementById('data-spesa').value = oggi;
        caricaSpese();
    }).catch((error) => {
        console.error("Errore salvataggio spesa: ", error);
    });
}

export function eliminaSpesa(id) {
    if(confirm("Sei sicuro di voler eliminare questa spesa?")) {
        db.collection("spese").doc(id).delete().then(() => {
            caricaSpese();
        }).catch((error) => {
            console.error("Errore eliminazione spesa: ", error);
        });
    }
}

export function apriModaleStipendio() {
    document.getElementById('input-nuovo-stipendio').value = '';
    document.getElementById('modale-stipendio').style.display = 'flex';
}

export function chiudiModaleStipendio() {
    document.getElementById('modale-stipendio').style.display = 'none';
}

export function salvaStipendio() {
    let rawVal = document.getElementById('input-nuovo-stipendio').value.trim();
    if (!rawVal) return;

    let nuovoValore = stipendioMese;

    if (rawVal.startsWith('+')) {
        let incrementoStr = rawVal.substring(1).replace(',', '.');
        let incremento = parseFloat(incrementoStr);
        if (!isNaN(incremento)) nuovoValore += incremento;
    } else if (rawVal.startsWith('-')) {
        let decrementoStr = rawVal.substring(1).replace(',', '.');
        let decremento = parseFloat(decrementoStr);
        if (!isNaN(decremento)) nuovoValore -= decremento;
    } else {
        let parsedStr = rawVal.replace(',', '.');
        let parsed = parseFloat(parsedStr);
        if (!isNaN(parsed)) nuovoValore = parsed;
    }

    setStipendioMese(nuovoValore);
    salvaImpostazioniFirebase();
    chiudiModaleStipendio();
    aggiornaInterfaccia();
}
