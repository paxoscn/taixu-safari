/* ==========================================================================
   Taixu Safari — client state, HTTP host API and the field-journal UI.
   ========================================================================== */

import { createSafariScene, SPECIES_META } from "./scene.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE_KEY = "taixu_safari_session";

const ITEM_ICONS = {
  film: "🎞️",
  snack: "🥕",
  vintage_map: "🗺️",
  wetland_binoculars: "🔭",
};

const SPECIES_EMOJI = {
  lion: "🦁",
  giraffe: "🦒",
  zebra: "🦓",
  rhino: "🦏",
  elephant: "🐘",
  flamingo: "🦩",
  hippo: "🦛",
};

const SKIN_ICONS = {
  character: "🎩",
  frame: "🖼️",
  badge: "🏅",
  avatar: "🧑‍🌾",
  weapon: "📷",
  background: "🏞️",
  emote: "💬",
};

const RARITY_LABEL = {
  common: "普通",
  uncommon: "罕见",
  rare: "稀有",
  epic: "史诗",
  legendary: "传说",
  mythic: "神话",
};

const STATUS_LABEL = {
  open: "开放",
  maintenance: "维护中",
  closed: "关闭",
};

const TASK_STATUS_ORDER = {
  completed: 0,
  active: 1,
  available: 2,
  expired: 3,
  locked: 4,
  claimed: 5,
};

const REGION_NAMES = {
  savanna: "金合欢草原",
  wetland: "湿地河谷",
};

const GUIDE_PROMPTS = ["你好", "给我礼物", "今天该拍什么？", "任务", "阿宝", "图鉴"];

const METRIC_LABEL = {
  photos: "拍摄照片",
  feeds: "投喂动物",
  species_photos: "发现新物种",
};

const PANELS = {
  tasks: { eyebrow: "FIELD NOTES", title: "巡护任务" },
  album: { eyebrow: "SIGHTING ALBUM", title: "动物图鉴" },
  shop: { eyebrow: "CAMP SUPPLY", title: "营地补给" },
  social: { eyebrow: "RADIO ROOM", title: "营地电台" },
  guide: { eyebrow: "PARK GUIDE", title: "向导对话" },
  ranking: { eyebrow: "SEASON BOARD", title: "园区排行" },
  news: { eyebrow: "NOTICE BOARD", title: "园区公告" },
  profile: { eyebrow: "RANGER FILE", title: "巡护员档案" },
};

const state = {
  accountId: null,
  snapshot: null,
  panel: null,
  pending: false,
  socialTab: "friends",
  rankingTab: null,
  loginRegion: "savanna",
  photoCache: {},
  safari: null,
  lastNearest: null,
};

// ---------------------------------------------------------------------------
// Tiny DOM helpers
// ---------------------------------------------------------------------------

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pct(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatTime(ms) {
  if (!ms) return "";
  const date = new Date(ms);
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function remainingLabel(ms) {
  const delta = Math.max(0, ms - Date.now());
  if (delta <= 0) return "已到期";
  const minutes = Math.floor(delta / 60000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}

function countdownSpan(ms) {
  if (!ms) return "";
  return `<span class="countdown" data-until="${ms}">${remainingLabel(ms)}</span>`;
}

function itemName(id) {
  return state.snapshot?.items?.find((item) => item.id === id)?.name || id;
}

function skinName(id) {
  return state.snapshot?.skins?.catalog?.find((skin) => skin.id === id)?.name || id;
}

function skinDef(id) {
  return state.snapshot?.skins?.catalog?.find((skin) => skin.id === id);
}

function achievementName(id) {
  return (
    state.snapshot?.achievements?.find((achievement) => achievement.id === id)?.name ||
    state.snapshot?.achievements?.find((achievement) => achievement.id === id)?.name ||
    id
  );
}

function taskName(id) {
  return state.snapshot?.tasks?.find((task) => task.id === id)?.name || id;
}

function playerName(id) {
  return (
    state.snapshot?.social?.people?.find((person) => person.id === id)?.name || id
  );
}

function npcName(id) {
  return state.snapshot?.npcs?.find((npc) => npc.id === id)?.name || id;
}

function itemIcon(id) {
  if (ITEM_ICONS[id]) return ITEM_ICONS[id];
  if (id.startsWith("photo_")) {
    return SPECIES_EMOJI[id.replace("photo_", "")] || "📷";
  }
  return "📦";
}

function photoSpeciesForItem(id) {
  if (!id.startsWith("photo_")) return null;
  return id.replace("photo_", "");
}

function invCount(id) {
  const slots = state.snapshot?.inventory?.slots || [];
  return slots.reduce((sum, slot) => (slot?.item === id ? sum + slot.quantity : sum), 0);
}

function coins() {
  return state.snapshot?.wallet?.currencies?.coins || 0;
}

function battery() {
  return state.snapshot?.wallet?.resources?.battery || 0;
}

function ownedSkins() {
  return new Set(state.snapshot?.skins?.owned?.owned || []);
}

function equippedSkins() {
  return state.snapshot?.skins?.owned?.equipped || {};
}

function currentRegion() {
  return state.snapshot?.account?.region || "savanna";
}

function currentNpc() {
  return state.snapshot?.npcs?.[0] || null;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function post(path, payload = {}) {
  const body = { ...payload };
  if (state.accountId && body.account_id === undefined) {
    body.account_id = state.accountId;
  }
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error("服务器返回了无法解析的数据");
  }
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error?.message || `请求失败 (${response.status})`);
    error.code = data?.error?.code;
    throw error;
  }
  if (data.state) applyState(data.state);
  return data;
}

async function get(path) {
  const response = await fetch(path);
  const data = await response.json();
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error?.message || "请求失败");
  }
  return data;
}

// ---------------------------------------------------------------------------
// Scene bootstrap
// ---------------------------------------------------------------------------

state.safari = createSafariSceneSafely();

function createSafariSceneSafely() {
  const canvas = $("#world");
  try {
    return createSafariScene({
      canvas,
      onNearest: (animal) => updateInteract(animal),
      onInteract: (action, animal) => handleInteract(action, animal),
      onReady: () => hideBoot(),
    });
  } catch (error) {
    console.error("3D scene failed to start", error);
    toast("3D 场景启动失败，游戏界面仍然可用", "error", 6000);
    return {
      setRegion() {},
      setActive() {},
      setHat() {},
      setAvatar() {},
      setLabelVisibility() {},
      triggerInteract() {},
      flash() {},
      capture() {
        return null;
      },
      celebrate() {},
      region: "savanna",
      nearest: null,
    };
  }
}

const safari = state.safari;

// ---------------------------------------------------------------------------
// State → HUD
// ---------------------------------------------------------------------------

function applyState(snapshot) {
  const previousRegion = state.snapshot?.account?.region;
  state.snapshot = snapshot;
  state.accountId = snapshot.account.id;

  if (previousRegion !== snapshot.account.region || safari.region !== snapshot.account.region) {
    safari.setRegion(snapshot.account.region);
  }

  const equipped = equippedSkins();
  const hat = equipped.character === "explorer_hat";
  safari.setHat(hat);
  safari.setAvatar(snapshot.account.avatar.image || "🧑‍🌾");

  const frameSkin = equipped.frame;
  document.documentElement.style.setProperty(
    "--frame",
    frameSkin === "safari_frame" ? "#d79a43" : "rgba(231, 178, 92, 0.45)",
  );

  updateHud();
  updateTicker();
  updateBadges();
  updateActionButtons();
  if (state.panel && ["tasks", "album", "shop", "ranking", "news"].includes(state.panel)) {
    renderPanel();
  }
}

