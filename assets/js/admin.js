// Logique de l'espace admin Faith Hair
(function () {
  'use strict';
  const C = window.FaithCore;
  const cfg = window.FAITH_CONFIG;
  const sb = C.sb;

  let reglages = {};
  let prestationsCache = [];
  let currentStatut = 'en_attente';
  let selection = new Set();
  let planningMode = 'jour';
  let planningRef = C.todayISO();

  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function euro(n) { if (n === null || n === undefined) return '-'; return (Math.round(Number(n) * 100) / 100).toString().replace('.', ',') + ' €'; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '-'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function battementMin() { return reglages.battement ? Number(reglages.battement.supplement_min || 0) : 30; }

  // ================= AUTH =================
  function tryLogin() {
    const val = $('#pwd').value;
    if (val === cfg.ADMIN_PASSWORD) {
      try { sessionStorage.setItem('faith_admin', '1'); } catch (e) {}
      ouvrirApp();
    } else {
      $('#login-err').textContent = 'Mot de passe incorrect.';
    }
  }
  function ouvrirApp() {
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    demarrer();
  }
  function estConnecte() { try { return sessionStorage.getItem('faith_admin') === '1'; } catch (e) { return false; } }

  // ================= DEMARRAGE =================
  async function demarrer() {
    try { reglages = await C.getReglages(); } catch (e) { console.error(e); }
    bindTabs();
    chargerCRM();
  }

  function bindTabs() {
    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        $$('.tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        const name = t.dataset.tab;
        $$('.tabpane').forEach(function (p) { p.classList.add('hidden'); });
        $('#tab-' + name).classList.remove('hidden');
        if (name === 'crm') chargerCRM();
        if (name === 'prestations') chargerPrestations();
        if (name === 'planning') chargerPlanning();
      });
    });
    $$('.subtab').forEach(function (s) {
      s.addEventListener('click', function () {
        $$('.subtab').forEach(function (x) { x.classList.remove('active'); });
        s.classList.add('active');
        currentStatut = s.dataset.statut;
        selection.clear();
        chargerCRM();
      });
    });
    $('#btn-add-presta').addEventListener('click', function () { modalPrestation(null); });
    $('#btn-reglages').addEventListener('click', modalReglages);
    $('#btn-dispos').addEventListener('click', modalDispos);
    $('#view-jour').addEventListener('click', function () {
      planningMode = 'jour'; planningRef = C.todayISO();
      $('#view-jour').classList.add('active'); $('#view-semaine').classList.remove('active');
      chargerPlanning();
    });
    $('#view-semaine').addEventListener('click', function () {
      planningMode = 'semaine';
      $('#view-semaine').classList.add('active'); $('#view-jour').classList.remove('active');
      chargerPlanning();
    });
  }

  // ================= CRM =================
  async function chargerCRM() {
    const zone = $('#crm-list');
    zone.innerHTML = '<p class="hint">Chargement...</p>';
    let q = sb.from('reservations').select('*').order('date_rdv', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
    if (currentStatut === 'corbeille') {
      q = q.not('supprime_le', 'is', null);
    } else {
      q = q.eq('statut', currentStatut).is('supprime_le', null);
    }
    const { data, error } = await q;
    if (error) { console.error(error); zone.innerHTML = '<p class="hint">Erreur de chargement.</p>'; return; }
    renderCRM(data || []);
  }

  function badge(r) {
    if (r.statut === 'en_attente') return '<span class="badge attente">En attente</span>';
    if (r.statut === 'confirme') return '<span class="badge confirme">Confirme</span>';
    if (r.statut === 'archive') return '<span class="badge ' + (r.archive_motif === 'annulee' ? 'annulee">Annulee' : 'archive">Realisee') + '</span>';
    return '';
  }

  function renderCRM(rows) {
    const zone = $('#crm-list');
    if (!rows.length) { zone.innerHTML = '<p class="hint">Aucune reservation dans cet onglet.</p>'; majBulk(); return; }
    zone.innerHTML = '';
    rows.forEach(function (r) {
      const row = document.createElement('div');
      row.className = 'list-row';
      const dateStr = r.date_rdv ? C.formatDateFR(r.date_rdv) + (r.heure_debut ? ' a ' + r.heure_debut.slice(0, 5) : '') : 'Date non definie';
      const montant = r.prix_final != null ? r.prix_final : (r.prix_facture != null ? r.prix_facture : r.prix_estime);
      row.innerHTML =
        '<input type="checkbox" data-id="' + r.id + '" ' + (selection.has(r.id) ? 'checked' : '') + ' />' +
        '<div class="info">' +
        '<div class="nom">' + esc(r.nom_presta || 'Autre') + ' ' + badge(r) + '</div>' +
        '<div class="sub">' + esc(r.prenom) + ' &middot; @' + esc(r.instagram) + '</div>' +
        '<div class="sub">' + esc(dateStr) + (r.duree_bloc_min ? ' &middot; ' + C.minToLabel(r.duree_bloc_min) : '') + '</div>' +
        '</div>' +
        '<div class="prix">' + euro(montant) + '</div>';
      row.querySelector('input').addEventListener('click', function (e) {
        e.stopPropagation();
        if (this.checked) selection.add(r.id); else selection.delete(r.id);
        majBulk();
      });
      row.addEventListener('click', function () { modalReservation(r); });
      zone.appendChild(row);
    });
    majBulk();
  }

  function majBulk() {
    const bar = $('#bulk-bar');
    if (!selection.size) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    $('#bulk-count').textContent = selection.size + ' selectionne(s)';
    const act = $('#bulk-actions');
    act.innerHTML = '';
    const boutons = actionsPourStatut(currentStatut, true);
    boutons.forEach(function (b) {
      const el = document.createElement('button');
      el.className = 'btn btn-sm ' + (b.danger ? 'btn-danger' : 'btn-ghost');
      el.textContent = b.label;
      el.addEventListener('click', function () { appliquerEnLot(b.action); });
      act.appendChild(el);
    });
  }

  function actionsPourStatut(statut, lot) {
    // renvoie liste { label, action, danger }
    if (statut === 'en_attente') return [
      { label: 'Confirmer', action: 'confirmer' },
      { label: 'Annuler', action: 'annuler' },
      { label: 'Supprimer', action: 'corbeille', danger: true }
    ];
    if (statut === 'confirme') return [
      { label: 'Marquer realisee', action: 'realisee' },
      { label: 'Remettre en attente', action: 'reattente' },
      { label: 'Supprimer', action: 'corbeille', danger: true }
    ];
    if (statut === 'archive') return [
      { label: 'Supprimer', action: 'corbeille', danger: true }
    ];
    if (statut === 'corbeille') return [
      { label: 'Restaurer', action: 'restaurer' },
      { label: 'Supprimer definitivement', action: 'purger', danger: true }
    ];
    return [];
  }

  async function appliquerAction(id, action, extra) {
    extra = extra || {};
    if (action === 'confirmer') {
      // verifier qu'un creneau et une duree existent
      const r = extra.row;
      if (!r.date_rdv || !r.heure_debut || !r.heure_fin) {
        toast('Renseignez creneau et duree avant de confirmer.');
        return false;
      }
      await sb.from('reservations').update({ statut: 'confirme', archive_motif: null }).eq('id', id);
    } else if (action === 'annuler') {
      await sb.from('reservations').update({ statut: 'archive', archive_motif: 'annulee' }).eq('id', id);
    } else if (action === 'realisee') {
      await sb.from('reservations').update({ statut: 'archive', archive_motif: 'realisee' }).eq('id', id);
    } else if (action === 'reattente') {
      await sb.from('reservations').update({ statut: 'en_attente', archive_motif: null }).eq('id', id);
    } else if (action === 'corbeille') {
      await sb.from('reservations').update({ supprime_le: new Date().toISOString() }).eq('id', id);
    } else if (action === 'restaurer') {
      await sb.from('reservations').update({ supprime_le: null }).eq('id', id);
    } else if (action === 'purger') {
      await sb.from('reservations').delete().eq('id', id);
    }
    return true;
  }

  async function appliquerEnLot(action) {
    if (action === 'purger' && !confirm('Supprimer definitivement les elements selectionnes ?')) return;
    const ids = Array.from(selection);
    for (let i = 0; i < ids.length; i++) {
      // pour confirmer en lot, on recharge la ligne pour verifier le creneau
      if (action === 'confirmer') {
        const { data } = await sb.from('reservations').select('*').eq('id', ids[i]).single();
        await appliquerAction(ids[i], action, { row: data });
      } else {
        await appliquerAction(ids[i], action);
      }
    }
    selection.clear();
    toast('Action appliquee.');
    chargerCRM();
  }

  // ---------- Modale detail reservation ----------
  function modalReservation(r) {
    const montantBase = r.prix_facture != null ? r.prix_facture : r.prix_estime;
    const body = document.createElement('div');
    body.innerHTML =
      '<h2>' + esc(r.nom_presta || 'Autre') + ' ' + badge(r) + '</h2>' +
      infoLigne('Cliente', esc(r.prenom) + ' &middot; @' + esc(r.instagram) + ' &middot; ' + esc(r.telephone)) +
      infoLigne('Meches', r.avec_meches ? 'Avec meches' : 'Sans meches') +
      infoLigne('Taille / Longueur', cap(r.taille) + ' / ' + cap(r.longueur)) +
      (r.est_autre && r.commentaire ? infoLigne('Commentaire', esc(r.commentaire)) : '') +
      infoLigne('Creneau', r.date_rdv ? (C.formatDateFR(r.date_rdv) + (r.heure_debut ? ' a ' + r.heure_debut.slice(0, 5) : '')) : 'Non defini') +
      infoLigne('Duree bloquee', r.duree_bloc_min ? C.minToLabel(r.duree_bloc_min) : 'Non definie') +
      infoLigne('Estimation initiale', euro(r.prix_estime)) +
      '<hr style="border:none;border-top:1px dashed var(--gris-rose);margin:16px 0" />' +
      '<h3>Facturation</h3>' +
      '<label class="field">Montant a facturer (&euro;)</label>' +
      '<input type="number" step="0.5" id="m-facture" value="' + (montantBase != null ? montantBase : '') + '" />' +
      '<label class="field">Remise</label>' +
      '<div style="display:flex;gap:8px">' +
        '<select id="m-remise-type" style="flex:1">' +
          '<option value="">Aucune</option>' +
          '<option value="pourcentage"' + (r.remise_type === 'pourcentage' ? ' selected' : '') + '>Pourcentage (%)</option>' +
          '<option value="montant"' + (r.remise_type === 'montant' ? ' selected' : '') + '>Montant (&euro;)</option>' +
        '</select>' +
        '<input type="number" step="0.5" id="m-remise-val" style="flex:1" value="' + (r.remise_valeur != null ? r.remise_valeur : '') + '" placeholder="Valeur" />' +
      '</div>' +
      '<div class="estimate mt"><div class="lbl">Total apres remise</div><div class="montant" id="m-total">-</div></div>' +
      (!r.duree_bloc_min ?
        '<label class="field">Duree de la prestation (minutes) - requise pour confirmer</label><input type="number" id="m-duree" placeholder="ex: 180" />' : '') +
      '<button class="btn btn-block mt" id="m-save">Enregistrer la facturation</button>' +
      '<h3 style="margin-top:22px">Actions</h3>' +
      '<div class="btn-row" id="m-actions"></div>' +
      '<button class="btn btn-ghost btn-block mt" id="m-replan">Replanifier le creneau</button>';

    const modal = ouvrirModal(body);

    function recalcTotal() {
      const base = Number($('#m-facture', body).value) || 0;
      const type = $('#m-remise-type', body).value;
      const val = Number($('#m-remise-val', body).value) || 0;
      $('#m-total', body).textContent = euro(C.appliquerRemise(base, type, val));
    }
    ['#m-facture', '#m-remise-type', '#m-remise-val'].forEach(function (s) {
      $(s, body).addEventListener('input', recalcTotal);
    });
    recalcTotal();

    $('#m-save', body).addEventListener('click', async function () {
      const base = $('#m-facture', body).value === '' ? null : Number($('#m-facture', body).value);
      const type = $('#m-remise-type', body).value || null;
      const val = $('#m-remise-val', body).value === '' ? null : Number($('#m-remise-val', body).value);
      const total = base != null ? C.appliquerRemise(base, type, val) : null;
      const patch = { prix_facture: base, remise_type: type, remise_valeur: val, prix_final: total };
      const durInput = $('#m-duree', body);
      if (durInput && durInput.value) {
        const d = Number(durInput.value);
        patch.duree_estimee_min = d;
        patch.duree_bloc_min = d + battementMin();
        if (r.heure_debut) patch.heure_fin = C.minToTime(C.timeToMin(r.heure_debut) + d + battementMin());
      }
      const { error } = await sb.from('reservations').update(patch).eq('id', r.id);
      if (error) { console.error(error); toast('Erreur.'); return; }
      toast('Facturation enregistree.');
      fermerModal(modal); chargerCRM();
    });

    // Actions selon statut
    const actionsWrap = $('#m-actions', body);
    let acts;
    if (r.supprime_le) acts = actionsPourStatut('corbeille');
    else acts = actionsPourStatut(r.statut);
    acts.forEach(function (a) {
      const b = document.createElement('button');
      b.className = 'btn btn-sm ' + (a.danger ? 'btn-danger' : '');
      b.textContent = a.label;
      b.addEventListener('click', async function () {
        if (a.action === 'purger' && !confirm('Supprimer definitivement ?')) return;
        const ok = await appliquerAction(r.id, a.action, { row: r });
        if (ok) { fermerModal(modal); chargerCRM(); toast('Fait.'); }
      });
      actionsWrap.appendChild(b);
    });

    $('#m-replan', body).addEventListener('click', function () { fermerModal(modal); modalReplanifier(r); });
  }

  function infoLigne(k, v) {
    return '<div class="recap-line"><span>' + k + '</span><span>' + v + '</span></div>';
  }

  // ---------- Replanification ----------
  function modalReplanifier(r) {
    const body = document.createElement('div');
    body.innerHTML =
      '<h2>Replanifier</h2>' +
      '<p class="muted small">' + esc(r.nom_presta || 'Autre') + ' &middot; ' + esc(r.prenom) + '</p>' +
      '<label class="field">Nouvelle date</label><input type="date" id="rp-date" min="' + C.todayISO() + '" />' +
      '<div class="mt small muted">Creneaux : <span style="color:var(--brun)">libre</span>, ' +
      '<span style="text-decoration:line-through">confirme</span>, <span style="opacity:.5">en attente</span></div>' +
      '<div id="rp-slots" class="mt"></div>';
    const modal = ouvrirModal(body);
    $('#rp-date', body).value = r.date_rdv || C.todayISO();

    async function render() {
      const dateStr = $('#rp-date', body).value;
      const zone = $('#rp-slots', body);
      if (!dateStr) return;
      zone.innerHTML = '<p class="hint">Chargement...</p>';
      const dureeEstimee = r.duree_estimee_min || 180;
      const dureeBloc = r.duree_bloc_min || (dureeEstimee + battementMin());

      const [horaires, exceptions, resList] = await Promise.all([
        C.getHoraires(), C.getExceptions(),
        sb.from('reservations').select('id,heure_debut,heure_fin,statut').eq('date_rdv', dateStr).in('statut', ['en_attente', 'confirme']).is('supprime_le', null).neq('id', r.id)
      ]);
      const jour = C.horairesDuJour(dateStr, horaires, exceptions);
      if (!jour.ouvert) { zone.innerHTML = '<p class="hint">Ferme ce jour.</p>'; return; }

      const occ = (resList.data || []).filter(function (x) { return x.heure_debut && x.heure_fin; }).map(function (x) {
        return { debut: C.timeToMin(x.heure_debut), fin: C.timeToMin(x.heure_fin), statut: x.statut };
      });
      const step = cfg.SLOT_STEP_MIN || 30;
      const grid = document.createElement('div');
      grid.className = 'slots';
      for (let s = jour.debut; s + dureeEstimee <= jour.fin; s += step) {
        const blocFin = s + dureeBloc;
        let etat = 'libre';
        for (let i = 0; i < occ.length; i++) {
          if (s < occ[i].fin && blocFin > occ[i].debut) {
            etat = occ[i].statut === 'confirme' ? 'barre' : 'grise';
            break;
          }
        }
        const el = document.createElement('div');
        el.className = 'slot' + (etat === 'barre' ? ' barre' : etat === 'grise' ? ' grise' : '');
        el.textContent = C.minToTime(s);
        if (etat === 'libre') {
          el.addEventListener('click', async function () {
            const heureFin = C.minToTime(s + dureeBloc);
            const { error } = await sb.from('reservations').update({
              date_rdv: dateStr, heure_debut: C.minToTime(s), heure_fin: heureFin
            }).eq('id', r.id);
            if (error) { console.error(error); toast('Erreur.'); return; }
            toast('Creneau mis a jour.');
            fermerModal(modal); chargerCRM();
          });
        }
        grid.appendChild(el);
      }
      zone.innerHTML = '';
      zone.appendChild(grid);
    }
    $('#rp-date', body).addEventListener('change', render);
    render();
  }

  // ================= PRESTATIONS =================
  async function chargerPrestations() {
    const zone = $('#presta-list');
    zone.innerHTML = '<p class="hint">Chargement...</p>';
    try {
      prestationsCache = await C.getPrestations(false);
    } catch (e) { console.error(e); zone.innerHTML = '<p class="hint">Erreur.</p>'; return; }
    if (!prestationsCache.length) { zone.innerHTML = '<p class="hint">Aucune prestation.</p>'; return; }
    zone.innerHTML = '';
    prestationsCache.forEach(function (p) {
      const meches = [];
      if (p.dispo_avec_meches) meches.push('avec');
      if (p.dispo_sans_meches) meches.push('sans');
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML =
        '<div class="info">' +
        '<div class="nom">' + esc(p.nom) + (p.actif ? '' : ' <span class="badge archive">Masquee</span>') + '</div>' +
        '<div class="sub">' + euro(p.prix_base) + ' &middot; ' + C.minToLabel(p.duree_base_min) + ' &middot; meches: ' + (meches.join(' + ') || 'aucune') + '</div>' +
        '<div class="sub" style="margin-top:4px">' + esc(p.descriptif) + '</div>' +
        '</div>' +
        '<div class="prix">&#9998;</div>';
      row.addEventListener('click', function () { modalPrestation(p); });
      zone.appendChild(row);
    });
  }

  function modalPrestation(p) {
    const est = p || { nom: '', descriptif: '', prix_base: 0, duree_base_min: 120, dispo_avec_meches: false, dispo_sans_meches: false, actif: true, ordre: 0 };
    const body = document.createElement('div');
    body.innerHTML =
      '<h2>' + (p ? 'Modifier' : 'Ajouter') + ' une prestation</h2>' +
      '<label class="field">Nom</label><input type="text" id="p-nom" value="' + esc(est.nom) + '" />' +
      '<label class="field">Descriptif court</label><textarea id="p-desc">' + esc(est.descriptif) + '</textarea>' +
      '<div style="display:flex;gap:10px">' +
        '<div style="flex:1"><label class="field">Prix de base (&euro;)</label><input type="number" step="0.5" id="p-prix" value="' + est.prix_base + '" /></div>' +
        '<div style="flex:1"><label class="field">Duree (min)</label><input type="number" id="p-duree" value="' + est.duree_base_min + '" /></div>' +
      '</div>' +
      '<label class="field">Disponibilite</label>' +
      '<label style="display:flex;align-items:center;gap:8px;font-weight:400"><input type="checkbox" id="p-avec" ' + (est.dispo_avec_meches ? 'checked' : '') + ' style="width:20px;height:20px"/> Avec meches</label>' +
      '<label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-top:6px"><input type="checkbox" id="p-sans" ' + (est.dispo_sans_meches ? 'checked' : '') + ' style="width:20px;height:20px"/> Sans meches</label>' +
      '<label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-top:6px"><input type="checkbox" id="p-actif" ' + (est.actif ? 'checked' : '') + ' style="width:20px;height:20px"/> Visible dans le questionnaire</label>' +
      '<button class="btn btn-block mt" id="p-save">Enregistrer</button>' +
      (p ? '<button class="btn btn-danger btn-block mt" id="p-del">Supprimer</button>' : '');
    const modal = ouvrirModal(body);

    $('#p-save', body).addEventListener('click', async function () {
      const patch = {
        nom: $('#p-nom', body).value.trim(),
        descriptif: $('#p-desc', body).value.trim(),
        prix_base: Number($('#p-prix', body).value) || 0,
        duree_base_min: Number($('#p-duree', body).value) || 0,
        dispo_avec_meches: $('#p-avec', body).checked,
        dispo_sans_meches: $('#p-sans', body).checked,
        actif: $('#p-actif', body).checked
      };
      if (!patch.nom) { toast('Le nom est requis.'); return; }
      let error;
      if (p) { ({ error } = await sb.from('prestations').update(patch).eq('id', p.id)); }
      else { ({ error } = await sb.from('prestations').insert(patch)); }
      if (error) { console.error(error); toast('Erreur.'); return; }
      toast('Enregistre.'); fermerModal(modal); chargerPrestations();
    });
    if (p) {
      $('#p-del', body).addEventListener('click', async function () {
        if (!confirm('Supprimer cette prestation ?')) return;
        const { error } = await sb.from('prestations').delete().eq('id', p.id);
        if (error) { console.error(error); toast('Erreur.'); return; }
        toast('Supprimee.'); fermerModal(modal); chargerPrestations();
      });
    }
  }

  // ================= REGLAGES (modale, icone cle a molette) =================
  async function modalReglages() {
    reglages = await C.getReglages();
    const defs = [
      { cle: 'taille_moyen', prix: true }, { cle: 'taille_petit', prix: true },
      { cle: 'longueur_long', prix: true }, { cle: 'battement', prix: false }
    ];
    const body = document.createElement('div');
    body.innerHTML =
      '<h2>Reglages</h2>' +
      '<p class="muted small">Supplements et battement. Ces valeurs alimentent le questionnaire et le calcul des durees.</p>' +
      '<div id="reglages-form">' +
      defs.map(function (d) {
        const r = reglages[d.cle] || {};
        return '<div style="border-bottom:1px solid var(--gris-rose);padding:10px 0">' +
          '<strong>' + esc(r.libelle || d.cle) + '</strong>' +
          '<div style="display:flex;gap:10px;margin-top:6px;align-items:flex-end">' +
          (d.prix ? '<div style="flex:1"><label class="field">Supplement prix (&euro;)</label><input type="number" step="0.5" data-cle="' + d.cle + '" data-champ="prix" value="' + (r.supplement_prix != null ? r.supplement_prix : '') + '" /></div>' : '') +
          '<div style="flex:1"><label class="field">Duree sup</label><input type="number" data-cle="' + d.cle + '" data-champ="min" value="' + (r.supplement_min != null ? r.supplement_min : 0) + '" /></div>' +
          '</div></div>';
      }).join('') +
      '</div>' +
      '<button class="btn btn-block mt" id="rg-save">Enregistrer</button>';
    const modal = ouvrirModal(body);
    $('#rg-save', body).addEventListener('click', async function () {
      const inputs = $$('#reglages-form input', body);
      const patchByCle = {};
      inputs.forEach(function (i) {
        const cle = i.dataset.cle;
        patchByCle[cle] = patchByCle[cle] || {};
        if (i.dataset.champ === 'prix') patchByCle[cle].supplement_prix = i.value === '' ? null : Number(i.value);
        else patchByCle[cle].supplement_min = Number(i.value) || 0;
      });
      for (const cle in patchByCle) {
        await sb.from('reglages').update(patchByCle[cle]).eq('cle', cle);
      }
      reglages = await C.getReglages();
      toast('Reglages enregistres.');
      fermerModal(modal);
    });
  }

  // ================= PLANNING =================
  async function chargerPlanning() {
    const nav = $('#planning-nav');
    const content = $('#planning-content');
    content.innerHTML = '<p class="hint">Chargement...</p>';
    if (planningMode === 'jour') {
      nav.innerHTML = '';
      const prev = boutonNav('&#8592;', function () { planningRef = decalerJour(planningRef, -1); chargerPlanning(); });
      const lbl = document.createElement('div'); lbl.style.flex = '1'; lbl.style.textAlign = 'center'; lbl.style.fontWeight = '600';
      lbl.innerHTML = C.formatDateFR(planningRef);
      const next = boutonNav('&#8594;', function () { planningRef = decalerJour(planningRef, 1); chargerPlanning(); });
      nav.appendChild(prev); nav.appendChild(lbl); nav.appendChild(next);
      await renderJour(planningRef);
    } else {
      const lundi = lundiDeLaSemaine(planningRef);
      nav.innerHTML = '';
      const prev = boutonNav('&#8592;', function () { planningRef = decalerJour(lundi, -7); chargerPlanning(); });
      const lbl = document.createElement('div'); lbl.style.flex = '1'; lbl.style.textAlign = 'center'; lbl.style.fontWeight = '600';
      lbl.innerHTML = 'Semaine du ' + C.formatDateFR(lundi);
      const next = boutonNav('&#8594;', function () { planningRef = decalerJour(lundi, 7); chargerPlanning(); });
      nav.appendChild(prev); nav.appendChild(lbl); nav.appendChild(next);
      await renderSemaine(lundi);
    }
  }
  function boutonNav(html, fn) { const b = document.createElement('button'); b.className = 'btn btn-ghost btn-sm'; b.innerHTML = html; b.addEventListener('click', fn); return b; }
  function ymdLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function decalerJour(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return ymdLocal(d); }
  function lundiDeLaSemaine(dateStr) { const d = new Date(dateStr + 'T00:00:00'); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return ymdLocal(d); }

  async function rdvDuJour(dateStr) {
    const { data } = await sb.from('reservations').select('*')
      .eq('date_rdv', dateStr).in('statut', ['confirme', 'en_attente']).is('supprime_le', null)
      .order('heure_debut');
    return data || [];
  }

  async function renderJour(dateStr) {
    const content = $('#planning-content');
    const [horaires, exceptions, rdv] = await Promise.all([C.getHoraires(), C.getExceptions(), rdvDuJour(dateStr)]);
    const jour = C.horairesDuJour(dateStr, horaires, exceptions);
    let html = '<div class="card">';
    html += '<div class="day-hours mb">' + (jour.ouvert ? 'Ouvert ' + C.minToTime(jour.debut) + ' - ' + C.minToTime(jour.fin) : 'Ferme') + '</div>';
    const confirmes = rdv.filter(function (r) { return r.statut === 'confirme'; });
    if (!confirmes.length) html += '<p class="hint">Aucun rendez-vous confirme.</p>';
    confirmes.forEach(function (r) {
      html += blocRdv(r);
    });
    const attente = rdv.filter(function (r) { return r.statut === 'en_attente'; });
    if (attente.length) {
      html += '<p class="muted small mt">En attente (non bloquant) :</p>';
      attente.forEach(function (r) { html += blocRdv(r); });
    }
    html += '</div>';
    content.innerHTML = html;
  }
  function blocRdv(r) {
    return '<div class="plan-block ' + (r.statut === 'en_attente' ? 'attente' : '') + '">' +
      '<div class="h">' + (r.heure_debut ? r.heure_debut.slice(0, 5) : '--') + (r.heure_fin ? ' - ' + r.heure_fin.slice(0, 5) : '') + '</div>' +
      '<div>' + esc(r.nom_presta || 'Autre') + ' &middot; ' + esc(r.prenom) + '</div>' +
      '</div>';
  }

  async function renderSemaine(lundi) {
    const content = $('#planning-content');
    const [horaires, exceptions] = await Promise.all([C.getHoraires(), C.getExceptions()]);
    let html = '<div class="card">';
    for (let i = 0; i < 7; i++) {
      const dateStr = decalerJour(lundi, i);
      const jour = C.horairesDuJour(dateStr, horaires, exceptions);
      const rdv = (await rdvDuJour(dateStr)).filter(function (r) { return r.statut === 'confirme'; });
      html += '<div class="week-day"><div class="jour">' + C.JOURS[i] + ' ' + dateStr.slice(8, 10) + '/' + dateStr.slice(5, 7) +
        ' <span class="day-hours">' + (jour.ouvert ? C.minToTime(jour.debut) + '-' + C.minToTime(jour.fin) : 'Ferme') + '</span></div>';
      if (rdv.length) rdv.forEach(function (r) { html += '<div class="small">' + (r.heure_debut ? r.heure_debut.slice(0, 5) : '') + ' &middot; ' + esc(r.nom_presta || 'Autre') + ' (' + esc(r.prenom) + ')</div>'; });
      else html += '<div class="small muted">-</div>';
      html += '</div>';
    }
    html += '</div>';
    content.innerHTML = html;
  }

  // ---------- Modale disponibilites (par semaine + horaires par defaut) ----------
  async function modalDispos() {
    const [horaires, exceptions] = await Promise.all([C.getHoraires(), C.getExceptions()]);
    const excMap = {};    exceptions.forEach(function (e) { excMap[e.date] = e; });
    const defautMap = {}; horaires.forEach(function (h) { defautMap[h.jour_semaine] = h; });

    let weekOffset = 0; // 0 = semaine en cours, jusqu'a 3 (4 semaines au total)
    const lundiCourant = lundiDeLaSemaine(C.todayISO());

    const body = document.createElement('div');
    body.innerHTML =
      '<h2>Mes disponibilites</h2>' +
      '<h3>Par semaine</h3>' +
      '<p class="muted small">Modifiez une semaine precise sans toucher aux autres. Perspective sur 4 semaines.</p>' +
      '<div id="wk-nav" style="display:flex;align-items:center;justify-content:space-between;margin:10px 0"></div>' +
      '<div id="wk-days"></div>' +
      '<button class="btn btn-block mt" id="wk-save">Enregistrer cette semaine</button>' +
      '<hr style="border:none;border-top:1px dashed var(--gris-rose);margin:22px 0" />' +
      '<h3 id="def-toggle" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center">Horaires par defaut <span class="chev">&#9662;</span></h3>' +
      '<div id="def-section" class="hidden">' +
      '<p class="muted small">Gabarit applique aux semaines non personnalisees.</p>' +
      '<div id="def-days"></div>' +
      '<button class="btn btn-ghost btn-block mt" id="def-save">Enregistrer les horaires par defaut</button>' +
      '</div>';
    const modal = ouvrirModal(body);

    function weekDates(off) {
      const l = decalerJour(lundiCourant, off * 7);
      const arr = [];
      for (let i = 0; i < 7; i++) arr.push(decalerJour(l, i));
      return arr;
    }
    function jj(d) { return d.slice(8, 10) + '/' + d.slice(5, 7); }
    function dayRow(scope, key, label, eff, perso) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gris-rose)">' +
        '<label style="width:104px;display:flex;align-items:center;gap:6px;font-weight:500"><input type="checkbox" class="' + scope + '-ouvert" data-key="' + key + '" ' + (eff.ouvert ? 'checked' : '') + ' style="width:18px;height:18px"/> ' + label.slice(0, 3) + (perso ? ' <span class="muted small">*</span>' : '') + '</label>' +
        '<input type="time" class="' + scope + '-debut" data-key="' + key + '" value="' + (eff.heure_debut ? eff.heure_debut.slice(0, 5) : '10:00') + '" style="flex:1" />' +
        '<input type="time" class="' + scope + '-fin" data-key="' + key + '" value="' + (eff.heure_fin ? eff.heure_fin.slice(0, 5) : '18:00') + '" style="flex:1" />' +
        '</div>';
    }

    function renderWeekNav() {
      const dates = weekDates(weekOffset);
      const nav = $('#wk-nav', body);
      nav.innerHTML = '';
      const prev = boutonNav('&#8592;', function () { if (weekOffset > 0) { weekOffset--; renderWeek(); } });
      prev.disabled = weekOffset <= 0;
      const lbl = document.createElement('div');
      lbl.style.flex = '1'; lbl.style.textAlign = 'center'; lbl.style.fontWeight = '600';
      lbl.textContent = 'Semaine du ' + jj(dates[0]) + ' au ' + jj(dates[6]);
      const next = boutonNav('&#8594;', function () { if (weekOffset < 3) { weekOffset++; renderWeek(); } });
      next.disabled = weekOffset >= 3;
      nav.appendChild(prev); nav.appendChild(lbl); nav.appendChild(next);
    }
    function renderWeek() {
      renderWeekNav();
      const dates = weekDates(weekOffset);
      $('#wk-days', body).innerHTML = dates.map(function (d, i) {
        const exc = excMap[d];
        const def = defautMap[i] || { ouvert: false, heure_debut: '10:00', heure_fin: '18:00' };
        const eff = exc ? exc : def;
        return dayRow('wk', d, C.JOURS[i], eff, !!exc);
      }).join('');
    }
    function renderDefault() {
      let html = '';
      for (let j = 0; j < 7; j++) {
        const def = defautMap[j] || { ouvert: false, heure_debut: '10:00', heure_fin: '18:00' };
        html += dayRow('def', String(j), C.JOURS[j], def, false);
      }
      $('#def-days', body).innerHTML = html;
    }

    $('#wk-save', body).addEventListener('click', async function () {
      const dates = weekDates(weekOffset);
      for (let i = 0; i < 7; i++) {
        const d = dates[i];
        const ouvert = $('.wk-ouvert[data-key="' + d + '"]', body).checked;
        const debut = $('.wk-debut[data-key="' + d + '"]', body).value;
        const fin = $('.wk-fin[data-key="' + d + '"]', body).value;
        const row = { date: d, ouvert: ouvert, heure_debut: ouvert ? debut : null, heure_fin: ouvert ? fin : null };
        const { data, error } = await sb.from('exceptions_dispo').upsert(row, { onConflict: 'date' }).select().single();
        if (!error && data) excMap[d] = data;
      }
      toast('Semaine enregistree.');
      renderWeek();
    });

    $('#def-save', body).addEventListener('click', async function () {
      for (let j = 0; j < 7; j++) {
        const ouvert = $('.def-ouvert[data-key="' + j + '"]', body).checked;
        const debut = $('.def-debut[data-key="' + j + '"]', body).value;
        const fin = $('.def-fin[data-key="' + j + '"]', body).value;
        await sb.from('horaires_par_defaut').update({ ouvert: ouvert, heure_debut: debut, heure_fin: fin }).eq('jour_semaine', j);
        defautMap[j] = { jour_semaine: j, ouvert: ouvert, heure_debut: debut, heure_fin: fin };
      }
      toast('Horaires par defaut enregistres.');
      renderWeek();
    });

    $('#def-toggle', body).addEventListener('click', function () {
      $('#def-section', body).classList.toggle('hidden');
    });

    renderWeek();
    renderDefault();
  }

  // ================= MODALE GENERIQUE =================
  function ouvrirModal(bodyEl) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const modal = document.createElement('div');
    modal.className = 'modal';
    const close = document.createElement('button');
    close.className = 'close'; close.innerHTML = '&times;';
    close.addEventListener('click', function () { fermerModal(overlay); });
    modal.appendChild(close);
    modal.appendChild(bodyEl);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) fermerModal(overlay); });
    $('#modal-root').appendChild(overlay);
    return overlay;
  }
  function fermerModal(overlay) { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }

  // ================= INIT =================
  $('#btn-login').addEventListener('click', tryLogin);
  $('#pwd').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryLogin(); });
  if (estConnecte()) ouvrirApp();
})();
