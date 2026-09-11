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
    // Tri alphabetique par nom
    let q = sb.from('prestations').select('*').order('nom', { ascending: true });
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
  // Renvoie { prix, duree, bloc } a partir d'une prestation, des choix et des options.
  // Duree : fourchette de la prestation (gros = borne basse, petit = borne haute,
  // moyen = milieu) + supplement de longueur + eventuel supplement des options.
  // Prix : prix de base + supplement taille + supplement longueur + prix des options.
  // options : tableau d'objets { cle, nom, prix, min }.
  function computeEstimate(presta, taille, longueur, options, reglages) {
    options = options || [];
    let prix = Number(presta.prix_base);

    // Supplement prix de la taille
    const rt = reglages['taille_' + taille];
    if (rt) prix += Number(rt.supplement_prix || 0);

    // Supplement prix + duree de la longueur
    let dureeLongueur = 0;
    const rl = reglages['longueur_' + longueur];
    if (rl) { prix += Number(rl.supplement_prix || 0); dureeLongueur += Number(rl.supplement_min || 0); }

    // Duree selon la fourchette et la taille
    const dmin = Number(presta.duree_base_min || 0);
    const dmax = presta.duree_max_min != null ? Number(presta.duree_max_min) : dmin;
    let duree;
    if (taille === 'petit') duree = dmax;
    else if (taille === 'moyen') duree = Math.round((dmin + dmax) / 2);
    else duree = dmin; // gros
    duree += dureeLongueur;

    // Options
    options.forEach(function (o) { prix += Number(o.prix || 0); duree += Number(o.min || 0); });

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

  // Recupere les creneaux occupes d'une date pour le calcul de dispo.
  // Les rdv confirmes ET en attente bloquent (pas de chevauchement).
  // Un rdv annule (archive) ou supprime (corbeille) ne bloque plus.
  async function occupantsDuJour(dateStr) {
    const { data, error } = await sb
      .from('reservations')
      .select('id, heure_debut, heure_fin, statut')
      .eq('date_rdv', dateStr)
      .in('statut', ['en_attente', 'confirme'])
      .is('supprime_le', null);
    if (error) throw error;
    return (data || [])
      .filter(function (r) { return r.heure_debut && r.heure_fin; })
      .map(function (r) { return { debut: timeToMin(r.heure_debut), fin: timeToMin(r.heure_fin) }; });
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
    occupantsDuJour: occupantsDuJour
  };
})(window);