function updateHud() {
  const snapshot = state.snapshot;
  if (!snapshot) return;

  $("#stat-coins").textContent = formatNumber(coins());
  $("#stat-film").textContent = formatNumber(invCount("film"));
  $("#stat-snack").textContent = formatNumber(invCount("snack"));
  $("#stat-battery").textContent = formatNumber(battery());
  $("#battery-fill").style.width = `${Math.min(100, battery())}%`;

  const avatar = snapshot.account.avatar;
  $("#avatar-face").textContent = avatar.image || "🧑‍🌾";
  $("#profile-name").textContent = snapshot.account.display_name;
  $("#profile-level").textContent = `Lv.${snapshot.account.level}`;
  $("#profile").title = "";

  const region = snapshot.regions.find((item) => item.id === snapshot.account.region);
  $("#park-name").textContent = region?.name || REGION_NAMES[snapshot.account.region] || "园区";
  const dot = $(".park-dot");
  dot.className = "park-dot";
  if (region && region.status !== "open") dot.classList.add(region.status);

  if (snapshot.unread_announcements > 0) {
    $("#badge-news").textContent = snapshot.unread_announcements;
    $("#badge-news").classList.add("show");
  } else {
    $("#badge-news").classList.remove("show");
  }
}

function updateTicker() {
  const items = state.snapshot?.announcements || [];
  const ticker = $("#ann-ticker");
  if (!items.length) {
    ticker.classList.add("hidden");
    return;
  }
  const firstUnread = items.find((item) => !item.read) || items[0];
  const announcement = firstUnread.announcement;
  $("#ticker-text").textContent = `${announcement.title} — ${announcement.body}`;
  ticker.classList.remove("hidden");
}

function updateBadges() {
  const snapshot = state.snapshot;
  if (!snapshot) return;

  const claimableTasks = snapshot.tasks.filter((task) => task.status === "completed").length;
  const tasksBadge = $("#badge-tasks");
  tasksBadge.textContent = claimableTasks;
  tasksBadge.classList.toggle("show", claimableTasks > 0);

  const claimableAchievements = snapshot.achievements.filter(
    (achievement) => achievement.completed && !achievement.claimed,
  ).length;
  const claimableMilestones = snapshot.collection.progress.milestones.filter(
    (milestone) => milestone.unlocked && !milestone.claimed,
  ).length;
  const albumBadge = $("#badge-album");
  const albumCount = claimableAchievements + claimableMilestones;
  albumBadge.textContent = albumCount;
  albumBadge.classList.toggle("show", albumCount > 0);

  const requests = snapshot.social.incoming.length;
  const socialBadge = $("#badge-social");
  socialBadge.textContent = requests;
  socialBadge.classList.toggle("show", requests > 0);

  const newsBadge = $("#badge-news");
  newsBadge.textContent = snapshot.unread_announcements;
  newsBadge.classList.toggle("show", snapshot.unread_announcements > 0);
}

function updateActionButtons() {
  const film = invCount("film");
  const snack = invCount("snack");
  const power = battery();
  const photoBtn = $("#btn-photo");
  const feedBtn = $("#btn-feed");
  const touchPhoto = $("#touch-photo");
  const touchFeed = $("#touch-feed");

  const photoBlocked = state.pending || film < 1 || power < 5;
  const feedBlocked = state.pending || snack < 1;
  photoBtn.disabled = photoBlocked;
  feedBtn.disabled = feedBlocked;
  if (touchPhoto) touchPhoto.disabled = photoBlocked;
  if (touchFeed) touchFeed.disabled = feedBlocked;

  $("#btn-photo").title =
    film < 1
      ? "没有胶片了，去营地补给站购买"
      : power < 5
        ? "相机没电了，等它恢复或购买备用电池"
        : "拍照 (E)";
  $("#btn-feed").title = snack < 1 ? "没有动物零食了" : "投喂 (F)";
}

// ---------------------------------------------------------------------------
// Interaction prompt
// ---------------------------------------------------------------------------

function updateInteract(animal) {
  state.lastNearest = animal;
  const el = $("#interact");
  if (!animal) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  $("#interact-name").textContent = animal.name;
  const rarity = RARITY_LABEL[animal.rarity] || animal.rarity;
  $("#interact-meta").textContent = `${rarity} · ${animal.score} 摄影积分`;
  const dot = $("#interact-rarity");
  dot.className = "rarity-dot";
  if (animal.rarity !== "common" && animal.rarity !== "uncommon") {
    dot.classList.add(animal.rarity);
  }
  updateActionButtons();
}

async function handleInteract(action, animal) {
  if (!animal) {
    toast("再靠近动物一点吧", "error");
    return;
  }
  if (state.pending) return;
  state.pending = true;
  updateActionButtons();

  try {
    if (action === "photo") {
      const data = await post("/api/photo", { species: animal.species });
      const result = data.result;
      safari.flash();
      fireFlash();
      window.setTimeout(() => {
        const shot = safari.capture();
        if (shot) state.photoCache[animal.species] = shot;
        if (state.panel === "album") renderPanel();
      }, 90);
      safari.celebrate(animal.id, `+${result.coins} 🪙`);
      toast(`拍到${result.species_name}！+${result.score} 摄影积分 +${result.coins} 金币`, "gold");
      if (result.new_species) toast("新物种已收入图鉴", "gold");
      announceOutcomes(result);
      renderAfterAction(["album", "tasks", "ranking"]);
    } else {
      const data = await post("/api/feed", { species: animal.species });
      const result = data.result;
      safari.celebrate(animal.id, "+6 🪙");
      toast(`${result.fed}吃得很开心。+6 金币`, "success");
      announceOutcomes(result);
      renderAfterAction(["tasks", "ranking"]);
    }
  } catch (error) {
    toast(error.message, "error");
  } finally {
    state.pending = false;
    updateActionButtons();
  }
}

function fireFlash() {
  const flash = $("#flash");
  flash.classList.remove("fire");
  void flash.offsetWidth;
  flash.classList.add("fire");
}

