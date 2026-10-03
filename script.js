/* ═══════════════════════════════════════════════════
   MissionIT v3.2 — Admin + Fonctionnaire
═══════════════════════════════════════════════════ */

// ── HELPERS ─────────────────────────────────────────
const $   = id => document.getElementById(id);
const esc = s  => !s ? "" : String(s).replace(/[&<>"']/g, m => ({'&':"&amp;",'<':"&lt;",'>':"&gt;",'"':"&quot;","'":'&#39;'})[m]);
const uid = () => Date.now() + Math.random().toString(36).slice(2,6);
const genCode = () => { const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join(""); };
const today   = () => new Date().toLocaleDateString("fr-FR");
const timeNow = () => new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});

async function hashPassword(pwd) {
  if (!window.crypto?.subtle) return `legacy:${btoa(pwd)}`;
  const bytes = new TextEncoder().encode(pwd);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return "sha256:" + Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function verifyPassword(pwd, stored) {
  if (!stored) return false;
  if (stored.startsWith("sha256:")) return stored === await hashPassword(pwd);
  if (stored.startsWith("legacy:")) return stored === `legacy:${btoa(pwd)}`;
  return stored === btoa(pwd);
}

function isLegacyPasswordHash(stored) {
  return stored && !stored.startsWith("sha256:");
}

// ── STOCKAGE ────────────────────────────────────────
const DB = {
  load: k => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch(e) { return null; } },
  save: (k,v) => localStorage.setItem(k, JSON.stringify(v))
};

let admins         = DB.load("mit_admins")      || [];
let fonctionnaires = DB.load("mit_foncts")      || [];
let missions       = DB.load("mit_missions")    || [];
let messages       = DB.load("mit_messages")    || [];
let privateChats   = DB.load("mit_priv")        || {};
let notifications  = DB.load("mit_notifs")      || [];

const saveAdmins = () => {
  DB.save("mit_admins", admins);
  if (typeof SupaDB !== "undefined" && window.supabaseReady) {
    if (currentAdmin) SupaDB.saveAdmin(currentAdmin).catch(console.error);
  }
};
const saveFoncts = () => {
  DB.save("mit_foncts", fonctionnaires);
  if (typeof SupaDB !== "undefined" && window.supabaseReady) {
    // Sequential saves so each row is committed before the next
    (async () => {
      for (const f of fonctionnaires) {
        await SupaDB.saveFonctionnaire(f);
      }
    })();
  }
};
const saveMiss = () => {
  DB.save("mit_missions", missions);
  if (typeof SupaDB !== "undefined" && window.supabaseReady) {
    (async () => {
      for (const m of missions) {
        await SupaDB.saveMission(m);
      }
    })();
  }
};
const saveMsgs = () => {
  DB.save("mit_messages", messages);
  if (typeof SupaDB !== "undefined" && window.supabaseReady) {
    (async () => {
      await SupaDB.saveMessages(messages);
    })();
  }
};
 
const savePriv = () => {
  DB.save("mit_priv", privateChats);
  if (typeof SupaDB !== "undefined" && window.supabaseReady) {
    SupaDB.savePrivateChats(privateChats).catch(console.error);
  }
};
const saveNotifs = () => {
  DB.save("mit_notifs", notifications);
  if (typeof SupaDB !== "undefined" && window.supabaseReady) {
    SupaDB.saveNotifications(notifications).catch(console.error);
  }
};

function applyRemoteData(remote) {
  if (!remote) return;
  admins = remote.admins || admins;
  fonctionnaires = remote.fonctionnaires || fonctionnaires;
  missions = remote.missions || missions;
  messages = remote.messages || messages;
  privateChats = remote.privateChats || privateChats;
  notifications = remote.notifications || notifications;
  DB.save("mit_admins", admins);
  DB.save("mit_foncts", fonctionnaires);
  DB.save("mit_missions", missions);
  DB.save("mit_messages", messages);
  DB.save("mit_priv", privateChats);
  DB.save("mit_notifs", notifications);
}

// ── SESSION ──────────────────────────────────────────
let currentRole   = null;   // "admin" | "fonctionnaire"
let currentAdmin  = null;
let currentFonct  = null;
let editMissionId = null;
let editFonctId   = null;
let currentFilter = "all";
let loginFTarget  = null;   // fonctionnaire en cours d'activation

const isAdmin = () => currentRole === "admin";
const isFonct = () => currentRole === "fonctionnaire";
const myId    = () => isFonct() ? String(currentFonct.id) : `admin_${currentAdmin.id}`;
const myName  = () => isFonct() ? currentFonct.nom : currentAdmin.nom;

// ── HELPERS ERREURS ──────────────────────────────────
function showErr(id, msg) { const e=$(id); if(e){ e.textContent="❌ "+msg; e.classList.remove("hidden"); } }
function hideErr(id)      { $(id)?.classList.add("hidden"); }
function shake(el)        { el?.classList.add("shake"); setTimeout(()=>el?.classList.remove("shake"),500); }

// ══════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════
function toast(msg, type="info") {
  const zone = $("toastZone") || (() => { const z=document.createElement("div"); z.id="toastZone"; z.className="toast-zone"; document.body.appendChild(z); return z; })();
  const icons = {success:"✅",error:"❌",info:"ℹ️",warn:"⚠️"};
  const t = document.createElement("div");
  t.className = `toast-msg toast-${type}`;
  t.innerHTML = `<span class="toast-ico">${icons[type]||"ℹ️"}</span><span>${esc(msg)}</span><button onclick="this.parentElement.remove()">×</button>`;
  zone.appendChild(t);
  requestAnimationFrame(() => t.classList.add("toast-visible"));
  setTimeout(() => { t.classList.remove("toast-visible"); setTimeout(() => t.remove(), 300); }, 3500);
}

// ══════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════
function addNotif(msg, type="info") {
  notifications.unshift({ id:uid(), msg, type, read:false, time:today() });
  if (notifications.length > 60) notifications.pop();
  saveNotifs(); renderNotifBadge();
}
function renderNotifBadge() {
  const n = notifications.filter(x=>!x.read).length;
  const b = $("notifBadge");
  if (b) { b.textContent = n>9?"9+":n; b.classList.toggle("hidden", n===0); }
}
function renderNotifPanel() {
  const list = $("notifList"); if (!list) return;
  const icons = {success:"✅",error:"❌",info:"ℹ️",warn:"⚠️"};
  if (!notifications.length) { list.innerHTML='<div class="notif-empty-msg">Aucune notification</div>'; return; }
  list.innerHTML = "";
  notifications.forEach(n => {
    const el = document.createElement("div");
    el.className = `notif-item${n.read?" notif-read":""}`;
    el.innerHTML = `<span>${icons[n.type]||"ℹ️"}</span><div><p>${esc(n.msg)}</p><small>${n.time}</small></div>`;
    el.addEventListener("click", () => { n.read=true; saveNotifs(); renderNotifBadge(); el.classList.add("notif-read"); });
    list.appendChild(el);
  });
}
$("btnNotif")?.addEventListener("click", e => {
  e.stopPropagation(); $("notifPanel")?.classList.toggle("hidden");
  if (!$("notifPanel")?.classList.contains("hidden")) {
    renderNotifPanel(); notifications.forEach(n=>n.read=true); saveNotifs(); renderNotifBadge();
  }
});
$("btnClearNotifs")?.addEventListener("click", () => { notifications=[]; saveNotifs(); renderNotifBadge(); renderNotifPanel(); });
document.addEventListener("click", e => { if (!$("notifPanel")?.contains(e.target) && e.target!==$("btnNotif")) $("notifPanel")?.classList.add("hidden"); });

// ══════════════════════════════════════════════════
// WELCOME SCREEN & GUIDE
// ══════════════════════════════════════════════════
$("btnStartApp")?.addEventListener("click", () => {
  const ws = $("welcomeScreen"), ls = $("loginScreen");
  ws.style.opacity = "0"; ws.style.transition = "opacity .4s ease";
  setTimeout(() => {
    ws.classList.add("hidden");
    ls.classList.remove("hidden");
    ls.style.opacity = "0"; ls.style.transition = "opacity .4s ease";
    setTimeout(() => { ls.style.opacity = "1"; }, 20);
  }, 400);
});

$("btnBackToGuide")?.addEventListener("click", () => {
  $("loginScreen").classList.add("hidden");
  const ws = $("welcomeScreen");
  ws.classList.remove("hidden"); ws.style.opacity = "1";
});

// Onglets guide dans l'app
document.querySelectorAll(".gtab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".gtab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".guide-panel").forEach(p => p.classList.add("hidden"));
    t.classList.add("active");
    $(t.dataset.gtab)?.classList.remove("hidden");
  });
});

// ══════════════════════════════════════════════════
// LOGIN — SÉLECTEUR RÔLE
// ══════════════════════════════════════════════════
document.querySelectorAll(".rpill").forEach(p => p.addEventListener("click", () => {
  document.querySelectorAll(".rpill").forEach(x=>x.classList.remove("active"));
  p.classList.add("active");
  $("pAdmin").classList.toggle("hidden", p.dataset.role !== "admin");
  $("pFonct").classList.toggle("hidden", p.dataset.role !== "fonctionnaire");
  resetLoginForms();
}));

function resetLoginForms() {
  loginFTarget = null;
  // Admin
  ["aEmail","aPwd","aNom","aNewPwdConfirm"].forEach(id => { if($(id)) $(id).value=""; });
  ["aErrMain","aErrCreate"].forEach(id => hideErr(id));
  $("aFormMain")?.classList.remove("hidden");
  $("aFormCreate")?.classList.add("hidden");
  // Fonctionnaire
  ["fEmail","fLoginPwd","fCode","fNewPwd"].forEach(id => { if($(id)) $(id).value=""; });
  ["fErrMain","fErrCode","fErrPwd"].forEach(id => hideErr(id));
  $("fFormMain")?.classList.remove("hidden");
  $("fFormCode")?.classList.add("hidden");
  $("fFormPwd")?.classList.add("hidden");
}

// ══════════════════════════════════════════════════
// LOGIN — ADMIN
// Logique : email + mot de passe ensemble.
// - Si email existe et mot de passe correct → connexion
// - Si email existe et mot de passe incorrect → erreur
// - Si email inconnu et mot de passe renseigné → passer à la création (demander le nom)
// ══════════════════════════════════════════════════
$("btnALogin")?.addEventListener("click", doAdminLogin);
$("aPwd")?.addEventListener("keypress", e => e.key==="Enter" && doAdminLogin());
$("aEmail")?.addEventListener("keypress", e => e.key==="Enter" && $("aPwd")?.focus());

