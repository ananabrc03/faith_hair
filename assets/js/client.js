// Logique de l'espace cliente (questionnaire)
(function () {
  'use strict';
  const C = window.FaithCore;
  const cfg = window.FAITH_CONFIG;

  const VISIBILITE_DEFAUT = 2; // nombre de semaines affichees par defaut (surchargeable dans les reglages)
  const VISIBLE_START = 5;
  const VISIBLE_STEP = 5;

  let prestations = [];
  let reglages = {};
  let optionsList = [];      // options editables (table options)
  let horairesCache = [];
  let exceptionsCache = [];

  const state = {
    taille: null, longueur: null,
    prestationId: null, estAutre: false, commentaire: '',
    options: [],               // [{id,nom,prix,min}]
    prenom: '', insta: '', tel: '',
    date: null, heureDebut: null,
    estimate: null,
    joursDispo: [], visibleN: VISIBLE_START, pinnedDay: null, openDate: null,
    dureeEstimee: 180, dureeBloc: 210, horizonDays: VISIBILITE_DEFAUT * 7
  };

  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function euro(n) { return (Math.round(Number(n) * 100) / 100).toString().replace('.', ',') + ' €'; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- Navigation ----------
  const pages = ['page-intro', 'page-presta', 'page-creneau', 'page-coord', 'page-recap', 'page-confirm'];
  function showPage(id) { pages.forEach(function (p) { $('#' + p).classList.toggle('hidden', p !== id); }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function setStep(n) {
    const st = $('#stepper'); st.classList.toggle('hidden', n < 1);
    $$('#stepper .step').forEach(function (el) { const s = Number(el.dataset.step); el.classList.toggle('active', s === n); el.classList.toggle('done', s < n); });
  }

  // ---------- Chargement initial ----------
  async function init() {
    try {
      const res = await Promise.all([C.getPrestations(true), C.getReglages(), C.getOptions(true)]);
      prestations = res[0]; reglages = res[1]; optionsList = res[2];
      injecterSupplements();
      injecterIntro();
      remplirModeles();
      renderOptions();
    } catch (e) { console.error(e); toast('Erreur de chargement, reessayez.'); }
    bindEvents();
  }

  function supPrix(cle) { const r = reglages[cle]; return r && r.supplement_prix ? '+' + Number(r.supplement_prix) + '€' : ''; }
  function injecterSupplements() {
    const m = $('[data-sup="taille-moyen"]'); if (m) m.textContent = supPrix('taille_moyen');
    const p = $('[data-sup="taille-petit"]'); if (p) p.textContent = supPrix('taille_petit');
    const l = $('[data-sup="longueur-long"]'); if (l) l.textContent = supPrix('longueur_long');
  }
  function injecterIntro() {
    if (reglages.intro_titre && reglages.intro_titre.valeur_texte) $('#intro-titre').textContent = reglages.intro_titre.valeur_texte;
    if (reglages.intro_principal && reglages.intro_principal.valeur_texte) $('#intro-principal').textContent = reglages.intro_principal.valeur_texte;
    if (reglages.intro_secondaire && reglages.intro_secondaire.valeur_texte) $('#intro-secondaire').textContent = reglages.intro_secondaire.valeur_texte;
  }

  // ---------- Modeles (toutes les prestations actives) ----------
  function remplirModeles() {
    const sel = $('#select-modele');
    sel.innerHTML = '<option value="">Selectionnez un modele</option>';
    prestations.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nom + (p.prix_fixe ? ' - ' + Number(p.prix_base) + '€' : ' - a partir de ' + Number(p.prix_base) + '€');
      sel.appendChild(opt);
    });
    const autre = document.createElement('option'); autre.value = '__autre__'; autre.textContent = 'Autre (a preciser)'; sel.appendChild(autre);
  }

  // ---------- Options (selon la taille) ----------
  function optionPrix(o, taille) { const v = o['prix_' + taille]; return v == null ? null : Number(v); }
  function reconcileOptions() {
    // garder seulement les options disponibles pour la taille et mettre a jour leur prix
    state.options = state.options.map(function (x) {
      const o = optionsList.find(function (y) { return y.id === x.id; });
      if (!o) return null;
      const prix = optionPrix(o, state.taille);
      if (prix == null) return null;
      return { id: o.id, nom: o.nom, prix: prix, min: Number(o.duree_min || 0) };
    }).filter(Boolean);
  }
  function renderOptions() {
    const wrap = $('#options-wrap'); if (!wrap) return;
    if (!state.taille) { wrap.innerHTML = '<p class="hint">Choisissez d\'abord la taille de tresse.</p>'; return; }
    const dispo = optionsList.filter(function (o) { return optionPrix(o, state.taille) != null; });
    if (!dispo.length) { wrap.innerHTML = '<p class="hint">Aucune option pour cette taille.</p>'; return; }
    wrap.innerHTML = '';
    dispo.forEach(function (o) {
      const prix = optionPrix(o, state.taille);
      const coche = state.options.some(function (x) { return x.id === o.id; });
      const row = document.createElement('label');
      row.className = 'option-row';
      row.innerHTML = '<input type="checkbox" ' + (coche ? 'checked' : '') + '/>' +
        '<span class="op-nom">' + escapeHtml(o.nom) + '</span>' +
        '<span class="op-prix">+' + prix + '€</span>';
      row.querySelector('input').addEventListener('change', function (e) {
        if (e.target.checked) { if (!state.options.some(function (x) { return x.id === o.id; })) state.options.push({ id: o.id, nom: o.nom, prix: prix, min: Number(o.duree_min || 0) }); }
        else state.options = state.options.filter(function (x) { return x.id !== o.id; });
        recalcEstimate();
      });
      wrap.appendChild(row);
    });
  }

  // ---------- Estimation ----------
  function recalcEstimate() {
    const box = $('#estimate-box');
    if (state.estAutre) { box.classList.remove('hidden'); $('#estimate-montant').textContent = 'En DM'; state.estimate = null; majBoutonPresta(); return; }
    if (!state.prestationId || !state.taille || !state.longueur) { box.classList.add('hidden'); state.estimate = null; majBoutonPresta(); return; }
    const presta = prestations.find(function (p) { return p.id === state.prestationId; });
    state.estimate = C.computeEstimate(presta, state.taille, state.longueur, state.options, reglages);
    box.classList.remove('hidden'); $('#estimate-montant').textContent = euro(state.estimate.prix);
    majBoutonPresta();
  }
  function prestaComplete() {
    if (!state.taille || !state.longueur) return false;
    if (state.estAutre) return state.commentaire.trim().length > 0;
    return !!state.prestationId;
  }
  function majBoutonPresta() { $('#btn-to-creneau').disabled = !prestaComplete(); }

  // ---------- Creneaux : liste de jours disponibles ----------
  async function chargerJoursDispo() {
    const zone = $('#jours-dispo');
    zone.innerHTML = '<p class="hint">Chargement des disponibilites...</p>';
    state.joursDispo = []; state.visibleN = VISIBLE_START; state.pinnedDay = null; state.openDate = null;
    state.date = null; state.heureDebut = null; $('#btn-to-coord').disabled = true;

    if (state.estimate) { state.dureeEstimee = state.estimate.duree; state.dureeBloc = state.estimate.bloc; }
    else { const b = reglages.battement ? Number(reglages.battement.supplement_min || 0) : 30; state.dureeEstimee = 180; state.dureeBloc = 180 + b; }

    const semaines = reglages.visibilite_semaines ? Number(reglages.visibilite_semaines.supplement_min || VISIBILITE_DEFAUT) : VISIBILITE_DEFAUT;
    state.horizonDays = Math.max(1, semaines) * 7;
    const today = C.todayISO();
    const fin = addDays(today, state.horizonDays);
    try {
      const [horaires, exceptions, resRange] = await Promise.all([
        C.getHoraires(), C.getExceptions(),
        C.sb.from('reservations').select('date_rdv,heure_debut,heure_fin').in('statut', ['en_attente', 'confirme']).is('supprime_le', null).gte('date_rdv', today).lte('date_rdv', fin)
      ]);
      horairesCache = horaires; exceptionsCache = exceptions;
      const occMap = {};
      (resRange.data || []).forEach(function (r) {
        if (r.heure_debut && r.heure_fin) { (occMap[r.date_rdv] = occMap[r.date_rdv] || []).push({ debut: C.timeToMin(r.heure_debut), fin: C.timeToMin(r.heure_fin) }); }
      });
      for (let i = 0; i < state.horizonDays; i++) {
        const d = addDays(today, i);
        const slots = C.creneauxDisponibles(d, state.dureeEstimee, state.dureeBloc, horaires, exceptions, occMap[d] || []);
        if (slots.length) state.joursDispo.push({ date: d, slots: slots });
      }
      if (state.joursDispo.length) state.openDate = state.joursDispo[0].date;
      renderJours();
    } catch (e) { console.error(e); zone.innerHTML = '<p class="hint">Erreur de chargement des disponibilites.</p>'; }
  }

  function dayItemHtml(jour) {
    const label = cap(C.formatDateFR(jour.date));
    const ouvert = jour.date === state.openDate;
    let slotsHtml = jour.slots.length
      ? '<div class="slots">' + jour.slots.map(function (min) {
          const t = C.minToTime(min);
          const sel = (jour.date === state.date && t === state.heureDebut) ? ' selected' : '';
          return '<div class="slot' + sel + '" data-date="' + jour.date + '" data-time="' + t + '">' + t + '</div>';
        }).join('') + '</div>'
      : '<p class="hint">Aucun creneau disponible ce jour.</p>';
    return '<div class="day-item' + (ouvert ? ' open' : '') + '" data-date="' + jour.date + '">' +
      '<div class="day-head">' + label + ' <span class="chev">&#9662;</span></div>' +
      '<div class="day-body">' + slotsHtml + '</div></div>';
  }

  function renderJours() {
    const zone = $('#jours-dispo');
    const items = [];
    if (state.pinnedDay) items.push(state.pinnedDay);
    state.joursDispo.slice(0, state.visibleN).forEach(function (j) {
      if (!state.pinnedDay || j.date !== state.pinnedDay.date) items.push(j);
    });
    if (!items.length) { zone.innerHTML = '<p class="hint">Aucune disponibilite prochaine. Essayez de choisir une date precise.</p>'; }
    else { zone.innerHTML = items.map(dayItemHtml).join(''); }

    const btnPlus = $('#btn-plus-dispo');
    btnPlus.classList.toggle('hidden', state.joursDispo.length <= state.visibleN);

    $$('#jours-dispo .day-head').forEach(function (h) {
      h.addEventListener('click', function () {
        const item = h.closest('.day-item');
        const d = item.dataset.date;
        state.openDate = (item.classList.contains('open')) ? null : d;
        $$('#jours-dispo .day-item').forEach(function (it) { it.classList.toggle('open', it.dataset.date === state.openDate); });
      });
    });
    $$('#jours-dispo .slot').forEach(function (s) {
      s.addEventListener('click', function () {
        $$('#jours-dispo .slot').forEach(function (x) { x.classList.remove('selected'); });
        s.classList.add('selected');
        state.date = s.dataset.date; state.heureDebut = s.dataset.time;
        $('#btn-to-coord').disabled = false;
      });
    });
  }

  async function choisirDatePrecise(dateStr) {
    if (!dateStr) return;
    try {
      const occ = await C.occupantsDuJour(dateStr);
      const slots = C.creneauxDisponibles(dateStr, state.dureeEstimee, state.dureeBloc, horairesCache, exceptionsCache, occ);
      state.pinnedDay = { date: dateStr, slots: slots };
      state.openDate = dateStr;
      renderJours();
    } catch (e) { console.error(e); toast('Erreur sur cette date.'); }
  }

  // ---------- Validation telephone ----------
  function telValide(valeur) { const net = valeur.replace(/[\s.\-()]/g, ''); return /^(?:\+33|0)[1-9]\d{8}$/.test(net); }

  // ---------- Recap / message ----------
  function nomModele() { if (state.estAutre) return 'Autre'; const p = prestations.find(function (x) { return x.id === state.prestationId; }); return p ? p.nom : ''; }
  function libelleOptions() { return state.options.map(function (o) { return o.nom; }).join(', '); }

  function remplirRecap() {
    const lignes = [['Modele', nomModele()], ['Taille de tresse', cap(state.taille)], ['Longueur', cap(state.longueur)]];
    if (state.options.length) lignes.push(['Options', libelleOptions()]);
    if (state.estAutre && state.commentaire) lignes.push(['Commentaire', state.commentaire]);
    lignes.push(['Date', C.formatDateFR(state.date)]);
    lignes.push(['Heure', state.heureDebut]);
    lignes.push(['Prenom', state.prenom]);
    lignes.push(['Instagram', '@' + state.insta.replace(/^@/, '')]);
    lignes.push(['Telephone', state.tel]);
    lignes.push(['Estimation', state.estimate ? euro(state.estimate.prix) : 'A confirmer en DM']);
    $('#recap-content').innerHTML = lignes.map(function (l) { return '<div class="recap-line"><span>' + l[0] + '</span><span>' + escapeHtml(l[1]) + '</span></div>'; }).join('');
  }

  function construireMessage() {
    const l = [];
    l.push('Bonjour Faith Hair, je viens de remplir le formulaire de reservation.');
    l.push('Prenom : ' + state.prenom);
    if (state.estAutre) l.push('Prestation : Autre - ' + state.commentaire);
    else l.push('Prestation : ' + nomModele());
    l.push('Taille : ' + cap(state.taille) + ' / Longueur : ' + cap(state.longueur));
    if (state.options.length) l.push('Options : ' + libelleOptions());
    l.push('Creneau souhaite : ' + C.formatDateFR(state.date) + ' a ' + state.heureDebut);
    l.push(state.estimate ? ('Estimation : ' + euro(state.estimate.prix) + ' (a confirmer)') : 'Tarif a confirmer en DM.');
    l.push('Je reste en attente du lien pour l\'acompte de 10 euros. Merci !');
    return l.join('\n');
  }

  // ---------- Enregistrement ----------
  async function enregistrer() {
    const btn = $('#btn-valider'); btn.disabled = true; btn.textContent = 'Enregistrement...';
    let heureFin = null, dureeEstimee = null, dureeBloc = null, prixEstime = null;
    if (state.estimate) {
      dureeEstimee = state.estimate.duree; dureeBloc = state.estimate.bloc; prixEstime = state.estimate.prix;
      heureFin = C.minToTime(C.timeToMin(state.heureDebut) + state.estimate.bloc);
    }
    const row = {
      statut: 'en_attente', prenom: state.prenom, instagram: state.insta.replace(/^@/, ''), telephone: state.tel,
      prestation_id: state.estAutre ? null : state.prestationId, nom_presta: nomModele(), est_autre: state.estAutre,
      taille: state.taille, longueur: state.longueur, commentaire: state.commentaire,
      options: state.options, prix_estime: prixEstime, duree_estimee_min: dureeEstimee, duree_bloc_min: dureeBloc,
      date_rdv: state.date, heure_debut: state.heureDebut, heure_fin: heureFin
    };
    const { error } = await C.sb.from('reservations').insert(row);
    if (error) { console.error(error); toast('Erreur, reessayez.'); btn.disabled = false; btn.textContent = 'Valider ma demande'; return; }
    $('#msg-insta').textContent = construireMessage();
    $('#insta-handle').textContent = cfg.INSTAGRAM;
    setStep(0); showPage('page-confirm');
  }

  // ---------- Evenements ----------
  function selectDans(groupeSel, el) { $$(groupeSel).forEach(function (x) { x.classList.remove('selected'); }); el.classList.add('selected'); }

  function bindEvents() {
    $('#btn-start').addEventListener('click', function () { showPage('page-presta'); setStep(1); });

    $('#select-modele').addEventListener('change', function () {
      const v = this.value;
      if (v === '__autre__') { state.estAutre = true; state.prestationId = null; $('#commentaire-wrap').classList.remove('hidden'); }
      else if (v) { state.estAutre = false; state.prestationId = v; $('#commentaire-wrap').classList.add('hidden'); }
      else { state.estAutre = false; state.prestationId = null; }
      recalcEstimate();
    });
    $('#commentaire').addEventListener('input', function () { state.commentaire = this.value; majBoutonPresta(); });

    $$('.choice[data-taille]').forEach(function (el) {
      el.addEventListener('click', function () {
        selectDans('.choice[data-taille]', el);
        state.taille = el.dataset.taille;
        reconcileOptions(); renderOptions(); recalcEstimate();
      });
    });
    $$('.choice[data-longueur]').forEach(function (el) {
      el.addEventListener('click', function () {
        selectDans('.choice[data-longueur]', el);
        state.longueur = el.dataset.longueur;
        recalcEstimate();
      });
    });

    $('#btn-to-creneau').addEventListener('click', function () { showPage('page-creneau'); setStep(2); chargerJoursDispo(); });
    $('#btn-back-presta').addEventListener('click', function () { showPage('page-presta'); setStep(1); });

    $('#btn-choisir-date').addEventListener('click', function () {
      const inp = $('#date-rdv');
      inp.classList.toggle('hidden');
      inp.min = C.todayISO();
      inp.max = addDays(C.todayISO(), state.horizonDays || (VISIBILITE_DEFAUT * 7));
      if (!inp.classList.contains('hidden')) inp.focus();
    });
    $('#date-rdv').addEventListener('change', function () { choisirDatePrecise(this.value); });
    $('#btn-plus-dispo').addEventListener('click', function () { state.visibleN += VISIBLE_STEP; renderJours(); });

    $('#btn-to-coord').addEventListener('click', function () { showPage('page-coord'); setStep(3); });
    $('#btn-back-creneau').addEventListener('click', function () { showPage('page-creneau'); setStep(2); });

    $('#btn-to-recap').addEventListener('click', function () {
      state.prenom = $('#prenom').value.trim(); state.insta = $('#insta').value.trim(); state.tel = $('#tel').value.trim();
      $('#tel-err').textContent = '';
      if (!state.prenom || !state.insta) { toast('Merci de remplir votre prenom et votre Instagram.'); return; }
      if (!telValide(state.tel)) { $('#tel-err').textContent = 'Numero invalide. Format attendu : +33 6 12 34 56 78 ou 06 12 34 56 78.'; return; }
      remplirRecap(); showPage('page-recap'); setStep(4);
    });
    $('#btn-back-coord').addEventListener('click', function () { showPage('page-coord'); setStep(3); });

    $('#btn-valider').addEventListener('click', enregistrer);

    $('#btn-copy').addEventListener('click', function () {
      const txt = $('#msg-insta').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast('Message copie'); }, function () { fallbackCopy(txt); });
      else fallbackCopy(txt);
    });
  }
  function fallbackCopy(txt) {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Message copie'); } catch (e) { toast('Copie impossible, selectionnez le texte.'); }
    document.body.removeChild(ta);
  }

  init();
})();