function announceOutcomes(result) {
  for (const id of result.achievements || []) {
    toast(`🏆 成就解锁：${achievementName(id)}`, "gold", 4200);
  }
  for (const id of result.tasks || []) {
    toast(`✅ 任务完成：${taskName(id)}，记得领取奖励`, "success", 4200);
  }
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

function toast(message, kind = "", duration = 3200) {
  const container = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`.trim();
  const icon = kind === "error" ? "⚠️" : kind === "gold" ? "🏆" : "🌿";
  el.innerHTML = `<span class="t-ico">${icon}</span><span>${esc(message)}</span>`;
  container.appendChild(el);
  while (container.children.length > 4) {
    container.firstElementChild.remove();
  }
  window.setTimeout(() => {
    el.classList.add("out");
    window.setTimeout(() => el.remove(), 320);
  }, duration);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

const loginNameInput = $("#login-name");
const loginBtn = $("#login-btn");

$("#region-picker")?.addEventListener("click", (event) => {
  const card = event.target.closest(".region-card");
  if (!card) return;
  state.loginRegion = card.dataset.region;
  $$(".region-card").forEach((item) => item.classList.toggle("selected", item === card));
});

loginNameInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") doLogin();
});
loginBtn?.addEventListener("click", () => doLogin());

async function doLogin() {
  const name = loginNameInput.value.trim();
  if (!name) {
    toast("先给自己起个名字吧", "error");
    loginNameInput.focus();
    return;
  }
  if (!state.accountId) {
    state.accountId = `ranger_${randomId()}`;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = "正在穿过大门…";
  try {
    const data = await post("/api/login", {
      account_id: state.accountId,
      name,
      region: state.loginRegion,
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: state.accountId,
        name,
        region: state.snapshot?.account?.region || state.loginRegion,
      }),
    );
    $("#login").classList.add("hidden");
    safari.setActive(true);
    safari.setRegion(data.state.account.region);
    toast(`欢迎回到${REGION_NAMES[data.state.account.region] || "园区"}，${name}`, "success", 3800);
    if (data.result.first_login) {
      window.setTimeout(() => openPanel("tasks"), 900);
      window.setTimeout(() => toast("先按 E 拍下第一张动物照片吧", "", 5000), 1800);
    }
  } catch (error) {
    toast(error.message, "error", 5000);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "进入园区";
  }
}

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  return Math.random().toString(36).slice(2, 12);
}

function restoreSession() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    saved = null;
  }
  if (!saved?.id) {
    loginNameInput.value = `巡护员${Math.floor(100 + Math.random() * 900)}`;
    return;
  }
  state.accountId = saved.id;
  state.loginRegion = saved.region || "savanna";
  loginNameInput.value = saved.name || "巡护员";
  $$(".region-card").forEach((card) =>
    card.classList.toggle("selected", card.dataset.region === state.loginRegion),
  );
  doLogin();
}

// ---------------------------------------------------------------------------
// Panel shell
// ---------------------------------------------------------------------------

const drawer = $("#drawer");
const drawerBody = $("#drawer-body");

function openPanel(name) {
  if (!PANELS[name]) return;
  state.panel = name;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  $("#drawer-title").textContent = PANELS[name].title;
  $("#drawer-eyebrow").textContent = PANELS[name].eyebrow;
  $$(".dock-btn").forEach((button) =>
    button.classList.toggle("active", button.dataset.open === name),
  );
  renderPanel();
}

function closePanel() {
  state.panel = null;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  $$(".dock-btn").forEach((button) => button.classList.remove("active"));
}

function renderAfterAction(panels) {
  if (state.panel && panels.includes(state.panel)) renderPanel();
}

function renderPanel() {
  if (!state.snapshot || !state.panel) return;
  switch (state.panel) {
    case "tasks":
      renderTasks();
      break;
    case "album":
      renderAlbum();
      break;
    case "shop":
      renderShop();
      break;
    case "social":
      renderSocial();
      break;
    case "guide":
      renderGuide();
      break;
    case "ranking":
      renderRanking();
      break;
    case "news":
      renderNews();
      break;
    case "profile":
      renderProfile();
      break;
    default:
      drawerBody.innerHTML = "";
  }
  if (state.panel === "social" || state.panel === "guide") {
    scheduleChatLoads();
  }
}

$$("[data-open]").forEach((button) => {
  button.addEventListener("click", () => {
    const name = button.dataset.open;
    if (state.panel === name && name !== "profile") closePanel();
    else openPanel(name);
  });
});

$("#drawer-close")?.addEventListener("click", closePanel);
$("#ann-ticker")?.addEventListener("click", () => openPanel("news"));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.panel) closePanel();
});

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function chipsForReward(reward) {
  if (!reward) return "";
  const chips = [];
  for (const grant of reward.currencies || []) {
    chips.push(
      `<span class="reward-chip">${grant.currency === "coins" ? "🪙" : "💎"} ${formatNumber(grant.amount)} ${grant.currency === "coins" ? "金币" : esc(grant.currency)}</span>`,
    );
  }
  for (const grant of reward.resources || []) {
    chips.push(
      `<span class="reward-chip">${grant.resource === "battery" ? "🔋" : "⚡"} ${formatNumber(grant.amount)} ${grant.resource === "battery" ? "电量" : esc(grant.resource)}</span>`,
    );
  }
  for (const grant of reward.items || []) {
    chips.push(
      `<span class="reward-chip">${itemIcon(grant.item)} ${esc(itemName(grant.item))} ×${grant.quantity}</span>`,
    );
  }
  for (const skin of reward.skins || []) {
    chips.push(`<span class="reward-chip">🎩 ${esc(skinName(skin))}</span>`);
  }
  if (reward.xp) {
    chips.push(`<span class="reward-chip">✨ ${formatNumber(reward.xp)} XP</span>`);
  }
  return chips.join("");
}

function chipsForCost(cost) {
  if (!cost) return "";
  const chips = [];
  for (const grant of cost.currencies || []) {
    chips.push(
      `<span class="cost-chip">${grant.currency === "coins" ? "🪙" : "💎"} ${formatNumber(grant.amount)}</span>`,
    );
  }
  for (const grant of cost.resources || []) {
    chips.push(
      `<span class="cost-chip">${grant.resource === "battery" ? "🔋" : "⚡"} ${formatNumber(grant.amount)}</span>`,
    );
  }
  return chips.join("");
}

function objectiveLabel(objective) {
  switch (objective.type) {
    case "metric":
      return METRIC_LABEL[objective.metric] || objective.metric;
    case "item":
      return `持有 ${itemName(objective.item)}`;
    case "skin":
      return `拥有并佩戴 ${skinName(objective.skin)}`;
    case "achievement":
      return `解锁成就「${achievementName(objective.achievement)}」`;
    default:
      return objective.type;
  }
}

function panelSection(label) {
  return `<div class="section-label">${esc(label)}</div>`;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function renderTasks() {
  const tasks = [...state.snapshot.tasks].sort((a, b) => {
    const order = TASK_STATUS_ORDER[a.status] ?? 9;
    const other = TASK_STATUS_ORDER[b.status] ?? 9;
    if (order !== other) return order - other;
    return a.name.localeCompare(b.name, "zh-CN");
  });

  const claimable = tasks.filter((task) => task.status === "completed").length;
  const header = `
    <p class="lede">
      ${claimable ? `有 <b>${claimable}</b> 项任务可以领取奖励。` : "每天都有新的巡护任务。接受之后，拍照和投喂才会推进进度。"}
      任务、成就与图鉴都由同一个 <code>record_event</code> 计数驱动。
    </p>
  `;

  const cards = tasks
    .map((task) => {
      const locked =
        task.status === "locked" || task.status === "expired" ? `<div class="task-lock-note">${lockNote(task)}</div>` : "";
      const repeat = task.repeat?.kind === "cooldown" ? `<span class="chip">每日/冷却 ${Math.round((task.repeat.duration_ms || 0) / 3600000)}h</span>` : "";
      const timeLimit =
        task.expires_at_ms && (task.status === "active" || task.status === "completed")
          ? `<span class="chip gold">剩余 ${countdownSpan(task.expires_at_ms)}</span>`
          : "";
      const next =
        task.status === "claimed" && task.next_available_at_ms
          ? `<span class="chip">下次可用 ${countdownSpan(task.next_available_at_ms)}</span>`
          : "";
      const objectives = task.objectives
        .map(
          (objective) => `
            <div class="objective">
              <span>${esc(objectiveLabel(objective.objective))}</span>
              <b>${Math.min(objective.progress, objective.target)} / ${objective.target}</b>
              <div class="bar ${objective.complete ? "gold" : ""}"><i style="width:${pct(objective.progress, objective.target)}%"></i></div>
            </div>
          `,
        )
        .join("");
      const actions = taskActions(task);
      const classes = [
        "task-card",
        task.status === "completed" ? "completed" : "",
        task.status === "claimed" ? "claimed" : "",
        task.status === "locked" ? "locked" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <div class="${classes}">
          <div class="task-head">
            <div>
              <h3 class="task-title">${esc(task.name)}</h3>
              <p class="task-sub">${esc(task.description || "")}</p>
            </div>
            <span class="chip ${task.status === "completed" ? "gold" : task.status === "active" ? "green" : ""}">${taskStatusLabel(task.status)}</span>
          </div>
          <div class="task-meta">
            <span class="chip">${categoryLabel(task.category)}</span>
            ${repeat}
            ${timeLimit}
            ${next}
            ${task.min_level ? `<span class="chip">Lv.${task.min_level}</span>` : ""}
          </div>
          <div class="objectives">${objectives}</div>
          ${locked}
          <div class="reward-row">${chipsForReward(task.reward)}</div>
          <div class="task-actions">${actions}</div>
        </div>
      `;
    })
    .join("");

  drawerBody.innerHTML = header + `<div class="stack">${cards}</div>`;
}

function taskStatusLabel(status) {
  return {
    available: "可接受",
    active: "进行中",
    completed: "待领奖",
    claimed: "已完成",
    locked: "未解锁",
    expired: "已过期",
  }[status] || status;
}

function categoryLabel(category) {
  const labels = { main: "主线", daily: "每日", style: "外观", tutorial: "引导", event: "活动" };
  return labels[category] || category;
}

function taskActions(task) {
  switch (task.status) {
    case "available":
      return `<button class="btn primary small" data-action="task-accept" data-id="${esc(task.id)}">接受任务</button>`;
    case "active":
    case "expired":
      return `<button class="btn ghost small" data-action="task-abandon" data-id="${esc(task.id)}">放弃任务</button>`;
    case "completed":
      return `<button class="btn gold small" data-action="task-claim" data-id="${esc(task.id)}">领取奖励</button>`;
    case "claimed":
      return `<span class="chip">奖励已领取</span>`;
    default:
      return "";
  }
}