async function doAdminLogin() {
  const email = $("aEmail").value.trim().toLowerCase();
  const pwd   = $("aPwd").value;
  hideErr("aErrMain");

  if (!email || !email.includes("@")) { showErr("aErrMain", "Saisissez un email valide."); return; }
  if (!pwd)                            { showErr("aErrMain", "Saisissez votre mot de passe."); return; }

  let adm = admins.find(a => a.email.toLowerCase() === email);

  if (!adm && typeof SupaDB !== "undefined" && window.supabaseReady) {
    try {
      adm = await SupaDB.findAdminByEmail(email);
      if (adm) {
        admins = [adm, ...admins.filter(a => a.id !== adm.id)];
        DB.save("mit_admins", admins);
      }
    } catch (err) {
      console.error(err);
      toast("Recherche Supabase impossible, données locales utilisées.", "warn");
    }
  }

  if (adm) {
    if (!await verifyPassword(pwd, adm.passwordHash)) {
      showErr("aErrMain", "Mot de passe incorrect."); shake($("aPwd")); return;
    }
    if (isLegacyPasswordHash(adm.passwordHash)) {
      adm.passwordHash = await hashPassword(pwd);
      saveAdmins();
    }

    // ✅ NOUVEAU : enregistrer dans Supabase Auth si pas encore fait
    if (window.supabaseReady && window._supabaseClient && !adm.supabaseAuthSynced) {
      try {
        const { error } = await window._supabaseClient.auth.signUp({
          email,
          password: pwd,
          options: { data: { nom: adm.nom, role: "admin", mit_id: String(adm.id) } }
        });
        if (!error || error.message.includes("already registered")) {
          const idx = admins.findIndex(a => a.id === adm.id);
          if (idx !== -1) {
            admins[idx].supabaseAuthSynced = true;
            adm = admins[idx];
            saveAdmins();
          }
        }
      } catch (e) {
        console.warn("Auth sync non bloquant:", e.message);
      }
    }

    currentRole = "admin"; currentAdmin = adm; currentFonct = null;
    launchApp();
  } else {
    $("aEmailCreate").value        = email;
    $("aEmailCreate").dataset.pwd  = pwd;
    $("aFormMain").classList.add("hidden");
    $("aFormCreate").classList.remove("hidden");
    $("aNom").focus();
  }
}

$("btnABackCreate")?.addEventListener("click", () => {
  $("aFormCreate").classList.add("hidden");
  $("aFormMain").classList.remove("hidden");
  hideErr("aErrCreate");
});

$("btnACreate")?.addEventListener("click", doAdminCreate);
$("aNewPwdConfirm")?.addEventListener("keypress", e => e.key==="Enter" && doAdminCreate());

async function doAdminCreate() {
  const email = $("aEmailCreate").value;
  const pwd   = $("aEmailCreate").dataset.pwd;
  const nom   = $("aNom").value.trim();
  const conf  = $("aNewPwdConfirm").value;
  hideErr("aErrCreate");
 
  if (!nom)         { showErr("aErrCreate", "Saisissez votre nom."); return; }
  if (pwd.length < 6) { showErr("aErrCreate", "Le mot de passe doit faire au moins 6 caractères."); return; }
  if (pwd !== conf) { showErr("aErrCreate", "Les mots de passe ne correspondent pas."); return; }
 
  const newAdmin = {
    id: uid(), nom, email,
    passwordHash: await hashPassword(pwd),
    createdAt: today()
  };
  admins.push(newAdmin);
  DB.save("mit_admins", admins);
 
  // ✅ CRITICAL: await Supabase save BEFORE launching app
  // so admin row exists when missions/fonctionnaires are inserted
  if (typeof SupaDB !== "undefined" && window.supabaseReady) {
    await SupaDB.saveAdmin(newAdmin);
  }
 
  currentRole = "admin"; currentAdmin = newAdmin; currentFonct = null;
  launchApp();
}
// ══════════════════════════════════════════════════
// LOGIN — FONCTIONNAIRE
// Logique : email + mot de passe ensemble.
// - Si compte activé et mot de passe correct → connexion
// - Si compte activé et mot de passe incorrect → erreur
// - Si compte non activé (première connexion) → afficher formulaire code
// ══════════════════════════════════════════════════
$("btnFLogin")?.addEventListener("click", doFonctLogin);
$("fLoginPwd")?.addEventListener("keypress", e => e.key==="Enter" && doFonctLogin());
$("fEmail")?.addEventListener("keypress", e => e.key==="Enter" && $("fLoginPwd")?.focus());

async function doFonctLogin() {
  const email = $("fEmail").value.trim().toLowerCase();
  const pwd   = $("fLoginPwd").value;
  hideErr("fErrMain");
 
  if (!email || !email.includes("@")) { showErr("fErrMain", "Saisissez un email valide."); return; }
 
  let f = fonctionnaires.find(x => x.email.toLowerCase() === email);
 
  if (!f && typeof SupaDB !== "undefined" && window.supabaseReady) {
    try {
      f = await SupaDB.findFonctionnaireByEmail(email);
      if (f) {
        fonctionnaires = [f, ...fonctionnaires.filter(x => x.id !== f.id)];
        DB.save("mit_foncts", fonctionnaires);
      }
    } catch (err) {
      console.error(err);
      toast("Recherche Supabase impossible, données locales utilisées.", "warn");
    }
  }
 
  if (!f)            { showErr("fErrMain", "Aucun compte pour cet email. Contactez votre administrateur."); return; }
  if (f.suspended)   { showErr("fErrMain", "Compte suspendu. Contactez votre administrateur."); return; }
 
  loginFTarget = f;
 
  if (!f.passwordHash) {
    $("fCodeEmail").textContent = f.email;
    $("fFormMain").classList.add("hidden");
    $("fFormCode").classList.remove("hidden");
    $("fCode").focus();
    return;
  }
 
  if (!pwd) { showErr("fErrMain", "Saisissez votre mot de passe."); return; }
  if (!await verifyPassword(pwd, f.passwordHash)) {
    showErr("fErrMain", "Mot de passe incorrect."); shake($("fLoginPwd")); return;
  }
  if (isLegacyPasswordHash(f.passwordHash)) {
    f.passwordHash = await hashPassword(pwd);
    saveFoncts();
  }
 
  currentRole = "fonctionnaire"; currentFonct = f; currentAdmin = null;
  launchApp();
}

// Retour depuis formulaire code
$("btnFBackCode")?.addEventListener("click", () => {
  $("fFormCode").classList.add("hidden");
  $("fFormMain").classList.remove("hidden");
  hideErr("fErrCode");
  loginFTarget = null;
});

// Vérification du code d'invitation
$("btnFVerify")?.addEventListener("click", doFonctCode);
$("fCode")?.addEventListener("keypress", e => e.key==="Enter" && doFonctCode());

function doFonctCode() {
  const code = $("fCode").value.trim().toUpperCase();
  hideErr("fErrCode");
  if (!code) { showErr("fErrCode","Saisissez le code."); return; }
  if (code !== loginFTarget?.inviteCode) { showErr("fErrCode","Code incorrect. Vérifiez avec votre administrateur."); shake($("fCode")); return; }
  $("fFormCode").classList.add("hidden");
  $("fFormPwd").classList.remove("hidden");
  $("fWelcomeName").textContent = loginFTarget.nom;
  $("fNewPwd").focus();
}

// Création du mot de passe (première connexion)
$("btnFSetPwd")?.addEventListener("click", doFonctSetPwd);
$("fNewPwd")?.addEventListener("keypress", e => e.key==="Enter" && doFonctSetPwd());

async function doFonctSetPwd() {
  const pwd = $("fNewPwd").value;
  hideErr("fErrPwd");
  if (pwd.length < 6) { showErr("fErrPwd","Minimum 6 caractères."); return; }
  const idx = fonctionnaires.findIndex(f => f.id === loginFTarget.id);
  if (idx !== -1) {
    fonctionnaires[idx].passwordHash = await hashPassword(pwd);
    fonctionnaires[idx].inviteCode   = null;
    fonctionnaires[idx].activated    = true;
    saveFoncts();
    loginFTarget = fonctionnaires[idx];
  }
  currentRole = "fonctionnaire"; currentFonct = loginFTarget; currentAdmin = null;
  launchApp();
}

// ══════════════════════════════════════════════════
// LANCEMENT APP
// ══════════════════════════════════════════════════
function launchApp() {
  $("loginScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  initUI();
 
  const role     = currentRole;
  const userId   = isFonct() ? String(currentFonct.id)  : String(currentAdmin.id);
  const adminId  = isFonct() ? String(currentFonct.adminId) : String(currentAdmin.id);
 
  if (typeof SupaDB !== "undefined" && window.supabaseReady) {
    SupaDB.loadAllForUser(role, userId, adminId)
      .then(remote => {
        applyRemoteData(remote);
        loadAll();
        SupaDB.initRealtime();           // ← appel correct
      })
      .catch(err => {
        console.error("loadAllForUser error:", err);
        toast("Connexion Supabase impossible, données locales utilisées.", "warn");
        loadAll();
      });
  } else {
    loadAll();
  }
}

window.reloadFromSupabase = function () {
  if (!currentRole || typeof SupaDB === "undefined" || !window.supabaseReady) return;
  const role    = currentRole;
  const userId  = isFonct() ? String(currentFonct.id)      : String(currentAdmin.id);
  const adminId = isFonct() ? String(currentFonct.adminId)  : String(currentAdmin.id);
 
  SupaDB.loadAllForUser(role, userId, adminId)
    .then(remote => {
      applyRemoteData(remote);
      loadAll();
      if (chatMode === "public")        renderPublicChat();
      else if (chatConvKey)             renderPrivateChat(chatConvKey);
      else if (chatMode === "private")  renderContacts();
    })
    .catch(console.error);
};

function initUI() {
  const name = myName();
  const ini  = name.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase();
  const roleColors  = { admin:"#7e3af2", fonctionnaire:"#1a56db" };
  const roleLabels  = { admin:"🛡️ Administrateur", fonctionnaire:"👨‍💼 Fonctionnaire" };
  const col = roleColors[currentRole] || "#1a56db";

  // Topbar
  $("tbRolePill").textContent = roleLabels[currentRole];
  $("tbRolePill").style.cssText = `background:${col}18;color:${col};border-color:${col}40`;
  $("tbAvatar").textContent = ini;
  $("tbAvatar").style.cssText = `background:${col}22;color:${col}`;
  $("tbUserName").textContent = name;
  $("tbDomain").textContent = isAdmin() ? "Administrateur" : (currentFonct?.dept || "");

  // Sidebar
  $("sbAvatar").textContent = ini;
  $("sbAvatar").style.cssText = `background:${col}22;color:${col};border-color:${col}40`;
  $("sbUserName").textContent = name;
  $("sbUserRole").textContent = roleLabels[currentRole];
  $("sbUserRole").style.color = col;

  // Visibilité rôles
  document.querySelectorAll(".adm-only").forEach(el => el.classList.toggle("hidden", !isAdmin()));
  document.querySelectorAll(".fonly").forEach(el    => el.classList.toggle("hidden", !isFonct()));
  $("sbAccessNote")?.classList.toggle("hidden", isAdmin());

  // Listeners filtres / tabs / assignation
  document.querySelectorAll(".tabbtn").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  document.querySelectorAll(".fchip").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".fchip").forEach(x=>x.classList.remove("active"));
    t.classList.add("active"); currentFilter = t.dataset.filter; renderMissions();
  }));
  document.querySelectorAll('input[name="amode"]').forEach(r => r.addEventListener("change", e => {
    $("specificFonctField")?.classList.toggle("hidden", e.target.value !== "specific");
  }));

  initNav(); initSearch(); initModals(); checkDeadlines();
  renderNotifBadge(); updatePrivUnread();
}

function loadAll() {
  renderMissions(); updateStats();
  if (isFonct()) renderMesMissions();
  if (isAdmin()) { renderFoncts(); renderMyAccount(); }
}

// ══════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════
const PAGE_MAP = {
  navMissions:"pageMissions", navMesMissions:"pageMesMissions", navProfile:"pageProfile",
  navFoncts:"pageFoncts", navStats:"pageStats", navChat:"pageChat",
  navMyAccount:"pageMyAccount", navGuide:"pageGuide"
};

