// =====================================================
// supabase-db.js  —  MissionIT v3.2
// =====================================================

const SupaDB = (() => {
  const db = () => window._supabaseClient;

  // ─── upsert helper (INSERT → UPDATE on duplicate pk) ─
  async function upsertRow(table, row) {
    if (!window.supabaseReady || !db()) return;

    const { error: ie } = await db().from(table).insert(row);
    if (!ie) return; // inserted OK

    if (ie.code === "23505") {
      // duplicate key → update
      const patch = { ...row };
      delete patch.id;
      const { error: ue } = await db().from(table).update(patch).eq("id", row.id);
      if (ue) console.error(`[SupaDB] ${table} UPDATE:`, ue.message, ue.details || "", ue.hint || "");
    } else {
      console.error(`[SupaDB] ${table} INSERT:`, ie.message, ie.details || "", ie.hint || "");
    }
  }

  // ══════════════════════════════════════════════
  // MAPPERS
  // ══════════════════════════════════════════════
  const mapAdmin = r => !r ? null : ({
    id: String(r.id), nom: r.nom, email: r.email,
    passwordHash: r.password_hash, createdAt: r.created_at,
  });

  const mapFonct = r => !r ? null : ({
    id: String(r.id), nom: r.nom, email: r.email,
    tel: r.tel || "", dept: r.dept || "",
    adminId: String(r.admin_id),
    inviteCode: r.invite_code || null,
    passwordHash: r.password_hash || null,
    activated: r.activated || false,
    suspended: r.suspended || false,
    date: r.date || "",
  });

  const mapMission = r => !r ? null : ({
    id: String(r.id), title: r.title,
    description: r.description || "",
    image: r.image || null,
    adminId: String(r.admin_id),
    assignMode: r.assign_mode || "open",
    assignedToId:   r.assigned_to_id   ? String(r.assigned_to_id)   : null,
    assignedToName: r.assigned_to_name || null,
    reservedBy:     r.reserved_by      ? String(r.reserved_by)      : null,
    reservedByName: r.reserved_by_name || null,
    status:   r.status   || "open",
    priority: r.priority || "normal",
    tags:     r.tags     || [],
    deadline:       r.deadline       || null,
    createdAt:      r.created_at     || "",
    startedAt:      r.started_at     || null,
    completedAt:    r.completed_at   || null,
    validatedAt:    r.validated_at   || null,
    rejectedAt:     r.rejected_at    || null,
    processingDays: r.processing_days != null ? r.processing_days : null,
    updatedAt:      r.updated_at     || null,
  });

  const mapMsg = r => !r ? null : ({
    id: String(r.id), text: r.text || "",
    author: r.author, senderId: String(r.sender_id),
    senderRole: r.sender_role || "", time: r.time || "",
    fileData: r.file_data || null, fileName: r.file_name || null,
    isImage: r.is_image || false,
  });

  const mapPriv = r => !r ? null : ({
    id: String(r.id), text: r.text || "",
    author: r.author, senderId: String(r.sender_id),
    time: r.time || "", read: r.read || false,
    fileData: r.file_data || null, fileName: r.file_name || null,
    isImage: r.is_image || false,
  });

  const mapNotif = r => !r ? null : ({
    id: String(r.id), msg: r.message,
    type: r.type || "info", read: r.is_read || false,
    time: r.created_ts ? new Date(r.created_ts).toLocaleDateString("fr-FR") : "",
  });

  // ══════════════════════════════════════════════
  // ADMINS
  // ══════════════════════════════════════════════
  async function saveAdmin(admin) {
    await upsertRow("admins", {
      id:            String(admin.id),
      nom:           admin.nom,
      email:         admin.email.toLowerCase(),
      password_hash: admin.passwordHash,
      created_at:    admin.createdAt || null,
    });
  }

  async function findAdminByEmail(email) {
    const { data, error } = await db().from("admins").select("*")
      .eq("email", email.toLowerCase()).maybeSingle();
    if (error) { console.error("[SupaDB] findAdminByEmail:", error.message); return null; }
    return mapAdmin(data);
  }

  async function loadAdmins() {
    const { data, error } = await db().from("admins").select("*");
    if (error) { console.error("[SupaDB] loadAdmins:", error.message); return []; }
    return (data || []).map(mapAdmin);
  }

  // ══════════════════════════════════════════════
  // FONCTIONNAIRES
  // ══════════════════════════════════════════════
  async function saveFonctionnaire(f) {
    await upsertRow("fonctionnaires", {
      id:            String(f.id),
      nom:           f.nom,
      email:         f.email.toLowerCase(),
      tel:           f.tel          || null,
      dept:          f.dept         || null,
      admin_id:      String(f.adminId),
      invite_code:   f.inviteCode   || null,
      password_hash: f.passwordHash || null,
      activated:     f.activated    || false,
      suspended:     f.suspended    || false,
      date:          f.date         || null,
    });
  }

  async function findFonctionnaireByEmail(email) {
    const { data, error } = await db().from("fonctionnaires").select("*")
      .eq("email", email.toLowerCase()).maybeSingle();
    if (error) { console.error("[SupaDB] findFonctionnaireByEmail:", error.message); return null; }
    return mapFonct(data);
  }

  async function loadFonctionnaires(adminId) {
    const { data, error } = await db().from("fonctionnaires").select("*")
      .eq("admin_id", String(adminId));
    if (error) { console.error("[SupaDB] loadFonctionnaires:", error.message); return []; }
    return (data || []).map(mapFonct);
  }

  async function deleteFonctionnaire(id) {
    const { error } = await db().from("fonctionnaires").delete().eq("id", String(id));
    if (error) console.error("[SupaDB] deleteFonctionnaire:", error.message);
  }

  // ══════════════════════════════════════════════
  // MISSIONS
  // ══════════════════════════════════════════════
  async function saveMission(m) {
    // blob: URLs are local-only — never store in Supabase
    const img = m.image && !m.image.startsWith("blob:") ? m.image : null;
    await upsertRow("missions", {
      id:               String(m.id),
      title:            m.title,
      description:      m.description       || null,
      image:            img,
      admin_id:         String(m.adminId),
      assign_mode:      m.assignMode        || "open",
      assigned_to_id:   m.assignedToId      ? String(m.assignedToId) : null,
      assigned_to_name: m.assignedToName    || null,
      reserved_by:      m.reservedBy        ? String(m.reservedBy)   : null,
      reserved_by_name: m.reservedByName    || null,
      status:           m.status            || "open",
      priority:         m.priority          || "normal",
      tags:             m.tags              || [],
      deadline:         m.deadline          || null,
      created_at:       m.createdAt         || null,
      started_at:       m.startedAt         || null,
      completed_at:     m.completedAt       || null,
      validated_at:     m.validatedAt       || null,
      rejected_at:      m.rejectedAt        || null,
      processing_days:  m.processingDays != null ? m.processingDays : null,
      updated_at:       m.updatedAt         || null,
    });
  }

  async function loadMissions(adminId) {
    const { data, error } = await db().from("missions").select("*")
      .eq("admin_id", String(adminId)).order("created_ts", { ascending: false });
    if (error) { console.error("[SupaDB] loadMissions:", error.message); return []; }
    return (data || []).map(mapMission);
  }

  async function deleteMission(id) {
    const { error } = await db().from("missions").delete().eq("id", String(id));
    if (error) console.error("[SupaDB] deleteMission:", error.message);
  }

  // ══════════════════════════════════════════════
  // MESSAGES PUBLICS
  // ══════════════════════════════════════════════
  async function saveOneMessage(m) {
    await upsertRow("messages", {
      id:          String(m.id),
      text:        m.text        || null,
      author:      m.author,
      sender_id:   String(m.senderId),
      sender_role: m.senderRole  || null,
      time:        m.time        || null,
      file_data:   m.fileData && !m.fileData.startsWith("blob:") ? m.fileData : null,
      file_name:   m.fileName    || null,
      is_image:    m.isImage     || false,
    });
  }

  // Called with the full array — only saves the last (new) message
  async function saveMessages(msgs) {
    if (!msgs || !msgs.length) return;
    await saveOneMessage(msgs[msgs.length - 1]);
  }

  async function loadMessages() {
    const { data, error } = await db().from("messages").select("*")
      .order("created_ts", { ascending: true }).limit(200);
    if (error) { console.error("[SupaDB] loadMessages:", error.message); return []; }
    return (data || []).map(mapMsg);
  }

  // ══════════════════════════════════════════════
  // MESSAGES PRIVÉS
  // ══════════════════════════════════════════════
  async function savePrivateChats(privateChats) {
    if (!privateChats) return;
    for (const [convKey, msgs] of Object.entries(privateChats)) {
      if (!msgs || !msgs.length) continue;
      const [a, b] = convKey.split("__");
      const last = msgs[msgs.length - 1];
      await upsertRow("private_messages", {
        id:            String(last.id),
        conv_key:      convKey,
        participant_a: a,
        participant_b: b,
        text:          last.text     || null,
        author:        last.author,
        sender_id:     String(last.senderId),
        time:          last.time     || null,
        read:          last.read     || false,
        file_data:     last.fileData && !last.fileData.startsWith("blob:") ? last.fileData : null,
        file_name:     last.fileName || null,
        is_image:      last.isImage  || false,
      });
    }
  }

  async function loadPrivateChats(userId) {
    const { data, error } = await db().from("private_messages").select("*")
      .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
      .order("created_ts", { ascending: true });
    if (error) { console.error("[SupaDB] loadPrivateChats:", error.message); return {}; }
    const result = {};
    for (const row of (data || [])) {
      if (!result[row.conv_key]) result[row.conv_key] = [];
      result[row.conv_key].push(mapPriv(row));
    }
    return result;
  }

  // ══════════════════════════════════════════════
  // NOTIFICATIONS
  // ══════════════════════════════════════════════
  async function saveNotifications(notifs) {
    if (!notifs || !notifs.length) return;
    const n = notifs[0];
    await upsertRow("notifications", {
      id: String(n.id), message: n.msg,
      type: n.type || "info", is_read: n.read || false, user_id: null,
    });
  }

  async function loadNotifications() {
    const { data, error } = await db().from("notifications").select("*")
      .order("created_ts", { ascending: false }).limit(60);
    if (error) { console.error("[SupaDB] loadNotifications:", error.message); return []; }
    return (data || []).map(mapNotif);
  }

  // ══════════════════════════════════════════════
  // CHARGEMENT COMPLET AU LOGIN
  // ══════════════════════════════════════════════
  async function loadAllForUser(role, userId, adminId) {
    const eAdminId = String(adminId);
    const eChatId  = role === "admin" ? `admin_${String(userId)}` : String(userId);

    const [foncts, missionsArr, msgs, privChats, notifs, adminsArr] = await Promise.all([
      loadFonctionnaires(eAdminId),
      loadMissions(eAdminId),
      loadMessages(),
      loadPrivateChats(eChatId),
      loadNotifications(),
      loadAdmins(),
    ]);

    return { admins: adminsArr, fonctionnaires: foncts, missions: missionsArr,
             messages: msgs, privateChats: privChats, notifications: notifs };
  }

  // ══════════════════════════════════════════════
  // REALTIME
  // ══════════════════════════════════════════════
  let _ch = null;
  function initRealtime() {
    if (!window.supabaseReady) return;
    if (_ch) db().removeChannel(_ch);
    const reload = () => typeof window.reloadFromSupabase === "function" && window.reloadFromSupabase();
    _ch = db().channel("missionit-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "missions" },        reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" },        reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "private_messages"}, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "fonctionnaires" },  reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "admins" },          reload)
      .subscribe(s => {
        if (s === "SUBSCRIBED")    console.log("✅ Realtime actif");
        if (s === "CHANNEL_ERROR") setTimeout(initRealtime, 5000);
      });
  }

  return {
    saveAdmin, findAdminByEmail, loadAdmins,
    saveFonctionnaire, findFonctionnaireByEmail, loadFonctionnaires, deleteFonctionnaire,
    saveMission, loadMissions, deleteMission,
    saveMessages, loadMessages,
    savePrivateChats, loadPrivateChats,
    saveNotifications, loadNotifications,
    loadAllForUser, initRealtime,
  };
})();

window.initRealtime = () => SupaDB.initRealtime();
