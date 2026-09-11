# Faith Hair - Application de reservation

Application web (HTML / CSS / JS vanilla) branchee sur Supabase.
Deux espaces : un questionnaire cliente et un espace d'administration.

## Structure

```
app/
  index.html            Espace cliente (questionnaire)
  admin/
    index.html          Espace admin (accessible sur /admin)
  assets/
    css/style.css       Styles partages
    js/config.js        Configuration (URL Supabase, cle publique, mot de passe admin)
    js/core.js          Noyau partage (donnees, calculs prix/duree, creneaux)
    js/client.js        Logique du questionnaire cliente
    js/admin.js         Logique de l'espace admin
    images/             Logo et images (parting, longueur)
  supabase/schema.sql   Schema SQL de reference (deja applique sur le projet)
```

## Deploiement

### Option Vercel (recommandee)
1. Poussez ce dossier `app` sur un depot GitHub.
2. Sur Vercel : New Project, importez le depot.
3. Framework preset : Other. Root directory : `app` (si `app` est a la racine du depot).
4. Aucun build. Deployez.
5. La cliente arrive sur l'URL racine, l'admin sur `.../admin`.

### Option GitHub Pages
1. Poussez `app` sur GitHub.
2. Settings > Pages > deployez depuis la branche (dossier racine ou `/app`).
3. Cliente : URL racine. Admin : `.../admin/`.

## Configuration

Tout est dans `assets/js/config.js` :
- `SUPABASE_URL` et `SUPABASE_ANON_KEY` : deja renseignes (cle publique, prevue pour etre exposee).
- `INSTAGRAM` : compte vers lequel la cliente est redirigee.
- `ADMIN_PASSWORD` : mot de passe de l'espace admin (`faith2026`).
- `SLOT_STEP_MIN` : granularite des creneaux proposes (30 min).

## Securite (a lire)

Pour le MVP, l'espace admin est protege par un simple mot de passe cote client et
la base autorise la lecture/ecriture via la cle publique. C'est suffisant pour
demarrer avec peu de risque, mais ce n'est pas robuste : toute personne qui lit
le code peut atteindre les donnees.

Durcissement prevu (etape suivante) :
1. Activer Supabase Auth et creer un compte pour la coiffeuse.
2. Restreindre les politiques RLS : lecture publique limitee au catalogue et aux
   horaires, insertion publique sur `reservations`, et lecture/modification des
   `reservations` reservees a l'utilisateur authentifie.
3. Remplacer le mot de passe en dur par la connexion Supabase Auth.

## Base de donnees

Projet Supabase deja cree et configure (tables, donnees de depart, RLS, taches
`pg_cron` pour l'archivage automatique et la purge de la corbeille apres 7 jours).
Le fichier `supabase/schema.sql` documente la structure.

## Logique metier (rappel)

- Prix = prix de base du modele + supplement taille + supplement longueur.
- Duree bloquee = duree de base + supplements + battement (30 min).
- Seuls les rendez-vous confirmes bloquent le planning.
- Le choix avec/sans meches filtre les modeles proposes.
- "Autre" : pas d'estimation, tarif et duree renseignes par la coiffeuse.