function initNav() {
  Object.entries(PAGE_MAP).forEach(([navId,pageId]) => {
    $(navId)?.addEventListener("click", e => { e.preventDefault(); goTo(pageId); closeSidebar(); });
  });
  $("btnSbAddMission")?.addEventListener("click",     () => openModalMission());
  $("btnHeaderAddMission")?.addEventListener("click", () => openModalMission());
  $("btnMenuToggle")?.addEventListener("click",       () => { $("sidebar").classList.toggle("open"); $("sbOverlay").classList.toggle("show"); });
  $("sbOverlay")?.addEventListener("click", closeSidebar);
  $("btnLogout")?.addEventListener("click", doLogout);
  $("btnTbUser")?.addEventListener("click", () => { goTo(isFonct() ? "pageProfile" : "pageMyAccount"); closeSidebar(); });
}

const closeSidebar = () => { $("sidebar").classList.remove("open"); $("sbOverlay").classList.remove("show"); };

function goTo(pageId) {
  if (["pageFoncts","pageStats","pageMyAccount"].includes(pageId) && isFonct()) { toast("Réservé aux administrateurs","error"); return; }
  if (["pageMesMissions","pageProfile"].includes(pageId) && isAdmin())          { toast("Réservé aux fonctionnaires","error"); return; }
  showPage(pageId);
  if (pageId==="pageMissions")    renderMissions();
  if (pageId==="pageMesMissions") renderMesMissions();
  if (pageId==="pageProfile")     renderProfile();
  if (pageId==="pageFoncts")      renderFoncts();
  if (pageId==="pageStats")       { updateStats(); renderStatsDetails(); }
  if (pageId==="pageChat")        renderMessages();
  if (pageId==="pageMyAccount")   renderMyAccount();
}

function showPage(id) {
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $(id)?.classList.remove("hidden");
  document.querySelectorAll(".sb-item").forEach(i=>i.classList.remove("active"));
  const navId = Object.keys(PAGE_MAP).find(k=>PAGE_MAP[k]===id);
  $(navId)?.classList.add("active");
}

function doLogout() {
  currentRole=currentAdmin=currentFonct=editMissionId=editFonctId=loginFTarget=null;
  currentFilter="all";
  $("app").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  document.querySelectorAll(".rpill").forEach(p=>p.classList.remove("active"));
  document.querySelector('.rpill[data-role="fonctionnaire"]')?.classList.add("active");
  $("pAdmin").classList.add("hidden");
  $("pFonct").classList.remove("hidden");
  resetLoginForms();
}

// ══════════════════════════════════════════════════
// RENDER MISSIONS
// ══════════════════════════════════════════════════
function renderMissions() {
  const grid=$("missionGrid"), empty=$("emptyMissions"), noRes=$("noResultsMissions");
  if (!grid) return;
  grid.innerHTML = "";
  const q = ($("searchMissions")?.value||"").trim().toLowerCase();

  if ($("missionsTitle")) $("missionsTitle").textContent = isAdmin() ? "Toutes mes missions" : "Missions disponibles";
  if ($("missionsSub"))   $("missionsSub").textContent   = isAdmin() ? "Gérez vos missions" : "Consultez et prenez en charge les missions";

  let src = [];
  if (isAdmin()) {
    src = missions.filter(m => m.adminId === currentAdmin.id);
  } else {
    const adminId = currentFonct.adminId;
    src = missions.filter(m => {
      if (m.adminId !== adminId) return false;
      if (m.assignMode==="specific" && m.assignedToId && m.assignedToId !== currentFonct.id) return false;
      return true;
    });
  }

  document.querySelectorAll('.fchip[data-filter="pending_validation"]').forEach(el => el.classList.toggle("hidden", isFonct()));

  let filtered = src.filter(m => {
    if (currentFilter !== "all" && m.status !== currentFilter) return false;
    if (q && !m.title.toLowerCase().includes(q) && !m.description.toLowerCase().includes(q) && !(m.tags||[]).join(" ").toLowerCase().includes(q)) return false;
    return true;
  });

  $("bdgMissions").textContent = src.length;
  const pending = src.filter(m=>m.status==="pending_validation").length;
  const vb = $("bdgValidation");
  if (vb) { vb.textContent=pending; vb.classList.toggle("hidden", pending===0 || isFonct()); }

  if (!filtered.length) {
    if (q) { empty.classList.add("hidden"); noRes.classList.remove("hidden"); }
    else   { empty.classList.remove("hidden"); noRes.classList.add("hidden"); }
    return;
  }
  empty.classList.add("hidden"); noRes.classList.add("hidden");
  filtered.forEach((m,i) => grid.appendChild(buildCard(m, i, "all")));
}

// ══════════════════════════════════════════════════
// RENDER MES MISSIONS (fonctionnaire)
// ══════════════════════════════════════════════════
function renderMesMissions() {
  if (!isFonct()) return;
  const id = currentFonct.id;
  const adminId = currentFonct.adminId;
  const domMissions = missions.filter(m => m.adminId === adminId);

  const assigned = domMissions.filter(m =>
    ((m.assignMode==="specific"&&m.assignedToId===id)||(m.assignMode==="pool"&&m.reservedBy===id)||(m.assignMode==="open"&&m.assignedToId===id))
    && !["validated"].includes(m.status)
  );
  const pool = domMissions.filter(m => m.assignMode==="pool" && !m.reservedBy && m.status==="open");
  const done = domMissions.filter(m =>
    ((m.assignMode==="specific"&&m.assignedToId===id)||(m.assignMode==="pool"&&m.reservedBy===id)||(m.assignMode==="open"&&m.assignedToId===id))
    && ["validated","pending_validation"].includes(m.status)
  );

  $("cntAssigned").textContent = assigned.length;
  $("cntPool").textContent     = pool.length;
  $("cntDone").textContent     = done.length;
  const nb = assigned.filter(m=>["open","in-progress","rejected"].includes(m.status)).length + pool.length;
  if ($("bdgMes")) { $("bdgMes").textContent=nb; $("bdgMes").classList.toggle("hidden",nb===0); }

  const render = (listId, emptyId, data, ctx) => {
    const l=$(listId), e=$(emptyId); if(!l) return;
    l.innerHTML=""; data.forEach((m,i)=>l.appendChild(buildCard(m,i,ctx)));
    e?.classList.toggle("hidden", data.length>0);
  };
  render("listAssigned","emptyAssigned",assigned,"assigned");
  render("listPool",    "emptyPool",    pool,    "pool");
  render("listDone",    "emptyDone",    done,    "done");
}

// ══════════════════════════════════════════════════
// BUILD CARD MISSION
// ══════════════════════════════════════════════════
function buildCard(m, i, ctx) {
  const card = document.createElement("div");
  const urgClass = m.priority==="urgent"?" card-urgent":m.priority==="high"?" card-high":"";
  card.className = `mission-card status-${m.status||"open"}${urgClass}`;
  card.style.animationDelay = `${i*0.05}s`;

  const stLbl = {open:"Ouverte","in-progress":"En cours",pending_validation:"À valider",validated:"Validée",rejected:"Rejetée"};
  const mdLbl = {open:"📋 Ouverte",specific:"🎯 Ciblée",pool:"🌐 Pool"};
  const prLbl = {high:"🔴 Haute",urgent:"🚨 Urgente"};
  const prHtml = m.priority&&m.priority!=="normal"?`<span class="prio-tag prio-${m.priority}">${prLbl[m.priority]}</span>`:"";

  let assignee = "";
  if      (m.assignMode==="specific"&&m.assignedToName) assignee=`<span class="meta-chip">👤 ${esc(m.assignedToName)}</span>`;
  else if (m.assignMode==="pool"&&m.reservedByName)      assignee=`<span class="meta-chip">👤 ${esc(m.reservedByName)}</span>`;
  else if (m.assignMode==="pool"&&!m.reservedBy)         assignee=`<span class="meta-chip">👥 Disponible</span>`;
  else if (m.assignMode==="open")                        assignee=`<span class="meta-chip">🌍 Ouverte à tous</span>`;

  let dlHtml = "";
  if (m.deadline && m.status!=="validated") {
    const diff = Math.ceil((new Date(m.deadline)-new Date())/86400000);
    const cls = diff<0?"dl-over":diff<=3?"dl-close":"dl-ok";
    dlHtml = `<span class="meta-chip ${cls}">${diff<0?"⛔ Expirée":diff===0?"🔥 Aujourd'hui":diff===1?"⚠️ Demain":`⏰ J-${diff}`}</span>`;
  }
  const tagsHtml = (m.tags||[]).length?`<div class="card-tags">${m.tags.map(t=>`<span class="card-tag">#${esc(t)}</span>`).join("")}</div>`:"";

  let actions = "";

  if (ctx==="all" && isAdmin()) {
    if (m.status==="pending_validation") {
      actions=`<div class="card-validate-block">
        <div class="cv-notice">🔔 En attente de votre validation</div>
        <div class="card-btns">
          <button class="cbtn cbtn-val" data-id="${m.id}">✅ Valider</button>
          <button class="cbtn cbtn-rej" data-id="${m.id}">↩ Rejeter</button>
          <button class="cbtn cbtn-edit" data-id="${m.id}">✏️</button>
          <button class="cbtn cbtn-del"  data-id="${m.id}">🗑️</button>
        </div></div>`;
    } else {
      actions=`<div class="card-btns">
        <button class="cbtn cbtn-edit" data-id="${m.id}">✏️ Modifier</button>
        <button class="cbtn cbtn-del"  data-id="${m.id}">🗑️ Supprimer</button>
      </div>`;
    }
  }

  if (ctx==="all" && isFonct()) {
    const id = currentFonct.id;
    const isMine   = (m.assignMode==="specific"&&m.assignedToId===id)||(m.assignMode==="pool"&&m.reservedBy===id)||(m.assignMode==="open"&&m.assignedToId===id);
    const isPoolFree = m.assignMode==="pool"&&!m.reservedBy&&m.status==="open";
    const isOpenFree = m.assignMode==="open"&&m.status==="open"&&!m.assignedToId;
    if      (isPoolFree) actions=`<div class="card-btns"><button class="cbtn cbtn-main cbtn-reserve" data-id="${m.id}">⚡ Réserver</button></div>`;
    else if (isOpenFree) actions=`<div class="card-btns"><button class="cbtn cbtn-main cbtn-take"    data-id="${m.id}">▶️ Prendre en charge</button></div>`;
    else if (isMine) {
      if (["open","rejected"].includes(m.status))
        actions=`<div class="card-btns"><button class="cbtn cbtn-start" data-id="${m.id}">▶️ Démarrer</button><button class="cbtn cbtn-main cbtn-done" data-id="${m.id}">✔ Terminer</button></div>`;
      else if (m.status==="in-progress")
        actions=`<div class="card-btns"><button class="cbtn cbtn-main cbtn-done" data-id="${m.id}">✔ Marquer terminée</button></div>`;
      else if (m.status==="pending_validation")
        actions=`<div class="status-note note-pending">⏳ En attente de validation admin</div>`;
      else if (m.status==="validated")
        actions=`<div class="status-note note-done">✅ Mission validée</div>`;
    }
  }

  if (ctx==="pool")     actions=`<div class="card-btns"><button class="cbtn cbtn-main cbtn-reserve" data-id="${m.id}">⚡ Réserver cette mission</button></div>`;
  if (ctx==="assigned") {
    if (["open","rejected"].includes(m.status))
      actions=`<div class="card-btns"><button class="cbtn cbtn-start" data-id="${m.id}">▶️ Démarrer</button><button class="cbtn cbtn-main cbtn-done" data-id="${m.id}">✔ Terminer</button></div>`;
    else if (m.status==="in-progress")
      actions=`<div class="card-btns"><button class="cbtn cbtn-main cbtn-done" data-id="${m.id}">✔ Marquer terminée</button></div>`;
    else if (m.status==="pending_validation")
      actions=`<div class="status-note note-pending">⏳ En attente de validation</div>`;
  }
  if (ctx==="done") {
    actions = m.status==="validated"
      ? `<div class="status-note note-done">✅ Validée par l'administrateur</div>`
      : `<div class="status-note note-pending">⏳ En attente de validation</div>`;
  }

  card.innerHTML=`
    ${m.image?`<div class="card-cover"><img src="${esc(m.image)}" alt=""></div>`:`<div class="card-cover-placeholder p-${m.priority||"normal"}">📋</div>`}
    <div class="card-content">
      <div class="card-header-row">
        <h3 class="card-title${m.status==="validated"?" line-through":""}" title="${esc(m.title)}">${esc(m.title)}</h3>
        <div class="card-badges-col">
          ${prHtml}
          <span class="mode-tag">${mdLbl[m.assignMode]||"📋"}</span>
          <span class="status-tag st-${m.status||"open"}">${stLbl[m.status]||"Ouverte"}</span>
        </div>
      </div>
      <p class="card-desc">${esc(m.description)}</p>
      ${tagsHtml}
      <div class="card-meta-row">
        <span class="meta-chip">📅 ${m.createdAt||"—"}</span>
        ${assignee}${dlHtml}
        ${m.validatedAt?`<span class="meta-chip">✅ ${m.validatedAt}</span>`:""}
      </div>
      ${actions}
    </div>`;

  card.querySelector(".card-title")?.addEventListener("click", () => showDetail(m));
  card.querySelector(".cbtn-val")?.addEventListener("click",     e=>{e.stopPropagation();validateM(m.id);});
  card.querySelector(".cbtn-rej")?.addEventListener("click",     e=>{e.stopPropagation();rejectM(m.id);});
  card.querySelector(".cbtn-edit")?.addEventListener("click",    e=>{e.stopPropagation();openModalMission(m.id);});
  card.querySelector(".cbtn-del")?.addEventListener("click",     e=>{e.stopPropagation();deleteM(m.id);});
  card.querySelector(".cbtn-reserve")?.addEventListener("click", e=>{e.stopPropagation();reserveM(m.id);});
  card.querySelector(".cbtn-take")?.addEventListener("click",    e=>{e.stopPropagation();takeM(m.id);});
  card.querySelector(".cbtn-start")?.addEventListener("click",   e=>{e.stopPropagation();startM(m.id);});
  card.querySelector(".cbtn-done")?.addEventListener("click",    e=>{e.stopPropagation();doneM(m.id);});
  return card;
}

