export function switchTab(tabId, callbackStats) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    if(tabId === 'dashboard') {
        document.getElementById('dashboard-tab').classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
    } else {
        document.getElementById('stats-tab').classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        if (callbackStats) callbackStats(); // Aggiorna le statistiche all'apertura
    }
}

export function aggiornaSelectCategorie(categorie, eliminaCatCallback) {
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
            <button class="btn-danger" data-cat="${cat}" id="del-cat-${cat}">Elimina</button>
        </li>`;
    });
    
    let listaModale = document.getElementById('lista-categorie-modale');
    listaModale.style.marginTop = "15px";
    listaModale.innerHTML = htmlModale;

    // Assegna gli eventi di eliminazione dinamicamente
    categorie.forEach(cat => {
        const btn = document.getElementById(`del-cat-${cat}`);
        if(btn) {
            btn.onclick = () => eliminaCatCallback(cat);
        }
    });
}
