// Variabili globali per i dati locali
export let spese = [];
export let categorie = ["Alimentari", "Casa", "Svago", "Trasporti", "Bollette", "Altro"];
export let stipendioMese = 1500.00;
export let dataProssimoStipendio = "";

export function setSpese(nuoveSpese) {
    spese = nuoveSpese;
}

export function setCategorie(nuoveCategorie) {
    categorie = nuoveCategorie;
}

export function setStipendioMese(valore) {
    stipendioMese = valore;
}

export function setDataProssimoStipendio(valore) {
    dataProssimoStipendio = valore;
}