// ══════════════════════════════════════════════════
// ACTIONS MISSIONS
// ══════════════════════════════════════════════════
function validateM(id) {
  const m=missions.find(x=>x.id===id); if(!m)return;
  m.status="validated"; m.validatedAt=today(); delete m.rejectedAt;
  saveMiss(); renderMissions(); updateStats();
  addNotif(`Mission "${m.title}" validée ✅`,"success"); toast("Mission validée ✅","success");
}
function rejectM(id) {
  const m=missions.find(x=>x.id===id); if(!m)return;
  m.status=m.assignMode==="pool"?"open":"rejected"; m.rejectedAt=today();
  if(m.assignMode==="pool"){m.reservedBy=null;m.reservedByName=null;}
  delete m.validatedAt; saveMiss(); renderMissions(); updateStats();
  addNotif(`Mission "${m.title}" rejetée`,"warn"); toast("Mission rejetée — remise en cours","info");
}
function deleteM(id) {
  const m=missions.find(x=>x.id===id); if(!m)return;
  if(!confirm(`Supprimer "${m.title}" ?`))return;
  if (typeof SupaDB !== "undefined" && window.supabaseReady) {
    SupaDB.deleteMission(id).catch(console.error);
  }
  missions=missions.filter(x=>x.id!==id); saveMiss(); renderMissions(); updateStats();
  toast("Mission supprimée","info");
}
function reserveM(id) {
  if(!isFonct())return;
  const idx=missions.findIndex(m=>m.id===id); if(idx===-1)return;
  if(missions[idx].reservedBy){toast("Déjà réservée !","error"); renderMesMissions(); return;}
  missions[idx].reservedBy=currentFonct.id; missions[idx].reservedByName=currentFonct.nom;
  missions[idx].status="in-progress"; missions[idx].startedAt=today();
  saveMiss(); renderMesMissions(); renderMissions();
  addNotif(`Vous avez réservé "${missions[idx].title}"`,"success"); toast("Mission réservée ⚡","success");
}
function takeM(id) {
  if(!isFonct())return;
  const idx=missions.findIndex(m=>m.id===id); if(idx===-1)return;
  if(missions[idx].status!=="open"||missions[idx].assignedToId){toast("Mission déjà prise en charge.","error"); renderMissions(); return;}
  missions[idx].assignedToId=currentFonct.id; missions[idx].assignedToName=currentFonct.nom;
  missions[idx].status="in-progress"; missions[idx].startedAt=today();
  saveMiss(); renderMissions(); renderMesMissions();
  addNotif(`Vous avez pris en charge "${missions[idx].title}"`,"success"); toast("Mission prise en charge ▶️","success");
}
function startM(id) {
  const idx=missions.findIndex(m=>m.id===id); if(idx===-1)return;
  missions[idx].status="in-progress"; missions[idx].startedAt=today();
  saveMiss(); renderMesMissions(); renderMissions(); toast("Mission démarrée ▶️","info");
}
function doneM(id) {
  const idx=missions.findIndex(m=>m.id===id); if(idx===-1)return;
  missions[idx].status="pending_validation"; missions[idx].completedAt=today();
  if(missions[idx].startedAt){
    const s=new Date(missions[idx].startedAt.split("/").reverse().join("-"));
    missions[idx].processingDays=Math.max(0,Math.round((new Date()-s)/86400000));
  }
  saveMiss(); renderMesMissions(); renderMissions(); updateStats();
  addNotif(`"${missions[idx].title}" envoyée en validation`,"info"); toast("Mission marquée terminée ⏳","info");
}

// ══════════════════════════════════════════════════
// DÉTAIL MISSION
// ══════════════════════════════════════════════════
function showDetail(m) {
  const sl={open:"Ouverte","in-progress":"En cours",pending_validation:"À valider",validated:"Validée",rejected:"Rejetée"};
  const pl={normal:"Normale",high:"🔴 Haute",urgent:"🚨 Urgente"};
  const ml={open:"📋 Ouverte (tout le monde)",specific:"🎯 Ciblée",pool:"🌐 Pool"};
  $("mdTitle").textContent=m.title;
  $("mdContent").innerHTML=`
    <div class="detail-info-grid">
      <div class="dig-row"><span>Statut</span><span>${sl[m.status]||m.status}</span></div>
      <div class="dig-row"><span>Mode</span><span>${ml[m.assignMode]||m.assignMode}</span></div>
      <div class="dig-row"><span>Priorité</span><span>${pl[m.priority]||"Normale"}</span></div>
      ${m.assignedToName?`<div class="dig-row"><span>Assignée à</span><span>👤 ${esc(m.assignedToName)}</span></div>`:""}
      ${m.reservedByName?`<div class="dig-row"><span>Réservée par</span><span>👤 ${esc(m.reservedByName)}</span></div>`:""}
      ${m.deadline?`<div class="dig-row"><span>Deadline</span><span>⏰ ${m.deadline}</span></div>`:""}
      ${m.createdAt?`<div class="dig-row"><span>Créée le</span><span>${m.createdAt}</span></div>`:""}
      ${m.startedAt?`<div class="dig-row"><span>Démarrée</span><span>${m.startedAt}</span></div>`:""}
      ${m.completedAt?`<div class="dig-row"><span>Terminée</span><span>${m.completedAt}</span></div>`:""}
      ${m.validatedAt?`<div class="dig-row"><span>Validée</span><span>✅ ${m.validatedAt}</span></div>`:""}
      ${m.processingDays!=null?`<div class="dig-row"><span>Durée</span><span>⏱️ ${m.processingDays}j</span></div>`:""}
    </div>
    <div class="detail-desc-block"><h4>Description</h4><p>${esc(m.description)}</p></div>
    ${(m.tags||[]).length?`<div class="detail-tags" style="margin-top:12px;">${m.tags.map(t=>`<span class="card-tag">#${esc(t)}</span>`).join("")}</div>`:""}
    ${m.image?`<div style="margin-top:14px;"><img src="${esc(m.image)}" style="width:100%;border-radius:10px;max-height:280px;object-fit:cover;"></div>`:""}`;
  openModal("modalDetail");
}

// ══════════════════════════════════════════════════
// MODAL MISSION
// ══════════════════════════════════════════════════
function openModalMission(mId=null) {
  editMissionId=mId; const m=mId?missions.find(x=>x.id===mId):null;
  $("mmTitle").textContent=m?"Modifier la mission":"Créer une mission";
  $("btnSaveMission").textContent=m?"Enregistrer":"Créer";
  $("mTitle").value=m?.title||""; $("mDesc").value=m?.description||"";
  $("mDeadline").value=m?.deadline||""; $("mPriority").value=m?.priority||"normal";
  $("mTags").value=(m?.tags||[]).join(", "); $("mImage").value="";
  const mode=m?.assignMode||"open";
  document.querySelectorAll('input[name="amode"]').forEach(r=>r.checked=r.value===mode);
  $("specificFonctField")?.classList.toggle("hidden",mode!=="specific");
  updateFonctSelect(); if(m?.assignedToId) $("mFonct").value=m.assignedToId;
  $("mErr").textContent=""; openModal("modalMission");
}

$("btnSaveMission")?.addEventListener("click",()=>{
  const title=$("mTitle").value.trim(), desc=$("mDesc").value.trim();
  if(!title||!desc){$("mErr").textContent="❌ Titre et description obligatoires."; return;}
  const mode=document.querySelector('input[name="amode"]:checked')?.value||"open";
  const assignedToId=mode==="specific"?($("mFonct").value||null):null;
  const assignedToName=assignedToId?(fonctionnaires.find(f=>String(f.id)===String(assignedToId))?.nom||null):null;
  if(mode==="specific"&&!assignedToId){$("mErr").textContent="❌ Sélectionnez un fonctionnaire."; return;}
  const tags=$("mTags").value.trim().split(",").map(t=>t.trim()).filter(Boolean);
  const file=$("mImage").files[0];
  $("mErr").textContent="";
  if(editMissionId){
    const idx=missions.findIndex(m=>m.id===editMissionId); if(idx===-1)return;
    Object.assign(missions[idx],{title,description:desc,assignMode:mode,assignedToId,assignedToName,deadline:$("mDeadline").value||null,priority:$("mPriority").value,tags,updatedAt:today()});
    if(file)missions[idx].image=URL.createObjectURL(file);
    toast("Mission modifiée ✅","success");
  } else {
    missions.push({id:uid(),title,description:desc,image:file?URL.createObjectURL(file):null,adminId:currentAdmin.id,assignMode:mode,assignedToId,assignedToName,reservedBy:null,reservedByName:null,deadline:$("mDeadline").value||null,priority:$("mPriority").value||"normal",tags,status:"open",createdAt:today()});
    addNotif(`Nouvelle mission créée : "${title}"`,"info"); toast("Mission créée ✅","success");
  }
  saveMiss(); renderMissions(); updateStats(); closeModal("modalMission");
});

