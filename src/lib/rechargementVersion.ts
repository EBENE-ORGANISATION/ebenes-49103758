// Après une mise en ligne, un onglet resté ouvert réclame des écrans de
// l'ancienne version, qui n'existent plus : on recharge une fois la page pour
// prendre la nouvelle version. La marque évite de recharger en boucle.
const CLE = "ebene.rechargement_version";
const DELAI_MS = 60_000;

export function ecouterNouvelleVersion() {
  window.addEventListener("vite:preloadError", (evenement) => {
    let dernier = 0;
    try { dernier = Number(sessionStorage.getItem(CLE)) || 0; } catch { /* stockage indisponible */ }
    if (Date.now() - dernier < DELAI_MS) return;
    try { sessionStorage.setItem(CLE, String(Date.now())); } catch { /* stockage indisponible */ }
    evenement.preventDefault();
    window.location.reload();
  });
}