function lockNote(task) {
  const reasons = [];
  if (task.min_level && state.snapshot.account.level < task.min_level) {
    reasons.push(`需要等级 ${task.min_level}`);
  }
  if (task.requires?.length) {
    reasons.push(`需要先完成「${task.requires.map(taskName).join("、")}」`);
  }
  if (task.status === "expired") reasons.push("本轮已过期，可重新接受");
  return reasons.join(" · ") || "条件尚未满足";
}

// ---------------------------------------------------------------------------
// Album & achievements
// ---------------------------------------------------------------------------

function entryOwned(entry) {
  if (entry.kind === "item") return invCount(entry.id) > 0;
  if (entry.kind === "skin") return ownedSkins().has(entry.id);
  if (entry.kind === "achievement") {
    return !!state.snapshot.achievements.find(
      (achievement) => achievement.id === entry.id && achievement.completed,
    );
  }
  return false;
}

function entryInfo(entry) {
  if (entry.kind === "item") {
    return { name: itemName(entry.id), icon: itemIcon(entry.id), species: photoSpeciesForItem(entry.id) };
  }
  if (entry.kind === "skin") {
    const def = skinDef(entry.id);
    return {
      name: skinName(entry.id),
      icon: SKIN_ICONS[def?.category] || "🎩",
      species: null,
    };
  }
  return { name: achievementName(entry.id), icon: "🏅", species: null };
}