function updateFonctSelect() {
  const s=$("mFonct"); if(!s)return;
  s.innerHTML='<option value="">-- Sélectionner --</option>';
  fonctionnaires.filter(f=>f.adminId===currentAdmin.id&&f.activated&&!f.suspended).forEach(f=>{
    const o=document.createElement("option"); o.value=f.id; o.textContent=`${f.nom} (${f.email})`; s.appendChild(o);
  });
}

// ══════════════════════════════════════════════════
// FONCTIONNAIRES
// ══════════════════════════════════════════════════
$("btnAddFonct")?.addEventListener("click",()=>openModalFonct());

function openModalFonct(fId=null){
  editFonctId=fId; const f=fId?fonctionnaires.find(x=>x.id===fId):null;
  $("mfTitle").textContent=f?"Modifier":"Ajouter un fonctionnaire";
  $("btnSaveFonct").textContent=f?"Enregistrer":"Ajouter";
  $("mfNom").value=f?.nom||""; $("mfEmail").value=f?.email||"";
  $("mfTel").value=f?.tel||""; $("mfDept").value=f?.dept||"";
  $("mfErr").textContent=""; openModal("modalFonct");
}

$("btnSaveFonct")?.addEventListener("click",()=>{
  const nom=$("mfNom").value.trim(), email=$("mfEmail").value.trim().toLowerCase();
  const tel=$("mfTel").value.trim(), dept=$("mfDept").value.trim();
  if(!nom||!email){$("mfErr").textContent="❌ Nom et email obligatoires."; return;}
  if(!email.includes("@")){$("mfErr").textContent="❌ Email invalide."; return;}
  if(fonctionnaires.find(f=>f.email.toLowerCase()===email&&f.id!==editFonctId)){$("mfErr").textContent="❌ Email déjà utilisé."; return;}
  $("mfErr").textContent="";
  if(editFonctId){
    const idx=fonctionnaires.findIndex(f=>f.id===editFonctId);
    if(idx!==-1)Object.assign(fonctionnaires[idx],{nom,email,tel,dept});
    saveFoncts(); renderFoncts(); updateFonctSelect(); closeModal("modalFonct"); toast("Fonctionnaire modifié ✅","success");
  } else {
    const code=genCode();
    const newF={id:Date.now(),nom,email,tel,dept,adminId:currentAdmin.id,date:today(),inviteCode:code,passwordHash:null,activated:false,suspended:false};
    fonctionnaires.push(newF); saveFoncts(); renderFoncts(); updateStats(); updateFonctSelect();
    closeModal("modalFonct"); showInviteModal(newF);
  }
});

function renderFoncts(){
  const grid=$("fonctGrid"), empty=$("emptyFoncts"); if(!grid)return;
  const src=fonctionnaires.filter(f=>f.adminId===currentAdmin.id);
  $("kpiTotal").textContent  =src.length;
  $("kpiActif").textContent  =src.filter(f=>f.activated&&!f.suspended).length;
  $("kpiPending").textContent=src.filter(f=>!f.activated&&!f.suspended).length;
  $("kpiSusp").textContent   =src.filter(f=>f.suspended).length;
  $("bdgFoncts").textContent =src.length;
  grid.innerHTML="";
  if(!src.length){empty.classList.remove("hidden");return;}
  empty.classList.add("hidden");
  src.forEach((f,i)=>{
    const card=document.createElement("div");
    card.className=`fonct-card${f.suspended?" fc-suspended":""}`;
    card.style.animationDelay=`${i*0.04}s`;
    const ini=f.nom.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase();
    const stBadge=f.suspended?`<span class="fb fb-s">Suspendu</span>`:f.activated?`<span class="fb fb-a">Actif</span>`:`<span class="fb fb-p">En attente</span>`;
    const myM=missions.filter(m=>(m.assignedToId===f.id||m.reservedBy===f.id)&&m.adminId===currentAdmin.id);
    const done=myM.filter(m=>m.status==="validated").length;
    const inProg=myM.filter(m=>m.status==="in-progress").length;
    card.innerHTML=`
      <div class="fc-avatar">${ini}</div>
      <div class="fc-info">
        <div class="fc-name-row"><strong>${esc(f.nom)}</strong>${stBadge}</div>
        <p>📧 ${esc(f.email)}</p>
        ${f.tel?`<p>📞 ${esc(f.tel)}</p>`:""}
        ${f.dept?`<p>🏢 ${esc(f.dept)}</p>`:""}
        <small>🗓️ ${f.date} · 📋 ${myM.length} missions · ✅ ${done} validées · ⏳ ${inProg} en cours</small>
      </div>
      <div class="fc-actions">
        ${!f.activated&&!f.suspended?`<button class="fc-btn fc-btn-code" title="Code invitation">🔑</button>`:""}
        <button class="fc-btn fc-btn-edit" title="Modifier">✏️</button>
        <button class="fc-btn fc-btn-susp ${f.suspended?"fc-btn-unsusp":""}" title="${f.suspended?"Réactiver":"Suspendre"}">${f.suspended?"✅":"🚫"}</button>
        <button class="fc-btn fc-btn-del" title="Supprimer">🗑️</button>
      </div>`;
    card.querySelector(".fc-btn-code")?.addEventListener("click",()=>showInviteModal(f));
    card.querySelector(".fc-btn-edit")?.addEventListener("click",()=>openModalFonct(f.id));
    card.querySelector(".fc-btn-susp")?.addEventListener("click",()=>{
      const idx=fonctionnaires.findIndex(x=>x.id===f.id);
      if(idx!==-1){fonctionnaires[idx].suspended=!fonctionnaires[idx].suspended;saveFoncts();renderFoncts();toast(fonctionnaires[idx].suspended?"Suspendu 🚫":"Réactivé ✅","info");}
    });
    card.querySelector(".fc-btn-del")?.addEventListener("click",()=>{
      if(!confirm(`Supprimer ${f.nom} ?`))return;
      if (typeof SupaDB !== "undefined" && window.supabaseReady) {
        SupaDB.deleteFonctionnaire(f.id).catch(console.error);
      }
      fonctionnaires=fonctionnaires.filter(x=>x.id!==f.id);saveFoncts();renderFoncts();updateStats();updateFonctSelect();toast("Supprimé","info");
    });
    grid.appendChild(card);
  });
}

function showInviteModal(f){
  if($("miNom"))      $("miNom").textContent=f.nom;
  if($("miEmail"))    $("miEmail").textContent=f.email;
  if($("miCode"))     $("miCode").textContent=f.inviteCode;
  if($("miEmailStep"))$("miEmailStep").textContent=f.email;
  openModal("modalInvite");
}
$("btnCopyCode")?.addEventListener("click",()=>navigator.clipboard?.writeText($("miCode").textContent).then(()=>toast("Code copié !","success")).catch(()=>toast("Code : "+$("miCode").textContent,"info")));
$("btnRegenCode")?.addEventListener("click",()=>{
  const em=$("miEmail").textContent, idx=fonctionnaires.findIndex(f=>f.email===em);
  if(idx!==-1&&!fonctionnaires[idx].activated){const c=genCode();fonctionnaires[idx].inviteCode=c;saveFoncts();$("miCode").textContent=c;toast("Nouveau code généré","success");}
});

// ══════════════════════════════════════════════════
// MON COMPTE (admin)
// ══════════════════════════════════════════════════
function renderMyAccount() {
  if(!isAdmin())return;
  const ini=currentAdmin.nom.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase();
  if($("acAvatar"))$("acAvatar").textContent=ini;
  if($("acNom"))   $("acNom").textContent=currentAdmin.nom;
  if($("acEmail")) $("acEmail").textContent=`📧 ${currentAdmin.email}`;
  if($("acDate"))  $("acDate").textContent=`🗓️ Compte créé le ${currentAdmin.createdAt}`;
}

$("btnChangePwdA")?.addEventListener("click",()=>{["cpOld","cpNew","cpConfirm"].forEach(id=>{if($(id))$(id).value="";}); $("cpErr").textContent=""; openModal("modalChangePwd");});
$("btnChangePwdF")?.addEventListener("click",()=>{["cpOld","cpNew","cpConfirm"].forEach(id=>{if($(id))$(id).value="";}); $("cpErr").textContent=""; openModal("modalChangePwd");});

$("btnSaveChangePwd")?.addEventListener("click", async ()=>{
  const old=$("cpOld").value, nw=$("cpNew").value, conf=$("cpConfirm").value;
  const hash=isAdmin()?currentAdmin?.passwordHash:currentFonct?.passwordHash;
  if(!await verifyPassword(old, hash)){$("cpErr").textContent="❌ Mot de passe actuel incorrect.";return;}
  if(nw.length<6){$("cpErr").textContent="❌ Minimum 6 caractères.";return;}
  if(nw!==conf){$("cpErr").textContent="❌ Les mots de passe ne correspondent pas.";return;}
  $("cpErr").textContent="";
  const nextHash = await hashPassword(nw);
  if(isAdmin()){
    const idx=admins.findIndex(a=>a.id===currentAdmin.id);
    if(idx!==-1){admins[idx].passwordHash=nextHash;currentAdmin=admins[idx];saveAdmins();}
  } else {
    const idx=fonctionnaires.findIndex(f=>f.id===currentFonct.id);
    if(idx!==-1){fonctionnaires[idx].passwordHash=nextHash;currentFonct=fonctionnaires[idx];saveFoncts();}
  }
  closeModal("modalChangePwd"); toast("Mot de passe modifié ✅","success");
});

// ══════════════════════════════════════════════════
// STATISTIQUES
// ══════════════════════════════════════════════════
function updateStats(){
  const src=isAdmin()?missions.filter(m=>m.adminId===currentAdmin.id):[];
  const fs =isAdmin()?fonctionnaires.filter(f=>f.adminId===currentAdmin.id):[];
  if($("skMissions"))$("skMissions").textContent=src.length;
  if($("skFoncts"))  $("skFoncts").textContent=fs.length;
  if($("skEnCours")) $("skEnCours").textContent=src.filter(m=>m.status==="in-progress").length;
  if($("skAValider"))$("skAValider").textContent=src.filter(m=>m.status==="pending_validation").length;
  if($("skValidees"))$("skValidees").textContent=src.filter(m=>m.status==="validated").length;
  if($("skUrgentes"))$("skUrgentes").textContent=src.filter(m=>m.priority==="urgent"&&m.status!=="validated").length;
}

