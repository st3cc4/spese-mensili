import { db } from './firebase-config.js';
import { categorie, setCategorie } from './state.js';

export function aggiornaSelectCategorie() {
    categorie.sort((a, b) => a.localeCompare(b));

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
    
    let listaModale = document.getElementById('lista-categorie-modale');
    listaModale.style.marginTop = "15px";
    listaModale.innerHTML = htmlModale;
}

export function apriModaleCategoria() {
    document.getElementById('modale-categoria').style.display = 'flex';
}

export function chiudiModaleCategoria() {
    document.getElementById('modale-categoria').style.display = 'none';
}

export function aggiungiCategoria() {
    let inputVal = document.getElementById('nuova-cat-nome').value.trim();
    if (!inputVal) return;

    let nomeCat = inputVal.charAt(0).toUpperCase() + inputVal.slice(1).toLowerCase();

    if(categorie.includes(nomeCat)) {
        alert("Questa categoria esiste già!");
        return;
    }

    categorie.push(nomeCat);
    categorie.sort((a, b) => a.localeCompare(b));

    document.getElementById('nuova-cat-nome').value = '';
    salvaImpostazioniFirebase();
    aggiornaSelectCategorie();
}

export function eliminaCategoria(cat) {
    if(categorie.length <= 1) {
        alert("Devi mantenere almeno una categoria.");
        return;
    }
    if(confirm(`Vuoi davvero eliminare la categoria "${cat}"?`)) {
        let nuoveCat = categorie.filter(c => c !== cat);
        setCategorie(nuoveCat);
        salvaImpostazioniFirebase();
        aggiornaSelectCategorie();
    }
}

function salvaImpostazioniFirebase() {
    import('./dashboard.js').then(({ stipendioMese, dataProssimoStipendio }) => {
        db.collection("config").doc("impostazioni").set({
            stipendio: stipendioMese,
            categorie: categorie,
            dataProssimoStipendio: dataProssimoStipendio
        }).catch((error) => {
            console.error("Errore salvataggio impostazioni: ", error);
        });
    });
}
