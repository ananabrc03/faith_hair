// Configuration Faith Hair
// -------------------------------------------------------------
// Cle publique Supabase (anon) : concue pour etre exposee cote client.
// La securite reelle repose sur les regles RLS de la base.
// ADMIN_PASSWORD : protection simple du MVP. A remplacer par Supabase Auth
// lors du durcissement (voir README).
window.FAITH_CONFIG = {
  SUPABASE_URL: 'https://yxavdctsnwjagwptlbqr.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4YXZkY3RzbndqYWd3cHRsYnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNzQ0NjYsImV4cCI6MjEwNDY1MDQ2Nn0.rHZWHPEgfiv3Pax62gb6LjF0plcgnfT1qOLrRaVJX_w',
  INSTAGRAM: 'faithair__',
  ADMIN_PASSWORD: 'faith2026',
  // Granularite des creneaux proposes, en minutes
  SLOT_STEP_MIN: 30
};