function renderStatsDetails(){
  const src=missions.filter(m=>m.adminId===currentAdmin.id);
  const fs =fonctionnaires.filter(f=>f.adminId===currentAdmin.id);
  const chart=$("statsChart");
  if(chart){
    const bars=[
      {l:"Ouvertes",  v:src.filter(m=>m.status==="open").length,               c:"var(--blue)"},
      {l:"En cours",  v:src.filter(m=>m.status==="in-progress").length,        c:"var(--amber)"},
      {l:"À valider", v:src.filter(m=>m.status==="pending_validation").length, c:"var(--violet)"},
      {l:"Validées",  v:src.filter(m=>m.status==="validated").length,          c:"var(--green)"},
    ];
    const mx=Math.max(...bars.map(b=>b.v),1);
    chart.innerHTML=bars.map(b=>`<div class="sbc-item"><div class="sbc-bar-wrap"><span class="sbc-val">${b.v}</span><div class="sbc-fill" style="height:${Math.round(b.v/mx*100)}%;background:${b.c}"></div></div><span class="sbc-lbl">${b.l}</span></div>`).join("");
  }
  const topEl=$("topFoncts");
  if(topEl){
    topEl.innerHTML="";
    const ranked=fs.map(f=>({...f,done:src.filter(m=>(m.assignedToId===f.id||m.reservedBy===f.id)&&m.status==="validated").length})).sort((a,b)=>b.done-a.done).slice(0,5);
    if(!ranked.length||ranked[0].done===0){topEl.innerHTML='<p style="color:var(--text3);padding:16px;font-size:13px;">Aucune mission validée pour l\'instant.</p>';return;}
    ranked.forEach((f,i)=>{
      const el=document.createElement("div");el.className="tl-item";
      const ini=f.nom.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase();
      const medals=["🥇","🥈","🥉","4.","5."];
      el.innerHTML=`<span class="tl-rank">${medals[i]}</span><div class="tl-avatar">${ini}</div><div class="tl-info"><span>${esc(f.nom)}</span><small>${esc(f.dept||"—")}</small></div><span class="tl-count">${f.done} ✅</span>`;
      topEl.appendChild(el);
    });
  }
  const urgEl=$("urgentList"), urgEm=$("emptyUrgent");
  if(urgEl){
    urgEl.innerHTML="";
    const urgent=src.filter(m=>m.status!=="validated").filter(m=>{
      if(m.priority==="urgent")return true;
      if(m.deadline){const d=Math.ceil((new Date(m.deadline)-new Date())/86400000);return d<=3;}
      return false;
    });
    if(!urgent.length){urgEm.classList.remove("hidden");return;}
    urgEm.classList.add("hidden");
    urgent.forEach(m=>{
      const el=document.createElement("div");el.className="ul-item";
      const dl=m.deadline?Math.ceil((new Date(m.deadline)-new Date())/86400000):null;
      const dlStr=dl!==null?(dl<0?"⛔ Expirée":dl===0?"🔥 Aujourd'hui":`⏰ J-${dl}`):"Sans deadline";
      el.innerHTML=`<span class="ul-prio">${m.priority==="urgent"?"🚨":"🔴"}</span><div class="ul-info"><span>${esc(m.title)}</span><small>${dlStr} · ${m.status}</small></div>`;
      urgEl.appendChild(el);
    });
  }
}

// ══════════════════════════════════════════════════
// PROFIL (fonctionnaire)
// ══════════════════════════════════════════════════
function renderProfile(){
  if(!isFonct())return;
  const f=currentFonct, id=f.id;
  const ini=f.nom.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase();
  $("profileHeading").textContent=f.nom;
  if($("pAvatar"))$("pAvatar").textContent=ini;
  if($("pNom"))   $("pNom").textContent=f.nom;
  if($("pEmail")) $("pEmail").textContent=`📧 ${f.email}`;
  if($("pTel"))   $("pTel").textContent=f.tel?`📞 ${f.tel}`:"";
  if($("pDept"))  $("pDept").textContent=f.dept?`🏢 ${f.dept}`:"";
  if($("pDate"))  $("pDate").textContent=`🗓️ Membre depuis le ${f.date}`;
  const adminMiss=missions.filter(m=>m.adminId===f.adminId);
  const myM=adminMiss.filter(m=>(m.assignMode==="specific"&&m.assignedToId===id)||(m.assignMode==="pool"&&m.reservedBy===id)||(m.assignMode==="open"&&m.assignedToId===id));
  const enc=myM.filter(m=>m.status==="in-progress").length;
  const val=myM.filter(m=>m.status==="validated").length;
  const tot=myM.length, taux=tot>0?Math.round(val/tot*100):0;
  if($("pTotal"))   $("pTotal").textContent=tot;
  if($("pEnCours")) $("pEnCours").textContent=enc;
  if($("pValidees"))$("pValidees").textContent=val;
  if($("pTaux"))    $("pTaux").textContent=taux+"%";
  if($("progFill")) $("progFill").style.width=taux+"%";
  if($("progPct"))  $("progPct").textContent=taux+"%";
  const att=myM.filter(m=>m.status==="open"||m.status==="pending_validation").length;
  const mc=$("profileChart");
  if(mc){
    const bars=[{l:"Attente",v:att,c:"#f59e0b"},{l:"En cours",v:enc,c:"#1a56db"},{l:"Validées",v:val,c:"#10b981"}];
    const mx=Math.max(...bars.map(b=>b.v),1);
    mc.innerHTML=bars.map(b=>`<div class="mbc-item"><div class="mbc-col"><span>${b.v}</span><div style="height:${Math.round(b.v/mx*80)+20}px;background:${b.c};border-radius:5px 5px 0 0;width:100%;"></div></div><span>${b.l}</span></div>`).join("");
  }
  const hl=$("histList"), eh=$("emptyHist"); if(!hl)return;
  hl.innerHTML="";
  const sorted=[...myM].sort((a,b)=>(b.completedAt||b.startedAt||b.createdAt||"").localeCompare(a.completedAt||a.startedAt||a.createdAt||""));
  if(!sorted.length){eh.classList.remove("hidden");return;}
  eh.classList.add("hidden");
  sorted.forEach(m=>{
    const el=document.createElement("div");el.className="hl-item";
    const col={open:"#9ca3af","in-progress":"#1a56db",pending_validation:"#7e3af2",validated:"#10b981",rejected:"#ef4444"}[m.status]||"#9ca3af";
    const lbl={open:"Ouverte","in-progress":"En cours",pending_validation:"En attente",validated:"Validée",rejected:"Rejetée"}[m.status]||m.status;
    el.innerHTML=`<div class="hl-dot" style="background:${col}"></div><div><strong>${esc(m.title)}</strong><br><small style="color:${col}">${lbl}</small> <small>· ${m.completedAt||m.startedAt||m.createdAt||"—"}</small></div>`;
    hl.appendChild(el);
  });
}

// ══════════════════════════════════════════════════
// CHAT
// ══════════════════════════════════════════════════
let chatMode="public", chatConvKey=null;
const convKey=(a,b)=>[String(a),String(b)].sort().join("__");
const privUnread=(key)=>(privateChats[key]||[]).filter(m=>m.senderId!==myId()&&!m.read).length;

function buildContacts(){
  const res=[];
  if(isFonct()){
    const adm=admins.find(a=>a.id===currentFonct.adminId);
    if(adm)res.push({id:`admin_${adm.id}`,nom:`${adm.nom} 🛡️`,role:"admin"});
    fonctionnaires.filter(f=>f.adminId===currentFonct.adminId&&f.id!==currentFonct.id&&f.activated&&!f.suspended).forEach(f=>res.push({id:String(f.id),nom:f.nom,role:"fonctionnaire"}));
  } else if(isAdmin()){
    fonctionnaires.filter(f=>f.adminId===currentAdmin.id&&f.activated&&!f.suspended).forEach(f=>res.push({id:String(f.id),nom:f.nom,role:"fonctionnaire"}));
  }
  return res;
}

function updatePrivUnread(){
  const n=buildContacts().reduce((s,c)=>s+privUnread(convKey(myId(),c.id)),0);
  if($("bdgChat")){$("bdgChat").textContent=n;$("bdgChat").classList.toggle("hidden",n===0);}
  if($("privUnreadBadge")){$("privUnreadBadge").textContent=n;$("privUnreadBadge").classList.toggle("hidden",n===0);}
}

function switchChatTab(mode){
  document.querySelectorAll(".chat-tab-btn").forEach(t=>t.classList.remove("active"));
  $(`ctb${mode==="public"?"Public":"Private"}`)?.classList.add("active");
  if(mode==="public"){
    chatMode="public"; chatConvKey=null;
    $("chatTopbar").innerHTML=`<strong>💬 Chat public</strong><small>Visible par tous</small>`;
    $("chatInputBar").classList.remove("hidden"); renderPublicChat();
  } else renderContacts();
}

function sendMsg(){
  const inp=$("chatInput"), txt=inp.value.trim(); if(!txt)return;
  if(chatMode==="public"){
    messages.push({id:uid(),text:txt,author:myName(),senderId:myId(),senderRole:currentRole,time:timeNow()});
    saveMsgs(); renderPublicChat();
  } else if(chatMode==="private"&&chatConvKey){
    if(!privateChats[chatConvKey])privateChats[chatConvKey]=[];
    privateChats[chatConvKey].push({id:uid(),text:txt,author:myName(),senderId:myId(),time:timeNow(),read:false});
    savePriv(); renderPrivateChat(chatConvKey);
  }
  inp.value="";
}

$("chatFile")?.addEventListener("change",e=>{
  const file=e.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const isImg=file.type.startsWith("image/");
    const d={id:uid(),author:myName(),senderId:myId(),time:timeNow(),fileData:ev.target.result,fileName:file.name,isImage:isImg};
    if(chatMode==="public"){messages.push({...d,senderRole:currentRole});saveMsgs();renderPublicChat();}
    else if(chatMode==="private"&&chatConvKey){if(!privateChats[chatConvKey])privateChats[chatConvKey]=[];privateChats[chatConvKey].push({...d,read:false});savePriv();renderPrivateChat(chatConvKey);}
  };
  reader.readAsDataURL(file); e.target.value="";
});

function renderPublicChat(){
  const c=$("chatMessages"); if(!c)return; c.innerHTML="";
  if(!messages.length){c.innerHTML='<div class="chat-empty">💬 Soyez le premier à écrire !</div>';return;}
  messages.forEach(m=>c.appendChild(bubble(m,m.senderId===myId()))); c.scrollTop=c.scrollHeight;
}

function renderPrivateChat(key){
  const c=$("chatMessages"); if(!c)return; c.innerHTML="";
  const msgs=privateChats[key]||[];
  if(!msgs.length){c.innerHTML='<div class="chat-empty">💬 Démarrez la conversation !</div>';return;}
  msgs.forEach(m=>c.appendChild(bubble(m,m.senderId===myId()))); c.scrollTop=c.scrollHeight;
}

function renderContacts(){
  chatMode="contacts"; chatConvKey=null;
  $("chatTopbar").innerHTML=`<strong>💬 Messagerie privée</strong><small>Sélectionnez un contact</small>`;
  $("chatInputBar").classList.add("hidden");
  const c=$("chatMessages"); if(!c)return; c.innerHTML="";
  const contacts=buildContacts();
  if(!contacts.length){c.innerHTML='<div class="chat-empty">Aucun contact disponible.</div>';return;}
  contacts.forEach(ct=>{
    const key=convKey(myId(),ct.id), unread=privUnread(key);
    const last=(privateChats[key]||[]).slice(-1)[0];
    const preview=last?(last.isImage?"📷 Image":last.fileName?`📎 ${last.fileName}`:last.text):"Aucun message";
    const ini=ct.nom.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase();
    const el=document.createElement("div"); el.className=`contact-row${unread>0?" cr-unread":""}`;
    el.innerHTML=`<div class="cr-avatar">${esc(ini)}</div><div class="cr-info"><span>${esc(ct.nom)}</span><small>${esc(String(preview).substring(0,40))}</small></div>${unread>0?`<span class="cr-badge">${unread}</span>`:""}`;
    el.addEventListener("click",()=>openPrivChat(ct.id)); c.appendChild(el);
  });
}

function openPrivChat(contactId){
  chatMode="private"; chatConvKey=convKey(myId(),contactId);
  if(!privateChats[chatConvKey])privateChats[chatConvKey]=[];
  privateChats[chatConvKey].forEach(m=>{if(m.senderId!==myId())m.read=true;});
  savePriv(); updatePrivUnread();
  const ct=buildContacts().find(c=>c.id===contactId);
  const ini=ct?.nom.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase()||"?";
  $("chatTopbar").innerHTML=`<button class="btn-back-chat" id="btnChatBack">← Retour</button><div class="chat-contact-row"><div class="ccr-avatar">${esc(ini)}</div><div><strong>${esc(ct?.nom||contactId)}</strong><small>${ct?.role||""}</small></div></div>`;
  $("btnChatBack")?.addEventListener("click",()=>renderContacts());
  $("chatInputBar").classList.remove("hidden"); renderPrivateChat(chatConvKey);
}

