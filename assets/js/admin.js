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
  function instaLien(pseudo) {
    const p = String(pseudo || '').replace(/^@/, '');
    return '<a href="https://www.instagram.com/' + encodeURIComponent(p) + '/" target="_blank" rel="noopener">@' + esc(p) + '</a>';
  }
  function telLien(num) {
    const n = String(num || '');
    const compact = n.replace(/[^\d+]/g, '');
    return '<a href="tel:' + compact + '">' + esc(n) + '</a>';
  }
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
    $('#btn-new-resa').addEventListener('click', modalNouvelleResa);
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
      '<div class="recap-line"><span>Cliente <button id="btn-edit-cliente" title="Modifier les infos" aria-label="Modifier les infos" style="background:none;border:none;cursor:pointer;color:var(--brun-clair);padding:0 4px"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button></span><span>' + esc(r.prenom) + ' &middot; ' + instaLien(r.instagram) + ' &middot; ' + telLien(r.telephone) + '</span></div>' +
      infoLigne('Taille / Longueur', cap(r.taille) + ' / ' + cap(r.longueur)) +
      (r.options && r.options.length ? infoLigne('Options', r.options.map(function (o) { return esc(o.nom); }).join(', ')) : '') +
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

    $('#btn-edit-cliente', body).addEventListener('click', function () { modalEditCliente(r, modal); });

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

  // Petite fenetre d'edition des infos cliente (ouverte depuis le crayon)
  function modalEditCliente(r, parentModal) {
    const body = document.createElement('div');
    body.innerHTML =
      '<h2>Modifier les infos cliente</h2>' +
      '<label class="field">Prenom</label><input type="text" id="ec-prenom" value="' + esc(r.prenom) + '" />' +
      '<label class="field">Instagram</label><input type="text" id="ec-insta" value="' + esc(r.instagram) + '" />' +
      '<label class="field">Telephone</label><input type="text" id="ec-tel" value="' + esc(r.telephone) + '" />' +
      '<button class="btn btn-block mt" id="ec-save">Enregistrer</button>';
    const modal = ouvrirModal(body);
    $('#ec-save', body).addEventListener('click', async function () {
      const patch = {
        prenom: $('#ec-prenom', body).value.trim(),
        instagram: $('#ec-insta', body).value.trim().replace(/^@/, ''),
        telephone: $('#ec-tel', body).value.trim()
      };
      const { error } = await sb.from('reservations').update(patch).eq('id', r.id);
      if (error) { console.error(error); toast('Erreur.'); return; }
      toast('Infos cliente mises a jour.');
      fermerModal(modal); fermerModal(parentModal); chargerCRM();
    });
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
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML =
        '<div class="info">' +
        '<div class="nom">' + esc(p.nom) + (p.longueur_active === false ? ' <span class="badge archive">taille seule</span>' : '') + '</div>' +
        '<div class="sub">' + euro(p.prix_base) + ' &middot; ' + C.minToLabel(p.duree_base_min) + ' a ' + C.minToLabel(p.duree_max_min != null ? p.duree_max_min : p.duree_base_min) + '</div>' +
        '<div class="sub" style="margin-top:4px">' + esc(p.descriptif) + '</div>' +
        '</div>' +
        '<div class="prix">&#9998;</div>';
      row.addEventListener('click', function () { modalPrestation(p); });
      zone.appendChild(row);
    });
  }

  async function modalPrestation(p) {
    const opts = await C.getOptions(false);
    const est = p || { nom: '', descriptif: '', prix_base: 0, duree_base_min: 120, duree_max_min: 240, taille_active: true, taille_mode: 'standard', taille_perso: {}, longueur_active: true, longueur_mode: 'standard', longueur_perso: {}, options_exclues: [] };
    const tperso = est.taille_perso || {}, lperso = est.longueur_perso || {};
    function persoRow(scope, k, label) {
      const c = (scope === 't' ? tperso : lperso)[k] || {};
      const dispo = c.dispo !== undefined ? c.dispo : true;
      const prix = c.prix != null ? c.prix : 0;
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0">' +
        '<label style="flex:1;display:flex;align-items:center;gap:6px;font-weight:400"><input type="checkbox" class="' + scope + 'p-dispo" data-k="' + k + '" ' + (dispo ? 'checked' : '') + ' style="width:18px;height:18px"/> ' + label + '</label>' +
        '<span style="display:flex;align-items:center;gap:4px"><input type="number" step="0.5" class="' + scope + 'p-prix" data-k="' + k + '" value="' + prix + '" style="width:80px"/> &euro;</span></div>';
    }
    const body = document.createElement('div');
    body.innerHTML =
      '<h2>' + (p ? 'Modifier' : 'Ajouter') + ' une prestation</h2>' +
      '<label class="field">Nom</label><input type="text" id="p-nom" value="' + esc(est.nom) + '" />' +
      '<label class="field">Descriptif court</label><textarea id="p-desc">' + esc(est.descriptif) + '</textarea>' +
      '<label class="field">Prix de base (&euro;)</label><input type="number" step="0.5" id="p-prix" value="' + est.prix_base + '" />' +
      '<div style="display:flex;gap:10px">' +
        '<div style="flex:1"><label class="field">Duree mini - gros (min)</label><input type="number" id="p-duree" value="' + est.duree_base_min + '" /></div>' +
        '<div style="flex:1"><label class="field">Duree maxi - petit (min)</label><input type="number" id="p-dureemax" value="' + (est.duree_max_min != null ? est.duree_max_min : est.duree_base_min) + '" /></div>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-weight:500;margin-top:14px"><input type="checkbox" id="p-taille-active" ' + (est.taille_active !== false ? 'checked' : '') + ' style="width:20px;height:20px"/> Proposer le choix de la taille</label>' +
      '<div id="p-taille-cfg" class="' + (est.taille_active === false ? 'hidden' : '') + '" style="padding-left:10px;margin-top:6px">' +
        '<select id="p-taille-mode"><option value="standard"' + (est.taille_mode !== 'perso' ? ' selected' : '') + '>Prix standard</option><option value="perso"' + (est.taille_mode === 'perso' ? ' selected' : '') + '>Prix personnalise</option></select>' +
        '<div id="p-taille-perso" class="' + (est.taille_mode === 'perso' ? '' : 'hidden') + '" style="margin-top:8px">' + persoRow('t', 'gros', 'Gros') + persoRow('t', 'moyen', 'Moyen') + persoRow('t', 'petit', 'Petit') + '</div>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-weight:500;margin-top:14px"><input type="checkbox" id="p-longueur-active" ' + (est.longueur_active !== false ? 'checked' : '') + ' style="width:20px;height:20px"/> Proposer le choix de la longueur</label>' +
      '<div id="p-longueur-cfg" class="' + (est.longueur_active === false ? 'hidden' : '') + '" style="padding-left:10px;margin-top:6px">' +
        '<select id="p-longueur-mode"><option value="standard"' + (est.longueur_mode !== 'perso' ? ' selected' : '') + '>Prix standard</option><option value="perso"' + (est.longueur_mode === 'perso' ? ' selected' : '') + '>Prix personnalise</option></select>' +
        '<div id="p-longueur-perso" class="' + (est.longueur_mode === 'perso' ? '' : 'hidden') + '" style="margin-top:8px">' + persoRow('l', 'court', 'Court') + persoRow('l', 'moyen', 'Moyen') + persoRow('l', 'long', 'Long') + '</div>' +
      '</div>' +
      '<div style="border:1px solid var(--gris-rose);border-radius:12px;margin-top:14px;overflow:hidden">' +
        '<div id="po-head" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;font-weight:600;color:var(--brun-fonce)">Supplements proposes <span class="chev">&#9662;</span></div>' +
        '<div id="po-body" class="hidden" style="padding:0 14px 14px">' +
        (opts.length ? opts.map(function (o) {
          const exclu = (est.options_exclues || []).indexOf(o.id) >= 0;
          return '<label style="display:flex;align-items:center;gap:8px;font-weight:400;padding:5px 0"><input type="checkbox" class="po-opt" data-id="' + o.id + '" ' + (exclu ? '' : 'checked') + ' style="width:20px;height:20px"/> ' + esc(o.nom) + '</label>';
        }).join('') : '<p class="hint">Aucun supplement defini.</p>') +
        '</div></div>' +
      '<button class="btn btn-block mt" id="p-save">Enregistrer</button>' +
      (p ? '<button class="btn btn-danger btn-block mt" id="p-del">Supprimer</button>' : '');
    const modal = ouvrirModal(body);
    $('#po-head', body).addEventListener('click', function () { $('#po-body', body).classList.toggle('hidden'); });
    $('#p-taille-active', body).addEventListener('change', function () { $('#p-taille-cfg', body).classList.toggle('hidden', !this.checked); });
    $('#p-taille-mode', body).addEventListener('change', function () { $('#p-taille-perso', body).classList.toggle('hidden', this.value !== 'perso'); });
    $('#p-longueur-active', body).addEventListener('change', function () { $('#p-longueur-cfg', body).classList.toggle('hidden', !this.checked); });
    $('#p-longueur-mode', body).addEventListener('change', function () { $('#p-longueur-perso', body).classList.toggle('hidden', this.value !== 'perso'); });

    function buildPerso(scope) {
      const obj = {}; const keys = scope === 't' ? ['gros', 'moyen', 'petit'] : ['court', 'moyen', 'long'];
      keys.forEach(function (k) { obj[k] = { dispo: $('.' + scope + 'p-dispo[data-k="' + k + '"]', body).checked, prix: Number($('.' + scope + 'p-prix[data-k="' + k + '"]', body).value) || 0 }; });
      return obj;
    }

    $('#p-save', body).addEventListener('click', async function () {
      const exclues = [];
      $$('.po-opt', body).forEach(function (cb) { if (!cb.checked) exclues.push(cb.dataset.id); });
      const tActive = $('#p-taille-active', body).checked, tMode = $('#p-taille-mode', body).value;
      const lActive = $('#p-longueur-active', body).checked, lMode = $('#p-longueur-mode', body).value;
      const patch = {
        nom: $('#p-nom', body).value.trim(),
        descriptif: $('#p-desc', body).value.trim(),
        prix_base: Number($('#p-prix', body).value) || 0,
        duree_base_min: Number($('#p-duree', body).value) || 0,
        duree_max_min: Number($('#p-dureemax', body).value) || 0,
        taille_active: tActive, taille_mode: tMode, taille_perso: (tActive && tMode === 'perso') ? buildPerso('t') : {},
        longueur_active: lActive, longueur_mode: lMode, longueur_perso: (lActive && lMode === 'perso') ? buildPerso('l') : {},
        options_exclues: exclues,
        actif: true
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

  // ================= REGLAGES (modale, toggles fermes) =================
  function rgTexte(cle, label, multi) {
    const r = reglages[cle] || {};
    const v = r.valeur_texte != null ? r.valeur_texte : '';
    if (multi) return '<label class="field">' + label + '</label><textarea data-cle="' + cle + '" data-champ="texte">' + esc(v) + '</textarea>';
    return '<label class="field">' + label + '</label><input type="text" data-cle="' + cle + '" data-champ="texte" value="' + esc(v) + '" />';
  }
  function rgPrix(cle, label) {
    const r = reglages[cle] || {};
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gris-rose)">' +
      '<span>' + label + '</span>' +
      '<span style="display:flex;align-items:center;gap:4px"><input type="number" step="0.5" style="width:90px" data-cle="' + cle + '" data-champ="prix" value="' + (r.supplement_prix != null ? r.supplement_prix : 0) + '" /> &euro;</span>' +
      '</div>';
  }
  function rgPrixDuree(cle, label) {
    const r = reglages[cle] || {};
    return '<div style="padding:8px 0;border-bottom:1px solid var(--gris-rose)"><strong>' + label + '</strong>' +
      '<div style="display:flex;gap:10px;margin-top:6px;align-items:flex-end">' +
      '<div style="flex:1"><label class="field">Prix (&euro;)</label><input type="number" step="0.5" data-cle="' + cle + '" data-champ="prix" value="' + (r.supplement_prix != null ? r.supplement_prix : 0) + '" /></div>' +
      '<div style="flex:1"><label class="field">Duree sup (min)</label><input type="number" data-cle="' + cle + '" data-champ="min" value="' + (r.supplement_min != null ? r.supplement_min : 0) + '" /></div>' +
      '</div></div>';
  }
  function rgSection(sec, titre, contenu) {
    return '<div class="rg-sec" style="border:1px solid var(--gris-rose);border-radius:12px;margin-bottom:10px;overflow:hidden">' +
      '<h3 class="rg-head" data-sec="' + sec + '" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;margin:0;padding:14px 16px;font-size:1.05rem">' + titre + ' <span class="chev">&#9662;</span></h3>' +
      '<div class="rg-body hidden" data-body="' + sec + '" style="padding:0 16px 16px">' + contenu + '</div></div>';
  }

  async function modalReglages() {
    reglages = await C.getReglages();
    let opts = await C.getOptions(false);
    const body = document.createElement('div');
    body.innerHTML =
      '<h2>Reglages</h2>' +
      rgSection('intro', 'Page d\'intro',
        rgTexte('intro_titre', 'Titre', false) +
        rgTexte('intro_principal', 'Texte principal', true) +
        rgTexte('intro_secondaire', 'Texte secondaire', true)) +
      rgSection('taille', 'Option taille de tresse standard',
        rgPrix('taille_gros', 'Gros') + rgPrix('taille_moyen', 'Moyen') + rgPrix('taille_petit', 'Petit')) +
      rgSection('longueur', 'Option longueur standard',
        rgPrixDuree('longueur_court', 'Court') + rgPrixDuree('longueur_moyen', 'Moyen') + rgPrixDuree('longueur_long', 'Long')) +
      rgSection('battement', 'Battement entre deux rendez-vous',
        '<label class="field">Duree (min)</label><input type="number" data-cle="battement" data-champ="min" value="' + (reglages.battement ? (reglages.battement.supplement_min != null ? reglages.battement.supplement_min : 0) : 30) + '" />') +
      rgSection('visibilite', 'Visibilite des creneaux (cliente)',
        '<label class="field">Nombre de semaines affichees a la cliente</label><input type="number" min="1" max="12" data-cle="visibilite_semaines" data-champ="min" value="' + (reglages.visibilite_semaines ? (reglages.visibilite_semaines.supplement_min != null ? reglages.visibilite_semaines.supplement_min : 2) : 2) + '" />') +
      rgSection('options', 'Supplements (melange de meches, perles...)',
        '<div id="rg-options-list"></div><button class="btn btn-ghost btn-block mt" id="rg-add-option">+ Ajouter un supplement</button>') +
      '<button class="btn btn-block mt" id="rg-save">Enregistrer</button>';
    const modal = ouvrirModal(body);

    $$('.rg-head', body).forEach(function (h) {
      h.addEventListener('click', function () {
        const sec = h.dataset.sec;
        $('.rg-body[data-body="' + sec + '"]', body).classList.toggle('hidden');
        h.parentNode.classList.toggle('open');
      });
    });

    function pxOpt(v) { return v == null ? '-' : Number(v) + '€'; }
    function renderOptionsAdmin() {
      const list = $('#rg-options-list', body);
      if (!opts.length) { list.innerHTML = '<p class="hint">Aucune option.</p>'; return; }
      list.innerHTML = opts.map(function (o) {
        return '<div class="list-row" data-id="' + o.id + '" style="cursor:pointer">' +
          '<div class="info"><div class="nom">' + esc(o.nom) + (o.actif ? '' : ' <span class="badge archive">Masquee</span>') + '</div>' +
          '<div class="sub">Gros ' + pxOpt(o.prix_gros) + ' &middot; Moyen ' + pxOpt(o.prix_moyen) + ' &middot; Petit ' + pxOpt(o.prix_petit) + '</div></div>' +
          '<div class="prix">&#9998;</div></div>';
      }).join('');
      $$('#rg-options-list .list-row', body).forEach(function (row) {
        row.addEventListener('click', function () { const o = opts.find(function (x) { return x.id === row.dataset.id; }); modalEditOption(o, refreshOpts); });
      });
    }
    async function refreshOpts() { opts = await C.getOptions(false); renderOptionsAdmin(); }
    renderOptionsAdmin();
    $('#rg-add-option', body).addEventListener('click', function () { modalEditOption(null, refreshOpts); });

    $('#rg-save', body).addEventListener('click', async function () {
      const champs = $$('.rg-body input, .rg-body textarea', body);
      const patchByCle = {};
      champs.forEach(function (i) {
        const cle = i.dataset.cle; if (!cle) return;
        patchByCle[cle] = patchByCle[cle] || {};
        if (i.dataset.champ === 'prix') patchByCle[cle].supplement_prix = i.value === '' ? null : Number(i.value);
        else if (i.dataset.champ === 'min') patchByCle[cle].supplement_min = Number(i.value) || 0;
        else if (i.dataset.champ === 'texte') patchByCle[cle].valeur_texte = i.value;
      });
      for (const cle in patchByCle) { await sb.from('reglages').update(patchByCle[cle]).eq('cle', cle); }
      reglages = await C.getReglages();
      toast('Reglages enregistres.');
      fermerModal(modal);
    });
  }

  // Editeur d'une option (creation / modification / suppression)
  function modalEditOption(o, onDone) {
    const est = o || { nom: '', prix_gros: '', prix_moyen: '', prix_petit: '', duree_min: 0, actif: true };
    const body = document.createElement('div');
    body.innerHTML =
      '<h2>' + (o ? 'Modifier' : 'Ajouter') + ' un supplement</h2>' +
      '<label class="field">Nom</label><input type="text" id="op-nom" value="' + esc(est.nom) + '" />' +
      '<p class="hint">Prix par taille. Laissez vide si l\'option n\'est pas disponible pour cette taille.</p>' +
      '<div style="display:flex;gap:8px">' +
        '<div style="flex:1"><label class="field">Gros (&euro;)</label><input type="number" step="0.5" id="op-gros" value="' + (est.prix_gros != null ? est.prix_gros : '') + '" /></div>' +
        '<div style="flex:1"><label class="field">Moyen (&euro;)</label><input type="number" step="0.5" id="op-moyen" value="' + (est.prix_moyen != null ? est.prix_moyen : '') + '" /></div>' +
        '<div style="flex:1"><label class="field">Petit (&euro;)</label><input type="number" step="0.5" id="op-petit" value="' + (est.prix_petit != null ? est.prix_petit : '') + '" /></div>' +
      '</div>' +
      '<label class="field">Duree ajoutee (min)</label><input type="number" id="op-duree" value="' + (est.duree_min != null ? est.duree_min : 0) + '" />' +
      '<label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-top:8px"><input type="checkbox" id="op-actif" ' + (est.actif ? 'checked' : '') + ' style="width:20px;height:20px"/> Active</label>' +
      '<button class="btn btn-block mt" id="op-save">Enregistrer</button>' +
      (o ? '<button class="btn btn-danger btn-block mt" id="op-del">Supprimer</button>' : '');
    const modal = ouvrirModal(body);
    function num(id) { const v = $(id, body).value; return v === '' ? null : Number(v); }
    $('#op-save', body).addEventListener('click', async function () {
      const patch = { nom: $('#op-nom', body).value.trim(), prix_gros: num('#op-gros'), prix_moyen: num('#op-moyen'), prix_petit: num('#op-petit'), duree_min: Number($('#op-duree', body).value) || 0, actif: $('#op-actif', body).checked };
      if (!patch.nom) { toast('Le nom est requis.'); return; }
      let error;
      if (o) { ({ error } = await sb.from('options').update(patch).eq('id', o.id)); }
      else { ({ error } = await sb.from('options').insert(patch)); }
      if (error) { console.error(error); toast('Erreur.'); return; }
      toast('Supplement enregistre.'); fermerModal(modal); if (onDone) onDone();
    });
    if (o) {
      $('#op-del', body).addEventListener('click', async function () {
        if (!confirm('Supprimer ce supplement ?')) return;
        const { error } = await sb.from('options').delete().eq('id', o.id);
        if (error) { console.error(error); toast('Erreur.'); return; }
        toast('Supplement supprime.'); fermerModal(modal); if (onDone) onDone();
      });
    }
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
      '<button class="btn btn-ghost btn-block mt" id="wk-reset">Reinitialiser cette semaine (horaires par defaut)</button>' +
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

    $('#wk-reset', body).addEventListener('click', async function () {
      const dates = weekDates(weekOffset);
      for (let i = 0; i < 7; i++) {
        const d = dates[i];
        if (excMap[d]) { await sb.from('exceptions_dispo').delete().eq('date', d); delete excMap[d]; }
      }
      toast('Semaine reinitialisee sur les horaires par defaut.');
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

  // ================= NOUVELLE RESERVATION (manuelle) =================
  async function modalNouvelleResa() {
    const [prestas, regs, opts] = await Promise.all([C.getPrestations(false), C.getReglages(), C.getOptions(false)]);
    reglages = regs;
    const body = document.createElement('div');
    body.innerHTML =
      '<h2>Nouvelle reservation</h2>' +
      '<label class="field">Prenom</label><input type="text" id="nr-prenom" />' +
      '<label class="field">Instagram</label><input type="text" id="nr-insta" placeholder="pseudo" />' +
      '<label class="field">Telephone</label><input type="tel" id="nr-tel" value="+33" />' +
      '<label class="field">Prestation</label><select id="nr-presta"></select>' +
      '<div id="nr-autre" class="hidden"><label class="field">Nom / description</label><input type="text" id="nr-autre-nom" /></div>' +
      '<div style="display:flex;gap:10px">' +
        '<div style="flex:1"><label class="field">Taille</label><select id="nr-taille"><option value="gros">Gros</option><option value="moyen">Moyen</option><option value="petit">Petit</option></select></div>' +
        '<div style="flex:1"><label class="field">Longueur</label><select id="nr-longueur"><option value="court">Court</option><option value="moyen">Moyen</option><option value="long">Long</option></select></div>' +
      '</div>' +
      '<label class="field">Supplements</label><div id="nr-options"></div>' +
      '<div style="display:flex;gap:10px">' +
        '<div style="flex:1"><label class="field">Date</label><input type="date" id="nr-date" min="' + C.todayISO() + '" /></div>' +
        '<div style="flex:1"><label class="field">Heure</label><input type="time" id="nr-heure" /></div>' +
      '</div>' +
      '<div id="nr-manuel" class="hidden" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label class="field">Prix (&euro;)</label><input type="number" step="0.5" id="nr-prix" /></div>' +
        '<div style="flex:1"><label class="field">Duree (min)</label><input type="number" id="nr-duree" /></div>' +
      '</div>' +
      '<label class="field">Statut</label><select id="nr-statut"><option value="en_attente">En attente</option><option value="confirme">Confirme</option></select>' +
      '<div class="estimate mt"><div class="lbl">Estimation</div><div class="montant" id="nr-total">-</div></div>' +
      '<button class="btn btn-block mt" id="nr-save">Creer la reservation</button>';
    const modal = ouvrirModal(body);

    function estAutre() { return $('#nr-presta', body).value === '__autre__'; }
    function remplirPresta() {
      const sel = $('#nr-presta', body); sel.innerHTML = '';
      prestas.filter(function (p) { return p.actif; }).forEach(function (p) {
        const o = document.createElement('option'); o.value = p.id; o.textContent = p.nom + ' (' + euro(p.prix_base) + ')'; sel.appendChild(o);
      });
      const a = document.createElement('option'); a.value = '__autre__'; a.textContent = 'Autre'; sel.appendChild(a);
    }
    function optionPrix(o, taille) { const v = o['prix_' + taille]; return v == null ? null : Number(v); }
    function renderOpts() {
      const wrap = $('#nr-options', body); wrap.innerHTML = '';
      const taille = $('#nr-taille', body).value;
      const dispo = opts.filter(function (o) { return o.actif && optionPrix(o, taille) != null; });
      if (!dispo.length) { wrap.innerHTML = '<p class="hint">Aucune option pour cette taille.</p>'; return; }
      dispo.forEach(function (o) {
        const prix = optionPrix(o, taille);
        const row = document.createElement('label'); row.className = 'option-row';
        row._def = { id: o.id, nom: o.nom, prix: prix, min: Number(o.duree_min || 0) };
        row.innerHTML = '<input type="checkbox"/><span class="op-nom">' + esc(o.nom) + '</span><span class="op-prix">+' + prix + '€</span>';
        row.querySelector('input').addEventListener('change', recalc);
        wrap.appendChild(row);
      });
    }
    function selectedOptions() {
      const arr = [];
      $$('#nr-options .option-row', body).forEach(function (row) {
        const cb = row.querySelector('input'); if (cb.checked) arr.push(row._def);
      });
      return arr;
    }
    function recalc() {
      $('#nr-autre', body).classList.toggle('hidden', !estAutre());
      $('#nr-manuel', body).classList.toggle('hidden', !estAutre());
      if (estAutre()) { $('#nr-total', body).textContent = euro(Number($('#nr-prix', body).value) || 0); return; }
      const p = prestas.find(function (x) { return x.id === $('#nr-presta', body).value; });
      if (!p) { $('#nr-total', body).textContent = '-'; return; }
      const est = C.computeEstimate(p, $('#nr-taille', body).value, $('#nr-longueur', body).value, selectedOptions(), regs);
      $('#nr-total', body).textContent = euro(est.prix) + ' / ' + C.minToLabel(est.duree);
    }
    remplirPresta(); renderOpts(); recalc();
    $('#nr-presta', body).addEventListener('change', recalc);
    $('#nr-taille', body).addEventListener('change', function () { renderOpts(); recalc(); });
    $('#nr-longueur', body).addEventListener('change', recalc);
    $('#nr-prix', body).addEventListener('input', recalc);

    $('#nr-save', body).addEventListener('click', async function () {
      const prenom = $('#nr-prenom', body).value.trim();
      const insta = $('#nr-insta', body).value.trim().replace(/^@/, '');
      const tel = $('#nr-tel', body).value.trim();
      const date = $('#nr-date', body).value; const heure = $('#nr-heure', body).value;
      if (!prenom || !date || !heure) { toast('Prenom, date et heure requis.'); return; }
      const taille = $('#nr-taille', body).value; const longueur = $('#nr-longueur', body).value;
      const autre = estAutre();
      let prix = null, duree = null, bloc = null, nom = 'Autre', prestationId = null, options = [];
      if (autre) {
        nom = $('#nr-autre-nom', body).value.trim() || 'Autre';
        prix = $('#nr-prix', body).value === '' ? null : Number($('#nr-prix', body).value);
        duree = Number($('#nr-duree', body).value) || null;
        const bat = regs.battement ? Number(regs.battement.supplement_min || 0) : 30;
        bloc = duree != null ? duree + bat : null;
      } else {
        const p = prestas.find(function (x) { return x.id === $('#nr-presta', body).value; });
        if (!p) { toast('Choisissez une prestation.'); return; }
        options = selectedOptions();
        const est = C.computeEstimate(p, taille, longueur, options, regs);
        prix = est.prix; duree = est.duree; bloc = est.bloc; nom = p.nom; prestationId = p.id;
      }
      const heureFin = bloc != null ? C.minToTime(C.timeToMin(heure) + bloc) : null;
      const row = {
        statut: $('#nr-statut', body).value, prenom: prenom, instagram: insta, telephone: tel,
        prestation_id: prestationId, nom_presta: nom, est_autre: autre,
        taille: taille, longueur: longueur, commentaire: '', options: options,
        prix_estime: autre ? null : prix, prix_facture: autre ? prix : null, prix_final: autre ? prix : null,
        duree_estimee_min: duree, duree_bloc_min: bloc, date_rdv: date, heure_debut: heure, heure_fin: heureFin
      };
      const { error } = await sb.from('reservations').insert(row);
      if (error) { console.error(error); toast('Erreur.'); return; }
      toast('Reservation creee.'); fermerModal(modal); chargerCRM();
    });
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
