// Logique de l'espace cliente (questionnaire)
(function () {
  'use strict';
  const C = window.FaithCore;
  const cfg = window.FAITH_CONFIG;

  let prestations = [];
  let reglages = {};
  const state = {
    meches: null,          // true / false
    taille: null,          // gros / moyen / petit
    longueur: null,        // court / moyen / long
    prestationId: null,    // uuid ou null
    estAutre: false,
    commentaire: '',
    prenom: '', insta: '', tel: '',
    date: null, heureDebut: null,
    estimate: null         // { prix, duree, bloc }
  };

  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function euro(n) { return (Math.round(Number(n) * 100) / 100).toString().replace('.', ',') + ' €'; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  // ---------- Navigation ----------
  const pages = ['page-intro', 'page-presta', 'page-creneau', 'page-coord', 'page-recap', 'page-confirm'];
  function showPage(id) {
    pages.forEach(function (p) { $('#' + p).classList.toggle('hidden', p !== id); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function setStep(n) {
    const st = $('#stepper');
    st.classList.toggle('hidden', n < 1);
    $$('#stepper .step').forEach(function (el) {
      const s = Number(el.dataset.step);
      el.classList.toggle('active', s === n);
      el.classList.toggle('done', s < n);
    });
  }

  // ---------- Chargement initial ----------
  async function init() {
    try {
      const res = await Promise.all([C.getPrestations(true), C.getReglages()]);
      prestations = res[0];
      reglages = res[1];
      injecterSupplements();
    } catch (e) {
      console.error(e);
      toast('Erreur de chargement, reessayez.');
    }
    bindEvents();
    $('#date-rdv').min = C.todayISO();
  }

  function supPrix(cle) {
    const r = reglages[cle];
    return r && r.supplement_prix ? '+' + Number(r.supplement_prix) + '€' : '';
  }
  function injecterSupplements() {
    const m = $('[data-sup="taille-moyen"]'); if (m) m.textContent = supPrix('taille_moyen');
    const p = $('[data-sup="taille-petit"]'); if (p) p.textContent = supPrix('taille_petit');
    const l = $('[data-sup="longueur-long"]'); if (l) l.textContent = supPrix('longueur_long');
  }

  // ---------- Modeles filtres ----------
  function remplirModeles() {
    const sel = $('#select-modele');
    sel.innerHTML = '<option value="">Selectionnez un modele</option>';
    const dispo = prestations.filter(function (p) {
      return state.meches ? p.dispo_avec_meches : p.dispo_sans_meches;
    });
    dispo.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nom + ' - a partir de ' + Number(p.prix_base) + '€';
      sel.appendChild(opt);
    });
    const autre = document.createElement('option');
    autre.value = '__autre__';
    autre.textContent = 'Autre (a preciser)';
    sel.appendChild(autre);
    sel.disabled = false;
    $('#modele-hint').classList.add('hidden');
  }

  // ---------- Estimation ----------
  function recalcEstimate() {
    const box = $('#estimate-box');
    if (state.estAutre) {
      box.classList.remove('hidden');
      $('#estimate-montant').textContent = 'En DM';
      state.estimate = null;
      majBoutonPresta();
      return;
    }
    if (!state.prestationId || !state.taille || !state.longueur) {
      box.classList.add('hidden');
      state.estimate = null;
      majBoutonPresta();
      return;
    }
    const presta = prestations.find(function (p) { return p.id === state.prestationId; });
    state.estimate = C.computeEstimate(presta, state.taille, state.longueur, reglages);
    box.classList.remove('hidden');
    $('#estimate-montant').textContent = euro(state.estimate.prix);
    majBoutonPresta();
  }

  function prestaComplete() {
    if (state.meches === null || !state.taille || !state.longueur) return false;
    if (state.estAutre) return state.commentaire.trim().length > 0;
    return !!state.prestationId;
  }
  function majBoutonPresta() {
    $('#btn-to-creneau').disabled = !prestaComplete();
  }

  // ---------- Creneaux ----------
  async function chargerCreneaux(dateStr) {
    const zone = $('#slots-zone');
    zone.innerHTML = '<p class="hint">Chargement...</p>';
    state.heureDebut = null;
    $('#btn-to-coord').disabled = true;

    let dureeEstimee, dureeBloc;
    if (state.estimate) {
      dureeEstimee = state.estimate.duree;
      dureeBloc = state.estimate.bloc;
    } else {
      const battement = reglages.battement ? Number(reglages.battement.supplement_min || 0) : 30;
      dureeEstimee = 180;
      dureeBloc = 180 + battement;
    }

    try {
      const [horaires, exceptions, occ] = await Promise.all([
        C.getHoraires(), C.getExceptions(), C.occupantsDuJour(dateStr)
      ]);
      const slots = C.creneauxDisponibles(dateStr, dureeEstimee, dureeBloc, horaires, exceptions, occ);
      if (!slots.length) {
        zone.innerHTML = '<p class="hint">Aucun creneau disponible ce jour. Essayez une autre date.</p>';
        return;
      }
      const grid = document.createElement('div');
      grid.className = 'slots';
      slots.forEach(function (min) {
        const b = document.createElement('div');
        b.className = 'slot';
        b.textContent = C.minToTime(min);
        b.addEventListener('click', function () {
          grid.querySelectorAll('.slot').forEach(function (s) { s.classList.remove('selected'); });
          b.classList.add('selected');
          state.heureDebut = C.minToTime(min);
          $('#btn-to-coord').disabled = false;
        });
        grid.appendChild(b);
      });
      zone.innerHTML = '';
      zone.appendChild(grid);
    } catch (e) {
      console.error(e);
      zone.innerHTML = '<p class="hint">Erreur de chargement des creneaux.</p>';
    }
  }

  // ---------- Validation telephone ----------
  // Accepte un numero francais : +33 suivi de 9 chiffres, ou 0 suivi de 9 chiffres.
  function telValide(valeur) {
    const net = valeur.replace(/[\s.\-()]/g, '');
    return /^(?:\+33|0)[1-9]\d{8}$/.test(net);
  }

  // ---------- Recap ----------
  function libelleMeches() { return state.meches ? 'Avec meches' : 'Sans meches'; }
  function nomModele() {
    if (state.estAutre) return 'Autre';
    const p = prestations.find(function (x) { return x.id === state.prestationId; });
    return p ? p.nom : '';
  }
  function remplirRecap() {
    const lignes = [
      ['Modele', nomModele()],
      ['Meches', libelleMeches()],
      ['Taille de tresse', cap(state.taille)],
      ['Longueur', cap(state.longueur)]
    ];
    if (state.estAutre && state.commentaire) lignes.push(['Commentaire', state.commentaire]);
    lignes.push(['Date', C.formatDateFR(state.date)]);
    lignes.push(['Heure', state.heureDebut]);
    lignes.push(['Prenom', state.prenom]);
    lignes.push(['Instagram', '@' + state.insta.replace(/^@/, '')]);
    lignes.push(['Telephone', state.tel]);
    lignes.push(['Estimation', state.estimate ? euro(state.estimate.prix) : 'A confirmer en DM']);
    $('#recap-content').innerHTML = lignes.map(function (l) {
      return '<div class="recap-line"><span>' + l[0] + '</span><span>' + escapeHtml(l[1]) + '</span></div>';
    }).join('');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------- Message Instagram ----------
  function construireMessage() {
    const l = [];
    l.push('Bonjour Faith Hair, je viens de remplir le formulaire de reservation.');
    l.push('Prenom : ' + state.prenom);
    if (state.estAutre) {
      l.push('Prestation : Autre - ' + state.commentaire);
    } else {
      l.push('Prestation : ' + nomModele() + ' (' + libelleMeches().toLowerCase() + ')');
    }
    l.push('Taille : ' + cap(state.taille) + ' / Longueur : ' + cap(state.longueur));
    l.push('Creneau souhaite : ' + C.formatDateFR(state.date) + ' a ' + state.heureDebut);
    l.push(state.estimate ? ('Estimation : ' + euro(state.estimate.prix) + ' (a confirmer)') : 'Tarif a confirmer en DM.');
    l.push('Je reste en attente du lien pour l\'acompte de 10 euros. Merci !');
    return l.join('\n');
  }

  // ---------- Enregistrement ----------
  async function enregistrer() {
    const btn = $('#btn-valider');
    btn.disabled = true; btn.textContent = 'Enregistrement...';

    let heureFin = null, dureeEstimee = null, dureeBloc = null, prixEstime = null;
    if (state.estimate) {
      dureeEstimee = state.estimate.duree;
      dureeBloc = state.estimate.bloc;
      prixEstime = state.estimate.prix;
      heureFin = C.minToTime(C.timeToMin(state.heureDebut) + state.estimate.bloc);
    }

    const row = {
      statut: 'en_attente',
      prenom: state.prenom,
      instagram: state.insta.replace(/^@/, ''),
      telephone: state.tel,
      prestation_id: state.estAutre ? null : state.prestationId,
      nom_presta: nomModele(),
      est_autre: state.estAutre,
      avec_meches: state.meches,
      taille: state.taille,
      longueur: state.longueur,
      commentaire: state.commentaire,
      prix_estime: prixEstime,
      duree_estimee_min: dureeEstimee,
      duree_bloc_min: dureeBloc,
      date_rdv: state.date,
      heure_debut: state.heureDebut,
      heure_fin: heureFin
    };

    const { error } = await C.sb.from('reservations').insert(row);
    if (error) {
      console.error(error);
      toast('Erreur, reessayez.');
      btn.disabled = false; btn.textContent = 'Valider ma demande';
      return;
    }

    $('#msg-insta').textContent = construireMessage();
    $('#insta-handle').textContent = cfg.INSTAGRAM;
    setStep(0);
    showPage('page-confirm');
  }

  // ---------- Evenements ----------
  function selectDans(groupeSel, el) {
    $$(groupeSel).forEach(function (x) { x.classList.remove('selected'); });
    el.classList.add('selected');
  }

  function bindEvents() {
    $('#btn-start').addEventListener('click', function () {
      showPage('page-presta'); setStep(1);
    });

    // Choix mèches
    $$('.choice[data-meches]').forEach(function (el) {
      el.addEventListener('click', function () {
        selectDans('.choice[data-meches]', el);
        state.meches = el.dataset.meches === 'true';
        // reset modele car la liste change
        state.prestationId = null; state.estAutre = false;
        $('#commentaire-wrap').classList.add('hidden');
        remplirModeles();
        recalcEstimate();
      });
    });

    // Choix taille
    $$('.choice[data-taille]').forEach(function (el) {
      el.addEventListener('click', function () {
        selectDans('.choice[data-taille]', el);
        state.taille = el.dataset.taille;
        recalcEstimate();
      });
    });

    // Choix longueur
    $$('.choice[data-longueur]').forEach(function (el) {
      el.addEventListener('click', function () {
        selectDans('.choice[data-longueur]', el);
        state.longueur = el.dataset.longueur;
        recalcEstimate();
      });
    });

    // Selection modele
    $('#select-modele').addEventListener('change', function () {
      const v = this.value;
      if (v === '__autre__') {
        state.estAutre = true; state.prestationId = null;
        $('#commentaire-wrap').classList.remove('hidden');
      } else if (v) {
        state.estAutre = false; state.prestationId = v;
        $('#commentaire-wrap').classList.add('hidden');
      } else {
        state.estAutre = false; state.prestationId = null;
      }
      recalcEstimate();
    });
    $('#commentaire').addEventListener('input', function () {
      state.commentaire = this.value;
      majBoutonPresta();
    });

    // Vers creneau
    $('#btn-to-creneau').addEventListener('click', function () {
      showPage('page-creneau'); setStep(2);
    });
    $('#btn-back-presta').addEventListener('click', function () {
      showPage('page-presta'); setStep(1);
    });
    $('#date-rdv').addEventListener('change', function () {
      state.date = this.value;
      if (state.date) chargerCreneaux(state.date);
    });

    // Vers coordonnees
    $('#btn-to-coord').addEventListener('click', function () {
      showPage('page-coord'); setStep(3);
    });
    $('#btn-back-creneau').addEventListener('click', function () {
      showPage('page-creneau'); setStep(2);
    });

    // Vers recap (avec validation)
    $('#btn-to-recap').addEventListener('click', function () {
      state.prenom = $('#prenom').value.trim();
      state.insta = $('#insta').value.trim();
      state.tel = $('#tel').value.trim();
      $('#tel-err').textContent = '';
      if (!state.prenom || !state.insta) {
        toast('Merci de remplir votre prenom et votre Instagram.');
        return;
      }
      if (!telValide(state.tel)) {
        $('#tel-err').textContent = 'Numero invalide. Format attendu : +33 6 12 34 56 78 ou 06 12 34 56 78.';
        return;
      }
      remplirRecap();
      showPage('page-recap'); setStep(4);
    });
    $('#btn-back-coord').addEventListener('click', function () {
      showPage('page-coord'); setStep(3);
    });

    // Valider
    $('#btn-valider').addEventListener('click', enregistrer);

    // Copier message
    $('#btn-copy').addEventListener('click', function () {
      const txt = $('#msg-insta').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { toast('Message copie'); },
          function () { fallbackCopy(txt); });
      } else { fallbackCopy(txt); }
    });
  }

  function fallbackCopy(txt) {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Message copie'); }
    catch (e) { toast('Copie impossible, selectionnez le texte.'); }
    document.body.removeChild(ta);
  }

  init();
})();