function bubble(m,mine){
  const el=document.createElement("div"); el.className=`bubble ${mine?"mine":"other"}`;
  const content=m.isImage&&m.fileData
    ?`<img src="${m.fileData}" class="bubble-img" alt="${esc(m.fileName||"")}" onclick="this.requestFullscreen&&this.requestFullscreen()">`
    :m.fileData
    ?`<a href="${m.fileData}" download="${esc(m.fileName||"fichier")}" class="bubble-file">📎 ${esc(m.fileName||"Fichier")}</a>`
    :`<div class="bubble-text">${esc(m.text)}</div>`;
  el.innerHTML=`<div class="bubble-meta">${esc(m.author)} · ${m.time}</div>${content}`;
  return el;
}

function renderMessages(){
  chatMode="public"; chatConvKey=null;
  $("chatTopbar").innerHTML=`<strong>💬 Chat public</strong><small>Visible par tous</small>`;
  $("chatInputBar")?.classList.remove("hidden");
  renderPublicChat(); updatePrivUnread();
}

$("btnSendChat")?.addEventListener("click",sendMsg);
$("chatInput")?.addEventListener("keypress",e=>e.key==="Enter"&&sendMsg());

// ══════════════════════════════════════════════════
// DEADLINES
// ══════════════════════════════════════════════════
function checkDeadlines(){
  if(!isAdmin())return;
  missions.filter(m=>m.adminId===currentAdmin.id&&m.deadline&&m.status!=="validated").forEach(m=>{
    const diff=Math.ceil((new Date(m.deadline)-new Date())/86400000);
    if(diff===1)addNotif(`⚠️ Deadline demain : "${m.title}"`,"warn");
    if(diff<0)  addNotif(`❌ Deadline dépassée : "${m.title}"`,"error");
  });
}

// ══════════════════════════════════════════════════
// ONGLETS
// ══════════════════════════════════════════════════
function switchTab(tabId){
  document.querySelectorAll(".tabbtn").forEach(t=>t.classList.toggle("active",t.dataset.tab===tabId));
  document.querySelectorAll(".tab-pane").forEach(p=>{p.classList.add("hidden");p.classList.remove("active-pane");});
  $(tabId)?.classList.remove("hidden"); $(tabId)?.classList.add("active-pane");
}

// ══════════════════════════════════════════════════
// RECHERCHE
// ══════════════════════════════════════════════════
function initSearch(){
  const s=$("searchMissions"), c=$("btnClearSearch"); if(!s)return;
  s.addEventListener("input",()=>{c?.classList.toggle("hidden",!s.value.trim());renderMissions();});
  c?.addEventListener("click",()=>{s.value="";c.classList.add("hidden");renderMissions();});
}

// ══════════════════════════════════════════════════
// MODALES
// ══════════════════════════════════════════════════
function initModals(){
  document.querySelectorAll(".modal-close,[data-close]").forEach(btn=>{
    btn.addEventListener("click",()=>closeModal(btn.dataset.close||btn.closest(".modal-overlay")?.id));
  });
  document.querySelectorAll(".modal-overlay").forEach(o=>{
    o.addEventListener("click",e=>{if(e.target===o)closeModal(o.id);});
  });
}
function openModal(id){
  const el=$(id); if(!el)return; el.classList.remove("hidden");
  requestAnimationFrame(()=>el.querySelector(".modal-box")?.classList.add("modal-open"));
}
function closeModal(id){
  const el=$(id); if(!el)return;
  el.querySelector(".modal-box")?.classList.remove("modal-open");
  setTimeout(()=>el.classList.add("hidden"),200);
}
// =====================================================
// patch-auth.js — Inscription + Mot de passe oublié
// Coller dans script.js (remplace / ajoute les fonctions)
// =====================================================

// ══════════════════════════════════════════════════
// TABS CONNEXION / INSCRIPTION
// ══════════════════════════════════════════════════
function switchAuthTab(tab) {
  const isLogin = tab === "login";

  // Tabs UI
  $("tabLogin")?.classList.toggle("active", isLogin);
  $("tabRegister")?.classList.toggle("active", !isLogin);

  // Panels
  $("aFormLogin")?.classList.toggle("hidden", !isLogin);
  $("aFormRegister")?.classList.toggle("hidden", isLogin);
  $("aFormCreate")?.classList.add("hidden");

  // Reset erreurs
  hideErr("aErrMain");
  hideErr("aErrRegister");

  // Reset champs inscription
  if (!isLogin) {
    ["rNom","rEmail","rPwd","rPwdConfirm"].forEach(id => { if($(id)) $(id).value = ""; });
    $("pwdStrengthWrap").style.display = "none";
  }
}

// ══════════════════════════════════════════════════
// FORCE MOT DE PASSE (jauge visuelle)
// ══════════════════════════════════════════════════
function checkPwdStrength(pwd) {
  const wrap = $("pwdStrengthWrap");
  const bar  = $("pwdStrengthBar");
  const lbl  = $("pwdStrengthLabel");
  if (!wrap || !bar || !lbl) return;

  if (!pwd) { wrap.style.display = "none"; return; }
  wrap.style.display = "flex";

  let score = 0;
  if (pwd.length >= 6)  score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  const levels = [
    { label: "Très faible", color: "#ef4444", width: "20%" },
    { label: "Faible",      color: "#f97316", width: "40%" },
    { label: "Moyen",       color: "#f59e0b", width: "60%" },
    { label: "Fort",        color: "#22c55e", width: "80%" },
    { label: "Très fort",   color: "#10b981", width: "100%" },
  ];
  const lvl = levels[Math.min(score, 4)];
  bar.style.cssText  = `height:4px;border-radius:2px;background:${lvl.color};width:${lvl.width};transition:all .3s ease;flex:1`;
  lbl.textContent    = lvl.label;
  lbl.style.color    = lvl.color;
}

// ══════════════════════════════════════════════════
// INSCRIPTION ADMIN
// ══════════════════════════════════════════════════
$("btnARegister")?.addEventListener("click", doAdminRegister);
$("rPwdConfirm")?.addEventListener("keypress", e => e.key === "Enter" && doAdminRegister());

async function doAdminRegister() {
  const nom   = $("rNom")?.value.trim();
  const email = $("rEmail")?.value.trim().toLowerCase();
  const pwd   = $("rPwd")?.value;
  const conf  = $("rPwdConfirm")?.value;
  hideErr("aErrRegister");

  // Validations
  if (!nom)                    { showErr("aErrRegister", "Saisissez votre nom complet."); return; }
  if (!email || !email.includes("@")) { showErr("aErrRegister", "Email invalide."); return; }
  if (pwd.length < 6)          { showErr("aErrRegister", "Le mot de passe doit faire au moins 6 caractères."); return; }
  if (pwd !== conf)            { showErr("aErrRegister", "Les mots de passe ne correspondent pas."); return; }

  // Vérifier email déjà utilisé (local)
  if (admins.find(a => a.email.toLowerCase() === email)) {
    showErr("aErrRegister", "Un compte admin existe déjà avec cet email."); return;
  }

  // Vérifier email déjà utilisé (Supabase)
  if (typeof SupaDB !== "undefined" && window.supabaseReady) {
    const existing = await SupaDB.findAdminByEmail(email);
    if (existing) {
      showErr("aErrRegister", "Un compte admin existe déjà avec cet email."); return;
    }
  }

  // Désactiver le bouton pendant la création
  const btn = $("btnARegister");
  if (btn) { btn.disabled = true; btn.innerHTML = "<span>⏳ Création...</span>"; }

  try {
    const newAdmin = {
      id:           uid(),
      nom,
      email,
      passwordHash: await hashPassword(pwd),
      createdAt:    today(),
    };

    admins.push(newAdmin);
    DB.save("mit_admins", admins);

    // ✅ Await Supabase save BEFORE launching app
    if (typeof SupaDB !== "undefined" && window.supabaseReady) {
      await SupaDB.saveAdmin(newAdmin);

      // Enregistrer aussi dans Supabase Auth pour que "mot de passe oublié" fonctionne
      try {
        await window._supabaseClient.auth.signUp({
          email,
          password: pwd,
          options: { data: { nom, role: "admin", mit_id: String(newAdmin.id) } }
        });
        // Note : on n'utilise PAS Supabase Auth pour la session
        // C'est juste pour que l'email existe dans auth.users
        // et que resetPasswordForEmail() fonctionne
      } catch (authErr) {
        // Non bloquant — la connexion locale fonctionne même si Auth échoue
        console.warn("Supabase Auth signUp (non bloquant):", authErr.message);
      }
    }

    currentRole = "admin"; currentAdmin = newAdmin; currentFonct = null;
    toast(`Bienvenue ${nom} ! Compte créé avec succès ✅`, "success");
    launchApp();

  } catch (err) {
    console.error("doAdminRegister error:", err);
    showErr("aErrRegister", "Erreur lors de la création. Réessayez.");
    if (btn) { btn.disabled = false; btn.innerHTML = "<span>Créer mon compte</span><span>→</span>"; }
  }
}

// ══════════════════════════════════════════════════
// MOT DE PASSE OUBLIÉ — via Supabase Auth + Gmail
// ══════════════════════════════════════════════════
function openForgotModal() {
  // Reset état
  $("forgotStep1")?.classList.remove("hidden");
  $("forgotStep2")?.classList.add("hidden");
  $("btnForgotResend")?.classList.add("hidden");
  if ($("forgotEmail")) $("forgotEmail").value = "";
  hideErr("forgotErr1");

  // Pré-remplir l'email si déjà saisi dans le login
  const loginEmail = $("aEmail")?.value.trim();
  if (loginEmail && $("forgotEmail")) $("forgotEmail").value = loginEmail;

  openModal("modalForgot");
}

function closeForgotModal() {
  closeModal("modalForgot");
}

async function sendForgotEmail() {
  const email = $("forgotEmail")?.value.trim().toLowerCase();
  hideErr("forgotErr1");

  if (!email || !email.includes("@")) {
    showErr("forgotErr1", "Saisissez un email valide.");
    return;
  }

  const btn = $("btnForgotSend");
  if (btn) { btn.disabled = true; btn.innerHTML = "<span class='spin'>⏳</span><span>Envoi en cours...</span>"; }

  if (!window.supabaseReady || !window._supabaseClient) {
    showErr("forgotErr1", "Service non disponible. Vérifiez votre connexion.");
    if (btn) { btn.disabled = false; btn.innerHTML = "<span>📤</span><span>Envoyer le lien</span>"; }
    return;
  }

  try {
    const { error } = await window._supabaseClient.auth.resetPasswordForEmail(email, {
      // Supabase redirigera vers cette URL après clic sur le lien
      // Changez par votre URL de production si déployé
      redirectTo: window.location.origin + window.location.pathname + "?reset=true",
    });

    if (error) {
      // Supabase retourne une erreur générique même si l'email n'existe pas
      // (sécurité : on ne révèle pas si l'email est enregistré)
      console.warn("resetPasswordForEmail:", error.message);

      // Si l'email n'est pas dans Supabase Auth, on informe gentiment
      if (error.message.toLowerCase().includes("user not found") ||
          error.message.toLowerCase().includes("invalid")) {
        showErr("forgotErr1", "Aucun compte Supabase Auth trouvé pour cet email. Essayez de vous reconnecter directement.");
        if (btn) { btn.disabled = false; btn.innerHTML = "<span>📤</span><span>Envoyer le lien</span>"; }
        return;
      }
    }

    // Succès (même si l'email n'existe pas, Supabase ne le révèle pas)
    if ($("forgotEmailSent")) $("forgotEmailSent").textContent = email;
    $("forgotStep1")?.classList.add("hidden");
    $("forgotStep2")?.classList.remove("hidden");
    $("btnForgotResend")?.classList.remove("hidden");

    toast("Email de réinitialisation envoyé 📧", "success");

  } catch (err) {
    console.error("sendForgotEmail:", err);
    showErr("forgotErr1", "Erreur réseau. Réessayez.");
    if (btn) { btn.disabled = false; btn.innerHTML = "<span>📤</span><span>Envoyer le lien</span>"; }
  } finally {
    if (btn && !$("forgotStep2")?.classList.contains("hidden")) {
      btn.disabled = false;
      btn.innerHTML = "<span>📤</span><span>Envoyer le lien</span>";
    }
  }
}