function renderAlbum() {
  const collection = state.snapshot.collection;
  const def = collection.definition;
  const progress = collection.progress;
  const percent = pct(progress.collected, progress.total);

  const entries = def.entries
    .map((entry) => {
      const info = entryInfo(entry);
      const owned = entryOwned(entry);
      const shot = info.species ? state.photoCache[info.species] : null;
      const style = shot ? `style="background-image:url('${shot}')"` : "";
      return `
        <div class="entry ${owned ? "owned" : ""}">
          <div class="thumb" ${style}>${shot ? "" : info.icon}</div>
          <div class="label">${esc(info.name)}</div>
          <span class="check">✓</span>
        </div>
      `;
    })
    .join("");

  const milestones = progress.milestones
    .map((milestone) => {
      const defMilestone = def.milestones[milestone.index];
      const canClaim = milestone.unlocked && !milestone.claimed;
      return `
        <div class="milestone ${milestone.unlocked ? "met" : ""}">
          <span class="m-req">${milestone.required} 件</span>
          <span class="m-reward">${chipsForReward(defMilestone?.reward || {})}</span>
          ${
            milestone.claimed
              ? '<span class="chip">已领取</span>'
              : canClaim
                ? `<button class="btn gold small" data-action="milestone-claim" data-id="${milestone.index}">领取</button>`
                : `<span class="chip">${progress.collected}/${milestone.required}</span>`
          }
        </div>
      `;
    })
    .join("");

  const achievements = state.snapshot.achievements
    .map((achievement) => {
      const done = achievement.completed;
      const canClaim = done && !achievement.claimed;
      return `
        <div class="ach ${done ? "done" : ""}">
          <div>
            <b>${esc(achievement.name)}</b>
            <small>${esc(achievement.description || `累计 ${achievement.metric}`)}</small>
          </div>
          ${
            achievement.claimed
              ? '<span class="chip green">已领取</span>'
              : canClaim
                ? `<button class="btn gold small" data-action="achievement-claim" data-id="${esc(achievement.id)}">领取</button>`
                : '<span class="chip">进行中</span>'
          }
          <div class="ach-progress">
            <span>${Math.min(achievement.progress, achievement.target)} / ${achievement.target}</span>
            <div class="bar ${done ? "gold" : ""}"><i style="width:${pct(achievement.progress, achievement.target)}%"></i></div>
          </div>
        </div>
      `;
    })
    .join("");

  drawerBody.innerHTML = `
    <div class="album-hero">
      <div class="ring" style="--p:${percent}">
        <div style="text-align:center;position:relative">
          <span>${progress.collected}</span><small> / ${progress.total}</small>
        </div>
      </div>
      <div class="album-hero-text">
        <h3>${esc(def.name)}</h3>
        <p>${esc(def.description || "")}<br />每次拍摄、交易和外观收集都会实时计入图鉴。</p>
      </div>
    </div>
    ${panelSection("里程碑")}
    <div class="milestones">${milestones}</div>
    ${panelSection("图鉴条目")}
    <div class="album-grid">${entries}</div>
    ${panelSection("成就")}
    <div class="ach-list">${achievements || '<div class="empty">暂无成就</div>'}</div>
  `;
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

function offerIcon(offer) {
  const reward = offer.reward || {};
  if (reward.skins?.length) return "🎩";
  if (reward.resources?.length) return "🔋";
  const item = reward.items?.[0]?.item;
  if (item) return itemIcon(item);
  return "🎁";
}

function offerRegionLabel(offer) {
  if (!offer.tags?.includes("regional")) return "";
  return `<span class="chip gold">园区限定</span>`;
}

function renderShop() {
  const shops = state.snapshot.shops || [];
  const money = coins();

  const body = shops
    .map((shop) => {
      const offers = Object.values(shop.offers || {})
        .sort((a, b) => (b.tags?.includes("featured") ? 1 : 0) - (a.tags?.includes("featured") ? 1 : 0))
        .map((offer) => {
          const limitReached =
            offer.per_account_limit !== null &&
            offer.purchased >= offer.per_account_limit;
          const outOfStock = offer.remaining_stock !== null && offer.remaining_stock <= 0;
          const affordable = (offer.cost?.currencies || []).every(
            (grant) => grant.currency !== "coins" || money >= grant.amount,
          );
          const canBuy = offer.available_now && !limitReached && !outOfStock && affordable;
          const limitText =
            offer.per_account_limit !== null
              ? `${offer.purchased}/${offer.per_account_limit} 限购`
              : offer.remaining_stock !== null
                ? `库存 ${offer.remaining_stock}`
                : "";
          return `
            <div class="offer ${!offer.available_now || outOfStock ? "unavailable" : ""}">
              <div class="offer-ico">${offerIcon(offer)}</div>
              <div>
                <h4>${esc(offer.name)} ${offerRegionLabel(offer)}</h4>
                <p>${esc(offer.description || "")}</p>
                <div class="offer-meta">
                  ${chipsForCost(offer.cost)}
                  <span class="chip">→</span>
                  ${chipsForReward(offer.reward)}
                </div>
              </div>
              <div class="offer-buy">
                <button class="btn ${canBuy ? "primary" : ""} small" data-action="shop-buy" data-id="${esc(offer.id)}" ${canBuy ? "" : "disabled"}>
                  ${limitReached ? "已达限购" : outOfStock ? "售罄" : !offer.available_now ? "本园区不可用" : !affordable ? "金币不足" : "购买"}
                </button>
                ${limitText ? `<small>${limitText}</small>` : ""}
              </div>
            </div>
          `;
        })
        .join("");
      return `${panelSection(shop.name)}<p class="lede">${esc(shop.description || "")}</p><div class="offers">${offers}</div>`;
    })
    .join("");

  drawerBody.innerHTML = `
    <p class="lede">金币来自拍照、投喂和任务。补给站同时演示了 taixu 的商城限购、库存、园区限制与原子扣费。</p>
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-size:12px;color:var(--ink-soft)">我的金币</span>
      <b style="font-family:var(--mono);font-size:18px">🪙 ${formatNumber(money)}</b>
    </div>
    ${body}
  `;
}

// ---------------------------------------------------------------------------
// Chat helpers
// ---------------------------------------------------------------------------

function chatShell(channel, { placeholder = "说点什么…", filter = "all", height = "" } = {}) {
  return `
    <div class="chat" data-channel="${esc(channel)}" data-filter="${esc(filter)}" ${height ? `style="height:${height}"` : ""}>
      <div class="chat-log"><div class="empty" style="border:0">正在接收电波…</div></div>
      <form class="chat-form" data-channel="${esc(channel)}" data-filter="${esc(filter)}">
        <input maxlength="400" placeholder="${esc(placeholder)}" autocomplete="off" />
        <button type="submit">发送</button>
      </form>
    </div>
  `;
}

function authorName(author) {
  if (author.kind === "system") return "营地广播";
  if (author.kind === "npc") return npcName(author.npc);
  return playerName(author.account);
}

function messageMatches(message, filter) {
  if (filter === "guide") {
    return (
      message.author.kind === "npc" ||
      (message.author.kind === "account" && message.author.account === state.accountId)
    );
  }
  if (filter === "self") {
    return message.author.kind === "account" && message.author.account === state.accountId;
  }
  return true;
}

function messagesHtml(messages, filter) {
  const html = messages
    .filter((message) => messageMatches(message, filter))
    .map((message) => {
      const mine =
        message.author.kind === "account" && message.author.account === state.accountId;
      return `
        <div class="msg ${mine ? "mine" : ""} ${message.author.kind === "npc" ? "npc" : ""} ${message.author.kind === "system" ? "system" : ""}">
          <div class="msg-author">${esc(authorName(message.author))} · ${esc(formatTime(message.sent_at_ms))}</div>
          <div class="msg-body">${esc(message.body)}</div>
        </div>
      `;
    })
    .join("");
  return html || '<div class="empty" style="border:0">还没有消息。先说句话吧。</div>';
}

async function loadChat(chatEl) {
  if (!chatEl) return;
  const channel = chatEl.dataset.channel;
  const filter = chatEl.dataset.filter || "all";
  const log = $(".chat-log", chatEl);
  if (!channel || !log) return;
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  try {
    const data = await get(
      `/api/chat/messages?account_id=${encodeURIComponent(state.accountId)}&channel=${encodeURIComponent(channel)}&limit=80`,
    );
    log.innerHTML = messagesHtml(data.messages, filter);
    if (nearBottom || log.dataset.fresh === "1") {
      log.scrollTop = log.scrollHeight;
    }
    log.dataset.fresh = "0";
  } catch (error) {
    log.innerHTML = `<div class="empty" style="border:0">${esc(error.message)}</div>`;
  }
}

function scheduleChatLoads() {
  for (const chatEl of $$(".chat[data-channel]")) {
    const log = $(".chat-log", chatEl);
    if (log) log.dataset.fresh = "1";
    loadChat(chatEl);
  }
}

async function sendChat(form) {
  const channel = form.dataset.channel;
  const filter = form.dataset.filter || "all";
  const input = $("input", form);
  const value = input.value.trim();
  if (!value || !channel) return;
  input.value = "";
  const chatEl = form.closest(".chat");
  try {
    const data = await post("/api/chat/send", { channel, body: value });
    if (data.result?.messages) {
      const log = $(".chat-log", chatEl);
      log.innerHTML = messagesHtml(data.result.messages, filter);
      log.scrollTop = log.scrollHeight;
    }
    renderAfterAction(["ranking", "tasks"]);
  } catch (error) {
    toast(error.message, "error");
    input.value = value;
  }
}

async function sendNpcMessage(form) {
  const input = $("input", form);
  const value = input.value.trim();
  if (!value) return;
  input.value = "";
  await sendNpcText(value);
}

async function sendNpcText(text) {
  if (state.pending) return;
  state.pending = true;
  try {
    const data = await post("/api/npc/chat", { message: text });
    const turn = data.result?.turn;
    if (turn?.applied_actions > 0) {
      toast(`向导给了你一份心意（${turn.applied_actions} 项动作由 taixu 原子提交）`, "gold", 4600);
    }
    const chatEl = $('.chat[data-filter="guide"]');
    if (chatEl && data.result?.messages) {
      const log = $(".chat-log", chatEl);
      log.innerHTML = messagesHtml(data.result.messages, "guide");
      log.scrollTop = log.scrollHeight;
    }
    renderAfterAction(["ranking", "tasks"]);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    state.pending = false;
  }
}

// ---------------------------------------------------------------------------
// Social
// ---------------------------------------------------------------------------

function renderSocial() {
  const tabs = [
    ["friends", "好友"],
    ["radio", "区域电台"],
    ["rooms", "房间"],
    ["dm", "私聊"],
  ];
  const tabBar = `
    <div class="tabs">
      ${tabs
        .map(
          ([id, label]) =>
            `<button class="tab ${state.socialTab === id ? "active" : ""}" data-action="social-tab" data-id="${id}">${label}</button>`,
        )
        .join("")}
    </div>
  `;

  let body = "";
  if (state.socialTab === "friends") body = socialFriends();
  else if (state.socialTab === "radio") body = socialRadio();
  else if (state.socialTab === "rooms") body = socialRooms();
  else body = socialDm();

  drawerBody.innerHTML = tabBar + body;
}

function socialFriends() {
  const social = state.snapshot.social;
  const demo = state.snapshot.demo;
  const bob = social.people.find((person) => person.id === demo.bob_id);
  const blocked = social.blocked.some((person) => person.id === demo.bob_id);
  const bobCard = `
    <div class="person" style="padding:14px">
      <span class="avatar-sm" style="width:46px;height:46px;font-size:22px">🧑‍🔧${bob?.online ? '<span class="online"></span>' : ""}</span>
      <div class="person-info">
        <b>${esc(demo.bob_name)} ${demo.is_friend ? '<span class="chip green">好友</span>' : ""} ${blocked ? '<span class="chip rust">已拉黑</span>' : ""}</b>
        <small>吉普车电台台长 · Lv.${bob?.level ?? "?"} · ${bob?.online ? "在线" : "离线"}<br />手里有一张珍藏地图，想换狮子照片和 30 金币。</small>
      </div>
      <div class="person-actions">
        ${
          blocked
            ? `<button class="btn small" data-action="friend-unblock" data-id="${esc(demo.bob_id)}">解除拉黑</button>`
            : demo.is_friend
              ? `<button class="btn small" data-action="friend-remove">解除好友</button>
                 <button class="btn small" data-action="friend-block" data-id="${esc(demo.bob_id)}">拉黑</button>`
              : `<button class="btn primary small" data-action="friend-add">加为好友</button>`
        }
      </div>
    </div>
  `;

  const incoming = social.incoming
    .map(
      (request) => `
      <div class="person">
        <span class="avatar-sm">🧑</span>
        <div class="person-info"><b>${esc(request.from_name)}</b><small>${esc(request.message || "想加你为好友")}</small></div>
      </div>
    `,
    )
    .join("");

  const friends = social.friends
    .map(
      (friend) => `
      <div class="person">
        <span class="avatar-sm">🧑‍🌾</span>
        <div class="person-info"><b>${esc(friend.name)}</b><small>好友 · 可以发送私聊</small></div>
        <div class="person-actions"><button class="btn small" data-action="social-tab" data-id="dm">私聊</button></div>
      </div>
    `,
    )
    .join("");

  const people = social.people
    .filter((person) => person.id !== state.accountId)
    .map(
      (person) => `
      <div class="person">
        <span class="avatar-sm">${person.region === "wetland" ? "🦩" : "🦒"}${person.online ? '<span class="online"></span>' : ""}</span>
        <div class="person-info"><b>${esc(person.name)}</b><small>${REGION_NAMES[person.region] || person.region} · Lv.${person.level} · ${person.online ? "在线" : "离线"}</small></div>
        <span class="chip">${esc(person.title || "巡护员")}</span>
      </div>
    `,
    )
    .join("");

  return `
    <p class="lede">好友关系、拉黑与私聊权限都来自 taixu 的 <code>FriendGraph</code>。阿宝会立即处理你的好友申请。</p>
    ${bobCard}
    ${tradeCardHtml()}
    ${incoming ? panelSection("收到的申请") + `<div class="people">${incoming}</div>` : ""}
    ${panelSection("我的好友")}
    <div class="people">${friends || '<div class="empty">还没有好友。向阿宝发一份申请吧。</div>'}</div>
    ${panelSection("园区里的巡护员")}
    <div class="people">${people}</div>
  `;
}

function socialRadio() {
  const channel = state.snapshot.demo.region_channel;
  return `
    <p class="lede">区域电台对应 taixu 的 <code>ChatChannel::Region</code>。切换到别的园区后，这里会自动换成另一条频道；区域被关闭时发送会被拒绝。</p>
    ${chatShell(channel, { placeholder: `在${REGION_NAMES[currentRegion()] || "园区"}说点什么…` })}
  `;
}

function socialRooms() {
  const rooms = state.snapshot.rooms || [];
  const currentRoom = state.snapshot.current_room;
  const list = rooms
    .map((room) => {
      const joined = room.joined;
      return `
        <div class="room-card">
          <header>
            <div>
              <h4>📻 ${esc(room.name)} ${joined ? '<span class="chip green">已加入</span>' : ""}</h4>
              <p>${esc(room.metadata?.topic || "巡护员们的临时电台")} · 房主 ${esc(room.owner_name)} · ${room.members.length}/${room.capacity}</p>
            </div>
            ${
              joined
                ? `<button class="btn small" data-action="room-leave">离开房间</button>`
                : `<button class="btn primary small" data-action="room-join" data-id="${esc(room.id)}">加入</button>`
            }
          </header>
          <div class="room-members">${room.members.map((name) => `<span class="chip">${esc(name)}</span>`).join("")}</div>
          ${joined ? `<div style="margin-top:10px">${chatShell(`room:${room.id}`, { placeholder: "在房间里发言…" })}</div>` : ""}
        </div>
      `;
    })
    .join("");

  const joinedRoom = rooms.find((room) => room.id === currentRoom);
  return `
    <p class="lede">一个账号同一时间只能待在一个房间。房间聊天使用 <code>ChatChannel::Room</code>，非成员会被直接拒绝访问。</p>
    <div class="stack">${list || '<div class="empty">本园区还没有房间</div>'}</div>
    ${
      joinedRoom
        ? ""
        : `<form class="inline-form" data-form="create-room">
            <input maxlength="24" placeholder="创建一个私人电台房间…" autocomplete="off" />
            <button class="btn primary small" type="submit">创建</button>
          </form>`
    }
  `;
}

function socialDm() {
  const demo = state.snapshot.demo;
  if (!demo.is_friend) {
    return `
      <p class="lede">私聊基于 <code>ChatChannel::Private</code>，并受双向拉黑规则保护。先和阿宝成为好友，他就会在私聊里回应你。</p>
      <div class="empty">还没有和阿宝成为好友。<br /><br /><button class="btn primary small" data-action="friend-add">发送好友申请</button></div>
    `;
  }
  return `
    <p class="lede">你正在和 ${esc(demo.bob_name)} 私聊。发送包含「地图」「照片」或「任务」的消息，他会给出不同的回复。</p>
    ${chatShell(demo.bob_dm_channel, { placeholder: "对阿宝说点什么…" })}
  `;
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

function renderGuide() {
  const npc = currentNpc();
  if (!npc) {
    drawerBody.innerHTML = '<div class="empty">这个园区暂时没有向导。</div>';
    return;
  }
  const channel = state.snapshot.demo.region_channel;
  drawerBody.innerHTML = `
    <div class="card" style="background:linear-gradient(145deg,rgba(231,178,92,.16),rgba(255,255,255,.5));margin-bottom:14px">
      <div style="display:flex;gap:12px;align-items:center">
        <span class="avatar-sm" style="width:48px;height:48px;font-size:24px">${currentRegion() === "wetland" ? "🧑‍🎤" : "🧑‍🌾"}</span>
        <div>
          <b style="font-family:var(--serif);font-size:17px">${esc(npc.name)}</b>
          <div style="font-size:10.5px;color:var(--ink-soft);margin-top:3px;line-height:1.5">${esc(npc.persona)}</div>
        </div>
      </div>
      <p style="margin:10px 0 0;font-size:11px;line-height:1.6;color:var(--ink-soft);font-style:italic">“${esc(npc.greeting || "欢迎来到园区。")}”</p>
    </div>
    <div class="suggestions">
      ${GUIDE_PROMPTS.map((prompt) => `<button class="suggestion" data-action="guide-prompt" data-id="${esc(prompt)}">${esc(prompt)}</button>`).join("")}
    </div>
    ${chatShell(channel, { filter: "guide", placeholder: "问问向导关于动物、任务或礼物…", height: "min(46vh, 360px)" })}
    <p class="lede" style="margin-top:12px;font-size:10px">对话由本地 NPC Agent 生成，奖励与排行榜动作通过 <code>apply_npc_turn</code> 原子提交；同一账号 10 分钟内只能领一次礼物。</p>
  `;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function renderRanking() {
  const boards = state.snapshot.leaderboards || [];
  if (!boards.length) {
    drawerBody.innerHTML = '<div class="empty">暂无排行榜</div>';
    return;
  }
  if (!state.rankingTab || !boards.some((board) => board.id === state.rankingTab)) {
    state.rankingTab = boards[0].id;
  }
  const active = boards.find((board) => board.id === state.rankingTab) || boards[0];
  const tabs = `
    <div class="tabs">
      ${boards
        .map(
          (board) =>
            `<button class="tab ${board.id === active.id ? "active" : ""}" data-action="ranking-tab" data-id="${esc(board.id)}">${esc(board.name)}</button>`,
        )
        .join("")}
    </div>
  `;
  const rows = active.top
    .map((entry) => {
      const me = entry.account === state.accountId;
      const rankClass = entry.rank === 1 ? "gold" : entry.rank === 2 ? "silver" : entry.rank === 3 ? "bronze" : "";
      const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank;
      return `
        <div class="board-row ${me ? "me" : ""}">
          <span class="rank ${rankClass}">${medal}</span>
          <span class="board-name">${esc(playerName(entry.account))}${me ? "（我）" : ""}</span>
          <span class="board-score">${formatNumber(entry.score)}</span>
        </div>
      `;
    })
    .join("");
  const myScore = active.my_score ?? 0;
  const myRank = active.my_rank ? `第 ${active.my_rank} 名` : "尚未上榜";
  drawerBody.innerHTML = `
    ${tabs}
    <div class="board">
      <div class="board-head">
        <h3>${esc(active.name)}</h3>
        <p>${esc(active.description || "")} · 第 ${active.season} 赛季 · ${active.order === "lower_is_better" ? "分数越低越好" : "分数越高越好"}</p>
      </div>
      ${rows || '<div class="empty" style="border:0">还没有人上榜</div>'}
    </div>
    <div class="my-rank">
      <span>我的成绩</span>
      <span><b>${formatNumber(myScore)}</b> 分 · ${myRank}</span>
    </div>
    <p class="lede" style="margin-top:14px">排行榜支持并列名次、Top-N 截断与赛季。拍照与投喂会立即改变名次；向导也能通过 <code>SetScore</code> 动作写入分数。</p>
  `;
}

// ---------------------------------------------------------------------------
// News & admin
// ---------------------------------------------------------------------------

function kindLabel(kind) {
  return {
    news: "消息",
    event: "活动",
    promotion: "促销",
    maintenance: "维护",
    system: "系统",
  }[kind] || kind;
}

function renderNews() {
  const items = state.snapshot.announcements || [];
  const list = items
    .map(({ announcement, read }) => `
      <div class="news-item ${read ? "" : "unread"}">
        <header>
          <span class="chip ${announcement.kind === "event" ? "gold" : announcement.kind === "promotion" ? "green" : ""}">${esc(kindLabel(announcement.kind))}</span>
          <h4>${esc(announcement.title)}</h4>
          ${read ? "" : '<span class="chip rust">未读</span>'}
        </header>
        <p>${esc(announcement.body)}</p>
        <div class="news-foot">
          <span class="news-time">优先级 ${announcement.priority} · ${formatTime(announcement.created_at_ms)}</span>
          ${read ? "" : `<button class="btn small" data-action="news-read" data-id="${esc(announcement.id)}">标为已读</button>`}
        </div>
      </div>
    `)
    .join("");

  const boardAdmin = state.snapshot.leaderboards
    .map(
      (board) => `
      <div class="region-admin">
        <b>${esc(board.name)}</b>
        <span class="chip">第 ${board.season} 赛季</span>
        <button class="btn small" data-action="season-reset" data-id="${esc(board.id)}">开启新赛季</button>
      </div>
    `,
    )
    .join("");

  const regionAdmin = state.snapshot.regions
    .map(
      (region) => `
      <div class="region-admin">
        <b>${esc(region.name)}</b>
        <span class="chip ${region.status === "open" ? "green" : region.status === "closed" ? "rust" : "gold"}">${STATUS_LABEL[region.status] || region.status}</span>
        ${["open", "maintenance", "closed"]
          .map(
            (status) =>
              `<button class="btn small ${region.status === status ? "primary" : ""}" data-action="admin-status" data-id="${esc(region.id)}" data-status="${status}" ${region.status === status ? "disabled" : ""}>${STATUS_LABEL[status]}</button>`,
          )
          .join("")}
      </div>
    `,
    )
    .join("");

  drawerBody.innerHTML = `
    ${list || '<div class="empty">暂无公告</div>'}
    <div class="admin-box">
      <h4>园区管理台（演示）</h4>
      <p>区域状态是 taixu 的真实领域规则：<code>Maintenance</code> 只阻止新账号与迁入；<code>Closed</code> 还会拒绝聊天、购买、交易、好友申请、接任务和 NPC 回合。领奖仍可用。</p>
      ${regionAdmin}
      <div class="section-label" style="margin:14px 0 2px">排行榜赛季</div>
      ${boardAdmin}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function renderProfile() {
  const snapshot = state.snapshot;
  const account = snapshot.account;
  const equipped = equippedSkins();
  const owned = ownedSkins();
  const xpInLevel = account.xp % 100;

  const categories = ["character", "frame", "badge"];
  const skins = snapshot.skins.catalog
    .filter((skin) => categories.includes(skin.category))
    .map((skin) => {
      const has = owned.has(skin.id);
      const on = equipped[skin.category] === skin.id;
      return `
        <div class="skin ${on ? "equipped" : ""}">
          <header>
            <span class="skin-ico">${SKIN_ICONS[skin.category] || "🎩"}</span>
            <div>
              <b>${esc(skin.name)}</b>
              <span class="chip" style="margin-left:4px">${RARITY_LABEL[skin.rarity] || skin.rarity}</span>
            </div>
          </header>
          <small>${esc(skin.description || "")}</small>
          <div class="skin-actions">
            ${
              on
                ? `<button class="btn small" data-action="skin-unequip" data-id="${esc(skin.category)}">卸下</button>`
                : has
                  ? `<button class="btn primary small" data-action="skin-equip" data-id="${esc(skin.id)}">佩戴</button>`
                  : `<span class="chip">尚未拥有 · 去补给站或完成成就获取</span>`
            }
          </div>
        </div>
      `;
    })
    .join("");

  const slots = (snapshot.inventory.slots || []).filter(Boolean);
  const inventory = slots
    .map(
      (slot) => `
      <div class="item">
        <span class="item-ico">${itemIcon(slot.item)}</span>
        <b>${esc(itemName(slot.item))}</b>
        <small>×${slot.quantity}</small>
      </div>
    `,
    )
    .join("");

  const regions = snapshot.regions
    .map(
      (region) => `
      <button class="region-option ${region.id === account.region ? "current" : ""}" data-action="region-move" data-id="${esc(region.id)}" ${region.status !== "open" || region.id === account.region ? "disabled" : ""}>
        <span class="region-ico">${region.id === "wetland" ? "🦩" : "🦒"}</span>
        <span>
          <b>${esc(region.name)}</b>
          <small>${region.player_count} 位巡护员 · ${region.id === account.region ? "当前所在" : "切换园区会离开当前房间"}</small>
        </span>
        <span class="status ${region.status}">${STATUS_LABEL[region.status] || region.status}</span>
      </button>
    `,
    )
    .join("");

  const avatarChoices = ["🧑‍🌾", "🦁", "🐘", "🦒", "🦩", "🦓", "🦏", "🧭"]
    .map(
      (emoji) =>
        `<button class="avatar-choice ${account.avatar.image === emoji ? "selected" : ""}" data-action="avatar-set" data-id="${emoji}">${emoji}</button>`,
    )
    .join("");

  drawerBody.innerHTML = `
    <div class="profile-hero">
      <span class="avatar" style="width:58px;height:58px;font-size:28px">${account.avatar.image || "🧑‍🌾"}</span>
      <div style="flex:1">
        <h3>${esc(account.display_name)}</h3>
        <p>${esc(account.avatar.title || "还没有头衔")} · ${REGION_NAMES[account.region] || account.region}</p>
        <div class="level-bar">
          <div style="display:flex;justify-content:space-between;font-size:8.5px;font-family:var(--mono);color:rgba(248,241,223,.6);margin-bottom:3px"><span>Lv.${account.level}</span><span>${xpInLevel}/100 XP</span></div>
          <div class="bar gold"><i style="width:${xpInLevel}%"></i></div>
        </div>
      </div>
    </div>
    ${panelSection("头像与头衔")}
    <div class="avatar-picker">${avatarChoices}</div>
    <form class="title-form" data-form="title" style="margin-top:9px">
      <input maxlength="48" value="${esc(account.avatar.title || "")}" placeholder="给自己写一个头衔…" />
      <button class="btn primary small" type="submit">保存</button>
    </form>
    ${panelSection("外观 · 镜头里的你")}
    <div class="skin-grid">${skins}</div>
    ${panelSection("背包")}
    <div class="inventory-grid">${inventory || '<div class="empty" style="grid-column:1/-1">背包是空的</div>'}</div>
    ${panelSection("切换园区")}
    <div class="region-switch">${regions}</div>
    ${panelSection("会话")}
    <div class="card" style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:10.5px;color:var(--ink-soft);line-height:1.5">taixu 状态版本 v${snapshot.state_version}<br />每次操作后自动写入 JSON 快照</span>
      <button class="btn danger small" data-action="logout">退出登录</button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Drawer events
// ---------------------------------------------------------------------------

drawer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target.closest("form");
  if (!form) return;

  if (form.matches(".chat-form")) {
    const npcMode = form.closest(".chat")?.dataset.filter === "guide";
    if (npcMode) await sendNpcMessage(form);
    else await sendChat(form);
    return;
  }

  if (form.dataset.form === "create-room") {
    const input = $("input", form);
    const name = input.value.trim();
    if (!name) return;
    try {
      await post("/api/room/create", { name });
      toast("房间创建成功，电台开始广播", "success");
      input.value = "";
      renderPanel();
    } catch (error) {
      toast(error.message, "error");
    }
    return;
  }

  if (form.dataset.form === "title") {
    const input = $("input", form);
    try {
      await post("/api/avatar", { title: input.value.trim() });
      toast("头衔已更新", "success");
      renderPanel();
    } catch (error) {
      toast(error.message, "error");
    }
  }
});

drawer.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (button.disabled) return;

  const wrap = async (fn, message) => {
    if (state.pending) return;
    state.pending = true;
    button.disabled = true;
    try {
      const result = await fn();
      if (message) toast(message, message.includes("失败") ? "error" : "success");
      return result;
    } catch (error) {
      toast(error.message, "error");
    } finally {
      state.pending = false;
      if (button.isConnected) button.disabled = false;
    }
  };

  switch (action) {
    case "task-accept":
      await wrap(() => post("/api/task/accept", { task: id }), "任务已接受，开始行动吧").then(() => renderPanel());
      break;
    case "task-claim":
      await wrap(async () => {
        const data = await post("/api/task/claim", { task: id });
        toast("任务奖励已领取", "gold");
        return data;
      }).then(() => renderPanel());
      break;
    case "task-abandon":
      if (!confirm("确定放弃这个任务吗？已累积的进度会被清空。")) return;
      await wrap(() => post("/api/task/abandon", { task: id }), "任务已放弃").then(() => renderPanel());
      break;
    case "achievement-claim":
      await wrap(async () => {
        const data = await post("/api/achievement/claim", { achievement: id });
        toast("成就奖励已领取", "gold");
        return data;
      }).then(() => renderPanel());
      break;
    case "milestone-claim":
      await wrap(async () => {
        const data = await post("/api/collection/claim", { index: Number(id) });
        toast("图鉴里程碑奖励已领取", "gold");
        return data;
      }).then(() => renderPanel());
      break;
    case "shop-buy":
      await wrap(async () => {
        const data = await post("/api/shop/buy", { offer: id, quantity: 1 });
        const receipt = data.result.receipt;
        toast(`购买成功：${receipt.offer} ×${receipt.quantity}`, "success");
        return data;
      }).then(() => renderPanel());
      break;
    case "room-join":
      await wrap(() => post("/api/room/join", { room_id: id }), "已加入房间").then(() => renderPanel());
      break;
    case "room-leave":
      await wrap(() => post("/api/room/leave"), "已离开房间").then(() => renderPanel());
      break;
    case "friend-add":
      await wrap(async () => {
        const data = await post("/api/friend/add");
        if (data.result.became_friends) toast("阿宝接受了你的好友申请，去私聊打个招呼吧", "gold", 4200);
        return data;
      }).then(() => renderPanel());
      break;
    case "friend-remove":
      if (!confirm("解除和阿宝的好友关系？")) return;
      await wrap(() => post("/api/friend/remove"), "好友关系已解除").then(() => renderPanel());
      break;
    case "friend-block":
      if (!confirm("拉黑后双方无法私聊或发送好友申请。继续？")) return;
      await wrap(() => post("/api/friend/block", { target: id }), "已拉黑").then(() => renderPanel());
      break;
    case "friend-unblock":
      await wrap(() => post("/api/friend/unblock", { target: id }), "已解除拉黑").then(() => renderPanel());
      break;
    case "trade-start":
      await wrap(async () => {
        const data = await post("/api/trade/start");
        toast("交易已创建，确认后由 taixu 原子结算", "success");
        return data;
      }).then(() => renderPanel());
      break;
    case "trade-confirm":
      await wrap(async () => {
        const data = await post("/api/trade/confirm", { trade_id: id });
        toast("交易完成！珍藏地图已放进背包", "gold", 4600);
        return data;
      }).then(() => renderPanel());
      break;
    case "trade-cancel":
      await wrap(() => post("/api/trade/cancel", { trade_id: id }), "交易已取消").then(() => renderPanel());
      break;
    case "news-read":
      await wrap(() => post("/api/announcement/read", { id }), "已标为已读").then(() => renderPanel());
      break;
    case "social-tab":
      state.socialTab = id;
      renderPanel();
      break;
    case "ranking-tab":
      state.rankingTab = id;
      renderPanel();
      break;
    case "skin-equip":
      await wrap(() => post("/api/skin/equip", { skin: id }), "外观已佩戴").then(() => renderPanel());
      break;
    case "skin-unequip":
      await wrap(() => post("/api/skin/unequip", { category: id }), "外观已卸下").then(() => renderPanel());
      break;
    case "avatar-set":
      await wrap(() => post("/api/avatar", { title: state.snapshot.account.avatar.title, image: id }), "头像已更新").then(() => renderPanel());
      break;
    case "region-move":
      await wrap(async () => {
        const data = await post("/api/region/move", { region: id });
        toast(`已抵达${REGION_NAMES[data.result.region] || data.result.region}`, "gold", 4200);
        return data;
      }).then(() => renderPanel());
      break;
    case "admin-status":
      await wrap(async () => {
        const data = await post("/api/admin/region-status", {
          region: id,
          status: button.dataset.status,
        });
        toast(`${data.region.name}：${STATUS_LABEL[data.region.status]}`, "success");
        return data;
      }).then(() => renderPanel());
      break;
    case "season-reset":
      if (!confirm("开启新赛季会清空这个排行榜的当前分数。继续？")) return;
      await wrap(async () => {
        const data = await post("/api/admin/season-reset", { board: id });
        toast(`新赛季已开启：第 ${data.result.season} 赛季`, "success");
        return data;
      }).then(() => renderPanel());
      break;
    case "guide-prompt":
      await sendNpcText(id);
      break;
    case "logout":
      if (!confirm("退出并返回登录界面？游戏进度已自动保存。")) return;
      try {
        await post("/api/logout");
      } catch {}
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
      break;
    default:
      break;
  }
});

