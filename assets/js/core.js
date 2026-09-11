// Noyau partage : client Supabase, chargement des donnees, calculs prix/duree,
// et calcul des creneaux disponibles. Utilise par l'espace cliente et l'admin.
(function (global) {
  'use strict';

  const cfg = global.FAITH_CONFIG;
  const sb = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---------- Utilitaires temps ----------
  // Notre convention : 0 = lundi ... 6 = dimanche
  function jourSemaine(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return (d.getDay() + 6) % 7; // JS: 0=dimanche -> 6, 1=lundi -> 0
  }
  function timeToMin(t) {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  function minToTime(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function minToLabel(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return m + ' min';
    if (m === 0) return h + 'h';
    return h + 'h' + String(m).padStart(2, '0');
  }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function formatDateFR(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  // ---------- Chargement des donnees ----------
  async function getPrestations(actifsSeulement) {
    let q = sb.from('prestations').select('*').order('ordre', { ascending: true });
    if (actifsSeulement) q = q.eq('actif', true);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  async function getReglages() {
    const { data, error } = await sb.from('reglages').select('*');
    if (error) throw error;
    const map = {};
    data.forEach(function (r) { map[r.cle] = r; });
    return map;
  }
  async function getHoraires() {
    const { data, error } = await sb.from('horaires_par_defaut').select('*').order('jour_semaine');
    if (error) throw error;
    return data;
  }
  async function getExceptions() {
    const { data, error } = await sb.from('exceptions_dispo').select('*');
    if (error) throw error;
    return data;
  }

  // ---------- Calcul prix / duree ----------
  // Renvoie { prix, duree, bloc } a partir d'une prestation et des choix.
  function computeEstimate(presta, taille, longueur, reglages) {
    let prix = Number(presta.prix_base);
    let duree = Number(presta.duree_base_min);
    if (taille === 'moyen' && reglages.taille_moyen) {
      prix += Number(reglages.taille_moyen.supplement_prix || 0);
      duree += Number(reglages.taille_moyen.supplement_min || 0);
    }
    if (taille === 'petit' && reglages.taille_petit) {
      prix += Number(reglages.taille_petit.supplement_prix || 0);
      duree += Number(reglages.taille_petit.supplement_min || 0);
    }
    if (longueur === 'long' && reglages.longueur_long) {
      prix += Number(reglages.longueur_long.supplement_prix || 0);
      duree += Number(reglages.longueur_long.supplement_min || 0);
    }
    const battement = reglages.battement ? Number(reglages.battement.supplement_min || 0) : 0;
    return { prix: prix, duree: duree, bloc: duree + battement };
  }

  // Applique une remise a un montant. type: 'pourcentage' | 'montant'
  function appliquerRemise(montant, type, valeur) {
    montant = Number(montant) || 0;
    valeur = Number(valeur) || 0;
    if (type === 'pourcentage') return Math.max(0, montant - (montant * valeur) / 100);
    if (type === 'montant') return Math.max(0, montant - valeur);
    return montant;
  }

  // ---------- Disponibilites ----------
  // Renvoie les horaires d'ouverture {ouvert, debut, fin} en minutes pour une date.
  function horairesDuJour(dateStr, horaires, exceptions) {
    const exc = (exceptions || []).find(function (e) { return e.date === dateStr; });
    if (exc) {
      if (!exc.ouvert) return { ouvert: false };
      return { ouvert: true, debut: timeToMin(exc.heure_debut), fin: timeToMin(exc.heure_fin) };
    }
    const h = horaires.find(function (x) { return x.jour_semaine === jourSemaine(dateStr); });
    if (!h || !h.ouvert) return { ouvert: false };
    return { ouvert: true, debut: timeToMin(h.heure_debut), fin: timeToMin(h.heure_fin) };
  }

  // Creneaux de debut disponibles pour une date et une duree donnee.
  // dureeEstimee : temps de travail (doit finir avant la fermeture)
  // dureeBloc : temps reserve (avec battement), pour le non-chevauchement
  // occupied : liste { debut, fin } en minutes des rdv confirmes du jour
  function creneauxDisponibles(dateStr, dureeEstimee, dureeBloc, horaires, exceptions, occupied) {
    const jour = horairesDuJour(dateStr, horaires, exceptions);
    if (!jour.ouvert) return [];
    const step = cfg.SLOT_STEP_MIN || 30;
    const slots = [];
    const busy = (occupied || []).map(function (o) { return { debut: o.debut, fin: o.fin }; });

    // Ne pas proposer de creneau deja passe si c'est aujourd'hui
    let minStart = jour.debut;
    if (dateStr === todayISO()) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      minStart = Math.max(minStart, Math.ceil(nowMin / step) * step);
    }

    for (let s = minStart; s + dureeEstimee <= jour.fin; s += step) {
      const blocFin = s + dureeBloc;
      let libre = true;
      for (let i = 0; i < busy.length; i++) {
        // chevauchement des blocs [s, blocFin] et [busy.debut, busy.fin]
        if (s < busy[i].fin && blocFin > busy[i].debut) { libre = false; break; }
      }
      if (libre) slots.push(s);
    }
    return slots; // minutes since midnight
  }

  // Recupere les rdv confirmes d'une date (pour le calcul de dispo)
  async function rdvConfirmesDuJour(dateStr) {
    const { data, error } = await sb
      .from('reservations')
      .select('id, heure_debut, heure_fin, statut')
      .eq('date_rdv', dateStr)
      .eq('statut', 'confirme')
      .is('supprime_le', null);
    if (error) throw error;
    return (data || []).map(function (r) {
      return { debut: timeToMin(r.heure_debut), fin: timeToMin(r.heure_fin) };
    });
  }

  global.FaithCore = {
    sb: sb,
    cfg: cfg,
    JOURS: JOURS,
    // temps
    jourSemaine: jourSemaine,
    timeToMin: timeToMin,
    minToTime: minToTime,
    minToLabel: minToLabel,
    todayISO: todayISO,
    formatDateFR: formatDateFR,
    // data
    getPrestations: getPrestations,
    getReglages: getReglages,
    getHoraires: getHoraires,
    getExceptions: getExceptions,
    // calculs
    computeEstimate: computeEstimate,
    appliquerRemise: appliquerRemise,
    horairesDuJour: horairesDuJour,
    creneauxDisponibles: creneauxDisponibles,
    rdvConfirmesDuJour: rdvConfirmesDuJour
  };
})(window);
