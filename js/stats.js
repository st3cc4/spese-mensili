import { spese } from './state.js';

export function cambiaTipoFiltro() {
    let tipo = document.getElementById('filtro-tipo').value;
    document.getElementById('box-giorno').style.display = tipo === 'giorno' ? 'block' : 'none';
    document.getElementById('box-settimana').style.display = tipo === 'settimana' ? 'block' : 'none';
    document.getElementById('box-intervallo').style.display = tipo === 'periodo' ? 'block' : 'none';
    document.getElementById('box-mese').style.display = tipo === 'mese' ? 'block' : 'none';
    document.getElementById('box-anno').style.display = tipo === 'anno' ? 'block' : 'none';
    
    if (tipo === 'settimana' && !document.getElementById('filtro-settimana-val').value) {
        let now = new Date();
        let year = now.getFullYear();
        let d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        let dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        let yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
        let weekStr = year + "-W" + (weekNo < 10 ? "0" : "") + weekNo;
        document.getElementById('filtro-settimana-val').value = weekStr;
    }

    applicaFiltri();
}

function getDatesForWeek(weekStr) {
    let [yearStr, weekPart] = weekStr.split('-W');
    let year = parseInt(yearStr);
    let week = parseInt(weekPart);
    
    let jan4 = new Date(year, 0, 4);
    let dayJan4 = jan4.getDay() || 7;
    let startOfWeek1 = new Date(jan4);
    startOfWeek1.setDate(jan4.getDate() - dayJan4 + 1);
    
    let startWeek = new Date(startOfWeek1);
    startWeek.setDate(startOfWeek1.getDate() + (week - 1) * 7);
    startWeek.setHours(0,0,0,0);
    
    let endWeek = new Date(startWeek);
    endWeek.setDate(startWeek.getDate() + 6);
    endWeek.setHours(23,59,59,999);
    
    return { start: startWeek, end: endWeek };
}

export function applicaFiltri() {
    let tipoFiltro = document.getElementById('filtro-tipo').value;
    let catFiltro = document.getElementById('filtro-categoria').value;
    let testoRicerca = document.getElementById('filtro-ricerca-testo').value.toLowerCase().replace(',', '.');

    let speseFiltrate = spese.filter(s => {
        let matchPeriodo = true;
        let dataSpesa = new Date(s.data);

        if (tipoFiltro === 'giorno') {
            let valGiorno = document.getElementById('filtro-data-singola').value;
            if (valGiorno) matchPeriodo = (s.data === valGiorno);
            else matchPeriodo = false;
        } else if (tipoFiltro === 'settimana') {
            let valSettimana = document.getElementById('filtro-settimana-val').value;
            if (valSettimana) {
                let range = getDatesForWeek(valSettimana);
                matchPeriodo = (dataSpesa >= range.start && dataSpesa <= range.end);
            } else {
                matchPeriodo = false;
            }
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
        let dataFormattata = s.data.split('-').reverse().join('/');
        htmlTabella += `<tr>
            <td>${dataFormattata}</td>
            <td>${s.categoria}</td>
            <td>€ ${parseFloat(s.importo).toFixed(2)}</td>
            <td><button class="btn-danger" onclick="eliminaSpesa('${s.id}')">Elimina</button></td>
        </tr>`;
    });
    document.getElementById('lista-spese-filtrate').innerHTML = htmlTabella || '<tr><td colspan="4" style="text-align:center;">Nessuna spesa trovata con i filtri selezionati.</td></tr>';
}