// ---------------------------------------------------------------------------
// Trade card (inside the friends tab)
// ---------------------------------------------------------------------------

function tradeCardHtml() {
  const demo = state.snapshot.demo;
  const trades = state.snapshot.trades || [];
  const live = trades
    .map((item) => item.trade)
    .find(
      (trade) =>
        (trade.initiator === demo.bob_id || trade.partner === demo.bob_id) &&
        trade.state === "open",
    );

  if (demo.trade_completed) {
    return `
      <div class="card" style="margin-top:10px;border-color:rgba(58,122,88,.35);background:rgba(143,191,159,.12)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div>
            <b style="font-size:12.5px">🤝 交易已完成</b>
            <p style="margin:4px 0 0;font-size:10.5px;color:var(--ink-soft)">「阿宝的珍藏地图」已经在你的背包里，并计入图鉴。</p>
          </div>
          <span class="chip green">已结算</span>
        </div>
      </div>
    `;
  }

  if (live) {
    const hasLion = invCount("photo_lion") > 0;
    const hasCoins = coins() >= 30;
    return `
      <div class="card" style="margin-top:10px;border-color:rgba(201,139,47,.42)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <b style="font-size:12.5px">🤝 阿宝的交易柜台</b>
          <span class="chip gold">等待确认</span>
        </div>
        <div class="offer-meta" style="margin-top:8px">
          <span class="cost-chip">📷 狮子照片 ×1 ${hasLion ? "✓" : "（缺少）"}</span>
          <span class="cost-chip">🪙 30 ${hasCoins ? "✓" : "（不足）"}</span>
          <span class="chip">→</span>
          <span class="reward-chip">🗺️ 阿宝的珍藏地图 ×1</span>
        </div>
        <p style="margin:8px 0 0;font-size:10px;color:var(--ink-soft);line-height:1.5">双方确认后由 taixu 原子结算；资产不足时交易保持开放，确认标记会被清空。</p>
        <div style="display:flex;gap:6px;margin-top:9px">
          <button class="btn primary small" data-action="trade-confirm" data-id="${esc(live.id)}">确认交换</button>
          <button class="btn ghost small" data-action="trade-cancel" data-id="${esc(live.id)}">取消</button>
        </div>
      </div>
    `;
  }

  const canStart = invCount("photo_lion") > 0 && coins() >= 30;
  return `
    <div class="card" style="margin-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <b style="font-size:12.5px">🤝 阿宝的交易柜台</b>
        <span class="chip">玩家交易</span>
      </div>
      <p style="margin:6px 0 8px;font-size:10.5px;color:var(--ink-soft);line-height:1.5">他想要一张狮子照片和 30 金币，愿意用一张「珍藏地图」来换。地图同时是图鉴条目。</p>
      <div class="offer-meta">
        <span class="cost-chip">📷 狮子照片 ×1 ${invCount("photo_lion") > 0 ? "✓" : "（缺少）"}</span>
        <span class="cost-chip">🪙 30 ${coins() >= 30 ? "✓" : "（不足）"}</span>
        <span class="chip">→</span>
        <span class="reward-chip">🗺️ 珍藏地图 ×1</span>
      </div>
      <button class="btn primary small" style="margin-top:9px" data-action="trade-start" ${canStart ? "" : "disabled"}>发起交易</button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Periodic sync
// ---------------------------------------------------------------------------

function startTimers() {
  window.setInterval(async () => {
    if (!state.accountId || document.hidden) return;
    try {
      await post("/api/state");
    } catch {}
  }, 20000);

  window.setInterval(() => {
    if (!state.accountId) return;
    post("/api/heartbeat").catch(() => {});
  }, 30000);

  window.setInterval(() => {
    if (state.panel === "social" || state.panel === "guide") {
      scheduleChatLoads();
    }
  }, 4500);

  window.setInterval(() => {
    for (const el of $$(".countdown")) {
      const until = Number(el.dataset.until);
      if (until) el.textContent = remainingLabel(until);
    }
  }, 1000);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function hideBoot() {
  const bootEl = $("#boot");
  if (!bootEl || bootEl.classList.contains("gone")) return;
  bootEl.classList.add("gone");
  window.setTimeout(() => bootEl.remove(), 600);
}

function boot() {
  restoreSession();
  startTimers();
  // Fallback if WebGL never produces a frame.
  window.setTimeout(hideBoot, 6000);
  window.setTimeout(() => {
    $("#controls-hint")?.classList.add("faded");
  }, 14000);
  updateActionButtons();
}

boot();

// Expose a tiny debug handle for the curious.
window.__taixuSafari = {
  state,
  get snapshot() {
    return state.snapshot;
  },
  safari,
};