// ══════════════════════════════════════════════════
// GESTION DU RETOUR APRÈS RESET PASSWORD
// Supabase redirige vers ?reset=true avec un token dans le hash #
// ══════════════════════════════════════════════════
async function handlePasswordReset() {
  const hash = window.location.hash;
  if (!hash.includes("access_token")) return;

  // Nettoyer l'URL
  window.history.replaceState({}, document.title, window.location.pathname);

  // Rester sur l'écran de connexion (pas l'app)
  $("welcomeScreen")?.classList.add("hidden");
  $("loginScreen")?.classList.remove("hidden");

  // Attendre que Supabase récupère la session du hash
  await new Promise(r => setTimeout(r, 500));

  // Ouvrir une modale simple de reset par-dessus le login
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(10,15,30,0.85);backdrop-filter:blur(6px);
    display:flex;align-items:center;justify-content:center;padding:20px;
  `;

  overlay.innerHTML = `
    <div style="
      background:#fff;border-radius:20px;padding:32px;
      width:100%;max-width:420px;box-shadow:0 30px 80px rgba(0,0,0,.5);
    ">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;">
        <div style="
          width:52px;height:52px;border-radius:14px;
          background:linear-gradient(135deg,#dbeafe,#ede9fe);
          display:flex;align-items:center;justify-content:center;
          font-size:24px;border:1px solid #c4b5fd;flex-shrink:0;
        ">🔑</div>
        <div>
          <h3 style="font-size:18px;font-weight:800;color:#0f172a;margin-bottom:4px;">
            Nouveau mot de passe
          </h3>
          <p style="font-size:13px;color:#64748b;">
            Choisissez un mot de passe sécurisé
          </p>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px;">
          Nouveau mot de passe <span style="color:#64748b;font-weight:400;text-transform:none;">(min. 6 car.)</span>
        </label>
        <div style="position:relative;">
          <input type="password" id="resetPwd1" placeholder="Nouveau mot de passe..."
            style="width:100%;padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;color:#0f172a;outline:none;font-family:inherit;box-sizing:border-box;"
            oninput="this.style.borderColor='#2563eb'"
          >
        </div>
      </div>

      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px;">
          Confirmer le mot de passe
        </label>
        <div style="position:relative;">
          <input type="password" id="resetPwd2" placeholder="Confirmer..."
            style="width:100%;padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;color:#0f172a;outline:none;font-family:inherit;box-sizing:border-box;"
            oninput="this.style.borderColor='#2563eb'"
          >
        </div>
      </div>

      <p id="resetErr" style="font-size:12px;color:#ef4444;margin-bottom:12px;display:none;"></p>

      <button id="btnResetConfirm" style="
        width:100%;padding:13px;
        background:linear-gradient(135deg,#2563eb,#1d4ed8);
        color:#fff;border:none;border-radius:10px;
        font-size:14px;font-weight:700;cursor:pointer;
        font-family:inherit;display:flex;align-items:center;
        justify-content:center;gap:8px;
      ">
        <span>🔐</span><span>Enregistrer le mot de passe</span>
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  $("btnResetConfirm").addEventListener("click", async () => {
    const pwd1 = $("resetPwd1").value;
    const pwd2 = $("resetPwd2").value;
    const err  = $("resetErr");

    err.style.display = "none";

    if (pwd1.length < 6) {
      err.textContent = "❌ Minimum 6 caractères.";
      err.style.display = "block"; return;
    }
    if (pwd1 !== pwd2) {
      err.textContent = "❌ Les mots de passe ne correspondent pas.";
      err.style.display = "block"; return;
    }

    const btn = $("btnResetConfirm");
    btn.innerHTML = "<span>⏳</span><span>Enregistrement...</span>";
    btn.disabled = true;

    try {
      const { error } = await window._supabaseClient.auth.updateUser({ password: pwd1 });
      if (error) throw error;

      // Mettre à jour aussi dans la table admins locale
      const { data: { user } } = await window._supabaseClient.auth.getUser();
      if (user) {
        const idx = admins.findIndex(a => a.email.toLowerCase() === user.email.toLowerCase());
        if (idx !== -1) {
          admins[idx].passwordHash = await hashPassword(pwd1);
          DB.save("mit_admins", admins);
        }
      }

      overlay.innerHTML = `
        <div style="
          background:#fff;border-radius:20px;padding:40px 32px;
          width:100%;max-width:420px;text-align:center;
          box-shadow:0 30px 80px rgba(0,0,0,.5);
        ">
          <div style="font-size:52px;margin-bottom:16px;">✅</div>
          <h3 style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:8px;">
            Mot de passe mis à jour !
          </h3>
          <p style="font-size:14px;color:#64748b;margin-bottom:24px;">
            Reconnectez-vous avec votre nouveau mot de passe.
          </p>
          <button onclick="document.body.removeChild(this.closest('[style*=fixed]'))" style="
            padding:12px 28px;
            background:linear-gradient(135deg,#2563eb,#1d4ed8);
            color:#fff;border:none;border-radius:10px;
            font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;
          ">Se connecter →</button>
        </div>
      `;

    } catch (e) {
      err.textContent = "❌ " + e.message;
      err.style.display = "block";
      btn.innerHTML = "<span>🔐</span><span>Enregistrer le mot de passe</span>";
      btn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", handlePasswordReset);

// Lancer au chargement
document.addEventListener("DOMContentLoaded", handlePasswordReset);

function openResetPasswordModal() {
  // Réutilise la modale existante modalChangePwd en mode reset
  if ($("cpOld")) $("cpOld").closest(".fg").style.display = "none"; // cacher "ancien mdp"
  ["cpNew","cpConfirm"].forEach(id => { if($(id)) $(id).value = ""; });
  if ($("cpErr")) $("cpErr").textContent = "";

  // Modifier le bouton save pour le mode reset
  const btn = $("btnSaveChangePwd");
  if (btn) btn.dataset.mode = "reset";

  openModal("modalChangePwd");
  toast("Définissez votre nouveau mot de passe 🔑", "info");
}

// Patch btnSaveChangePwd pour gérer le mode reset
const _origSaveChangePwd = $("btnSaveChangePwd");
if (_origSaveChangePwd) {
  _origSaveChangePwd.addEventListener("click", async function() {
    if (this.dataset.mode !== "reset") return; // géré par le listener existant

    const nw   = $("cpNew")?.value;
    const conf = $("cpConfirm")?.value;
    if ($("cpErr")) $("cpErr").textContent = "";

    if (!nw || nw.length < 6) { if ($("cpErr")) $("cpErr").textContent = "❌ Minimum 6 caractères."; return; }
    if (nw !== conf)           { if ($("cpErr")) $("cpErr").textContent = "❌ Les mots de passe ne correspondent pas."; return; }

    try {
      const { error } = await window._supabaseClient.auth.updateUser({ password: nw });
      if (error) throw error;

      closeModal("modalChangePwd");
      this.dataset.mode = "";
      if ($("cpOld")) $("cpOld").closest(".fg").style.display = "";
      toast("Mot de passe mis à jour ✅ Reconnectez-vous.", "success");

    } catch (err) {
      if ($("cpErr")) $("cpErr").textContent = "❌ " + err.message;
    }
  });
}

// Lancer la détection au chargement de la page
document.addEventListener("DOMContentLoaded", handlePasswordReset);

// ══════════════════════════════════════════════════
// PATCH resetLoginForms — inclure les nouveaux champs
// REMPLACE la fonction resetLoginForms existante
// ══════════════════════════════════════════════════
function resetLoginForms() {
  loginFTarget = null;

  // Admin — connexion
  ["aEmail","aPwd","aNom","aNewPwdConfirm"].forEach(id => { if($(id)) $(id).value = ""; });
  ["aErrMain","aErrCreate","aErrRegister"].forEach(id => hideErr(id));

  // Admin — inscription
  ["rNom","rEmail","rPwd","rPwdConfirm"].forEach(id => { if($(id)) $(id).value = ""; });
  if ($("pwdStrengthWrap")) $("pwdStrengthWrap").style.display = "none";

  // Remettre le tab Connexion
  $("aFormLogin")?.classList.remove("hidden");
  $("aFormRegister")?.classList.add("hidden");
  $("aFormCreate")?.classList.add("hidden");
  $("tabLogin")?.classList.add("active");
  $("tabRegister")?.classList.remove("active");

  // Fonctionnaire
  ["fEmail","fLoginPwd","fCode","fNewPwd"].forEach(id => { if($(id)) $(id).value = ""; });
  ["fErrMain","fErrCode","fErrPwd"].forEach(id => hideErr(id));
  $("fFormMain")?.classList.remove("hidden");
  $("fFormCode")?.classList.add("hidden");
  $("fFormPwd")?.classList.add("hidden");
}

console.log("✅ MissionIT v3.2 — Prêt");
/* ═══════════════════════════════════════════════════
   MissionIT — Gestion du mode sombre
   - Applique le thème mémorisé AVANT le rendu (anti-flash)
   - Toggle accessible depuis la topbar
   - Persistance via localStorage
═══════════════════════════════════════════════════ */
(function () {
  const STORAGE_KEY = "mit_theme"; // "light" | "dark"

  // ── Appliquer le thème immédiatement (appelé en haut du <head>) ──
  function applyStoredTheme() {
    let theme = "light";
    try {
      theme = localStorage.getItem(STORAGE_KEY) || "light";
    } catch (e) { /* localStorage indisponible */ }
    document.documentElement.setAttribute("data-theme", theme);
    return theme;
  }

  // Exécution immédiate, dès le parsing du script (placé dans <head>)
  applyStoredTheme();

  // ── API exposée pour le reste de l'app ──
  window.MitTheme = {
    get() {
      return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    },
    set(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
      window.dispatchEvent(new CustomEvent("mit-theme-change", { detail: { theme } }));
      syncToggleButtons(theme);
    },
    toggle() {
      const next = window.MitTheme.get() === "dark" ? "light" : "dark";
      window.MitTheme.set(next);
      return next;
    }
  };

  function syncToggleButtons(theme) {
    document.querySelectorAll(".btn-theme-toggle").forEach(btn => {
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      btn.title = theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre";
    });
  }

  // ── Brancher le(s) bouton(s) une fois le DOM prêt ──
  document.addEventListener("DOMContentLoaded", () => {
    syncToggleButtons(window.MitTheme.get());
    document.querySelectorAll(".btn-theme-toggle").forEach(btn => {
      btn.addEventListener("click", () => window.MitTheme.toggle());
    });
  });
})();
