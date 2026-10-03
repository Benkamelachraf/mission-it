// =====================================================
// supabase-config.js — Initialisation Supabase
// =====================================================

window.supabaseReady = false;

(function () {
  const SUPABASE_URL = "https://lptpdgjkwjiwackzwwyy.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwdHBkZ2prd2ppd2Fja3p3d3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDA4ODgsImV4cCI6MjA5NTkxNjg4OH0.lqz7xj6Ke-yNXyCr7FC7owK7DvTH67Nup3AF0ebuddg";

  try {
    // Le CDN @supabase/supabase-js expose window.supabase
    window._supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        realtime: { params: { eventsPerSecond: 10 } },
      }
    );
    window.supabaseReady = true;
    console.log("✅ Supabase connecté");
  } catch (e) {
    console.warn("⚠️ Supabase non disponible, mode local activé :", e.message);
    window.supabaseReady = false;
  }
})();
