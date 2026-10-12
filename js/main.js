import { caricaDatiDaFirebase, aggiornaDataProssimoStipendio, aggiungiSpesa, eliminaSpesa, apriModaleStipendio, chiudiModaleStipendio, salvaStipendio } from './dashboard.js';
import { apriModaleCategoria, chiudiModaleCategoria, aggiungiCategoria, eliminaCategoria } from './categories.js';
import { cambiaTipoFiltro, applicaFiltri } from './stats.js';

// Espone globalmente le funzioni richiamate via inline event handlers (onclick, onchange, ecc.) nell'HTML
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    if(tabId === 'dashboard') {
        document.getElementById('dashboard-tab').classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
    } else {
        document.getElementById('stats-tab').classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        applicaFiltri();
    }
};

window.aggiornaDataProssimoStipendio = aggiornaDataProssimoStipendio;
window.aggiungiSpesa = aggiungiSpesa;
window.eliminaSpesa = eliminaSpesa;
window.apriModaleStipendio = apriModaleStipendio;
window.chiudiModaleStipendio = chiudiModaleStipendio;
window.salvaStipendio = salvaStipendio;

window.apriModaleCategoria = apriModaleCategoria;
window.chiudiModaleCategoria = chiudiModaleCategoria;
window.aggiungiCategoria = aggiungiCategoria;
window.eliminaCategoria = eliminaCategoria;

window.cambiaTipoFiltro = cambiaTipoFiltro;
window.applicaFiltri = applicaFiltri;

// Al caricamento della pagina
window.onload = function() {
    const oggi = new Date();
    const oggiStr = oggi.toISOString().split('T')[0];
    document.getElementById('data-spesa').value = oggiStr;
    
    document.getElementById('filtro-anno-val').value = oggi.getFullYear();
    
    caricaDatiDaFirebase();
};
