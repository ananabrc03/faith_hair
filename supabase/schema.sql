-- Faith Hair - Schema de reference (deja applique sur le projet Supabase)
-- Genere pour documentation / reproductibilite.

create extension if not exists pgcrypto;

create table prestations (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  descriptif text not null default '',
  prix_base numeric(10,2) not null default 0,
  duree_base_min int not null default 60,
  dispo_avec_meches boolean not null default false,
  dispo_sans_meches boolean not null default false,
  actif boolean not null default true,
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reglages (
  cle text primary key,
  libelle text not null,
  supplement_prix numeric(10,2),
  supplement_min int not null default 0
);

create table horaires_par_defaut (
  jour_semaine int primary key check (jour_semaine between 0 and 6),
  ouvert boolean not null default true,
  heure_debut time not null default '10:00',
  heure_fin time not null default '18:00'
);

create table exceptions_dispo (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  ouvert boolean not null default true,
  heure_debut time,
  heure_fin time,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  statut text not null default 'en_attente' check (statut in ('en_attente','confirme','archive')),
  archive_motif text check (archive_motif in ('realisee','annulee')),
  supprime_le timestamptz,
  prenom text not null,
  instagram text not null,
  telephone text not null,
  prestation_id uuid references prestations(id) on delete set null,
  nom_presta text,
  est_autre boolean not null default false,
  avec_meches boolean not null default false,
  taille text check (taille in ('gros','moyen','petit')),
  longueur text check (longueur in ('court','moyen','long')),
  commentaire text not null default '',
  prix_estime numeric(10,2),
  prix_facture numeric(10,2),
  remise_type text check (remise_type in ('pourcentage','montant')),
  remise_valeur numeric(10,2),
  prix_final numeric(10,2),
  duree_estimee_min int,
  duree_bloc_min int,
  date_rdv date,
  heure_debut time,
  heure_fin time
);
create index idx_reservations_statut on reservations(statut);
create index idx_reservations_date on reservations(date_rdv);
create index idx_reservations_corbeille on reservations(supprime_le);

-- RLS : MVP permissif via la cle anon. A durcir avec Supabase Auth.
alter table prestations enable row level security;
alter table reglages enable row level security;
alter table horaires_par_defaut enable row level security;
alter table exceptions_dispo enable row level security;
alter table reservations enable row level security;
create policy "mvp_all_prestations" on prestations for all to anon, authenticated using (true) with check (true);
create policy "mvp_all_reglages" on reglages for all to anon, authenticated using (true) with check (true);
create policy "mvp_all_horaires" on horaires_par_defaut for all to anon, authenticated using (true) with check (true);
create policy "mvp_all_exceptions" on exceptions_dispo for all to anon, authenticated using (true) with check (true);
create policy "mvp_all_reservations" on reservations for all to anon, authenticated using (true) with check (true);

-- Taches planifiees (pg_cron)
-- archive_past_rdv : 02:00 chaque nuit, archive les rdv confirmes passes
-- purge_corbeille  : 02:30 chaque nuit, supprime la corbeille de plus de 7 jours
