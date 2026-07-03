/**
 * Roche 小游戏插件
 * 一个可扩展的 HTML 小游戏框架
 *
 * 架构说明：
 * - 游戏大厅：展示所有游戏（内置 + 自定义），网格卡片布局
 * - 游戏播放器：用 iframe srcdoc 渲染 HTML 游戏，每个游戏完全隔离
 * - AI 桥接：游戏内可通过 window.RocheGame API 调用 Roche 的 AI/存储/角色能力
 * - 自定义游戏：用户通过 UI 添加，保存在 roche.storage
 * - 内置游戏：在下方 BUILTIN_GAMES 数组中添加，随插件分发
 *
 * 如何添加新的内置游戏：
 *   在 BUILTIN_GAMES 数组中添加一个对象即可：
 *   { id: "builtin-xxx", name: "游戏名", description: "简介", emoji: "", html: "<!DOCTYPE html>..." }
 *
 * 如何在游戏中使用 AI 桥接：
 *   游戏 HTML 中可直接调用 window.RocheGame.aiChat(messages) 等方法
 *   桥接脚本会自动注入到每个游戏的 iframe 中
 */

(function () {
  "use strict";

  /* ============================================================
   * 常量
   * ============================================================ */
  var STORAGE_KEY = "mini-games-custom-list"; // 自定义游戏列表的 storage key
  var PRESETS_KEY = "mini-games-presets"; // 预设列表的 storage key
  var API_PRESETS_KEY = "mini-games-api-presets"; // API 预设列表的 storage key

  /* ============================================================
   * 内置游戏
   * 在这里添加新的内置游戏，格式：
   * { id, name, description, emoji, html }
   * html 必须是完整的 HTML 文档（可以包含 <!DOCTYPE html>）
   * ============================================================ */
  var BUILTIN_GAMES = [
    {
      id: "builtin-turtle-soup",
      name: "海龟汤",
      description: "即将推出",
      emoji: "",
      isPlaceholder: true
    },
    {
      id: "builtin-werewolf",
      name: "狼人杀",
      description: "人设与记忆驱动的狼人杀",
      emoji: "",
      isNative: true
    }
  ];

  /* ============================================================
   * 游戏桥接脚本
   * 会自动注入到每个游戏的 iframe 中
   * 游戏内可通过 window.RocheGame 调用以下方法：
   *   RocheGame.aiChat(messages, options)  → 调用 Roche AI 对话
   *   RocheGame.toast(message)             → 显示提示
   *   RocheGame.storageGet(key)            → 读取游戏私有存储
   *   RocheGame.storageSet(key, value)     → 写入游戏私有存储
   *   RocheGame.getPersona()               → 获取当前用户人设
   *   RocheGame.getCharacters()            → 获取角色列表
   *   RocheGame.searchMemory(query)        → 搜索记忆
   * ============================================================ */
  var GAME_BRIDGE =
    '<script>\n' +
    'window.RocheGame={\n' +
    '  _req:function(action,data){\n' +
    '    return new Promise(function(resolve,reject){\n' +
    '      var id=Math.random().toString(36).slice(2);\n' +
    '      var handler=function(e){\n' +
    '        if(e.data&&e.data.type==="roche-game-resp"&&e.data.id===id){\n' +
    '          window.removeEventListener("message",handler);\n' +
    '          if(e.data.error)reject(new Error(e.data.error));\n' +
    '          else resolve(e.data.result);\n' +
    '        }\n' +
    '      };\n' +
    '      window.addEventListener("message",handler);\n' +
    '      window.parent.postMessage({type:"roche-game-req",action:action,data:data||{},id:id},"*");\n' +
    '    });\n' +
    '  },\n' +
    '  aiChat:function(messages,options){return this._req("ai-chat",{messages:messages,options:options||{}})},\n' +
    '  toast:function(msg){return this._req("toast",{message:msg})},\n' +
    '  storageGet:function(key){return this._req("storage-get",{key:key})},\n' +
    '  storageSet:function(key,value){return this._req("storage-set",{key:key,value:value})},\n' +
    '  getPersona:function(){return this._req("get-persona",{})},\n' +
    '  getCharacters:function(){return this._req("get-characters",{})},\n' +
    '  searchMemory:function(query,limit){return this._req("search-memory",{query:query,limit:limit||20})}\n' +
    '};\n' +
    '<\/script>\n';

  /* ============================================================
   * CSS 样式（全部限定在 .mini-games-root 下）
   * ============================================================ */
  var CSS = `
/* ============================================================
 * 小游戏插件样式 · 午夜剧场
 * 深色学术 / 古典典雅 / 金色点缀
 * ============================================================ */

.mini-games-root {
  --mg-bg-deep: #0a0a14;
  --mg-bg-mid: #0d0d1a;
  --mg-surface: #13131f;
  --mg-surface-2: #181828;
  --mg-border: #2a2a40;
  --mg-border-gold: #3a3520;
  --mg-gold: #c9a961;
  --mg-gold-bright: #d4af37;
  --mg-wine: #7a2e3a;
  --mg-wine-bright: #8b3a4a;
  --mg-text: #e8e4d8;
  --mg-text-muted: #8a8578;
  --mg-text-dim: #6a6558;
  --mg-divider: #2a2a3a;
  --mg-serif: "Georgia", "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  --mg-sans: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;

  height: 100%;
  background:
    radial-gradient(ellipse at top, rgba(58, 53, 32, 0.14) 0%, transparent 55%),
    radial-gradient(ellipse at bottom, rgba(122, 46, 58, 0.10) 0%, transparent 60%),
    linear-gradient(180deg, #0a0a14 0%, #0d0d1a 100%);
  color: var(--mg-text);
  font-family: var(--mg-sans);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.55;
}

/* ---------- 滚动条 ---------- */
.mini-games-root ::-webkit-scrollbar { width: 6px; height: 6px; }
.mini-games-root ::-webkit-scrollbar-track { background: transparent; }
.mini-games-root ::-webkit-scrollbar-thumb {
  background: rgba(201, 169, 97, 0.20);
  border-radius: 2px;
}
.mini-games-root ::-webkit-scrollbar-thumb:hover { background: rgba(201, 169, 97, 0.36); }

/* ---------- Header ---------- */
.mg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 28px;
  background: linear-gradient(180deg, rgba(19, 19, 31, 0.92) 0%, rgba(13, 13, 26, 0.6) 100%);
  border-bottom: 1px solid var(--mg-border);
  position: relative;
  flex-shrink: 0;
}
.mg-header::after {
  content: "";
  position: absolute;
  left: 28px;
  right: 28px;
  bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(201, 169, 97, 0.5) 50%, transparent 100%);
}
.mg-title {
  font-family: var(--mg-serif);
  font-size: 22px;
  font-weight: 600;
  margin: 0;
  color: var(--mg-gold);
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 10px;
  text-shadow: 0 0 18px rgba(201, 169, 97, 0.18);
}
.mg-actions { display: flex; gap: 10px; align-items: center; }

/* ---------- Buttons ---------- */
.mg-btn {
  padding: 8px 18px;
  border: 1px solid var(--mg-border);
  border-radius: 2px;
  background: var(--mg-surface);
  color: var(--mg-text);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--mg-sans);
  letter-spacing: 0.04em;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}
.mg-btn:hover {
  background: var(--mg-surface-2);
  border-color: var(--mg-gold);
  color: var(--mg-gold);
}
.mg-btn:disabled { cursor: default; }
.mg-btn-primary {
  background: linear-gradient(180deg, #1a1a28 0%, #13131f 100%);
  border-color: var(--mg-gold);
  color: var(--mg-gold);
}
.mg-btn-primary:hover {
  background: linear-gradient(180deg, #2a2418 0%, #1f1c12 100%);
  border-color: var(--mg-gold-bright);
  color: var(--mg-gold-bright);
  box-shadow: 0 0 14px rgba(201, 169, 97, 0.24);
}
.mg-btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--mg-text-muted);
  padding: 8px 12px;
}
.mg-btn-ghost:hover {
  background: rgba(201, 169, 97, 0.07);
  border-color: rgba(201, 169, 97, 0.32);
  color: var(--mg-gold);
}
.mg-btn-danger {
  background: linear-gradient(180deg, #2a1418 0%, #1c0f12 100%);
  border-color: var(--mg-wine-bright);
  color: #d49aa3;
}
.mg-btn-danger:hover {
  background: linear-gradient(180deg, #3a1c22 0%, #2a1418 100%);
  border-color: var(--mg-wine-bright);
  color: #e8b8c0;
  box-shadow: 0 0 12px rgba(139, 58, 74, 0.3);
}
.mg-btn-sm { padding: 5px 12px; font-size: 12px; }

/* ---------- Content ---------- */
.mg-content {
  flex: 1;
  overflow-y: auto;
  padding: 28px 28px 40px;
}

/* ---------- Section Title ---------- */
.mg-section-title {
  font-family: var(--mg-serif);
  font-size: 13px;
  color: var(--mg-gold);
  margin: 4px 0 18px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 600;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(201, 169, 97, 0.18);
  position: relative;
}
.mg-section-title::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 32px;
  height: 1px;
  background: var(--mg-gold);
}

/* ---------- Grid & Cards ---------- */
.mg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}
.mg-card {
  background: linear-gradient(180deg, var(--mg-surface) 0%, #0f0f1a 100%);
  border: 1px solid var(--mg-border);
  border-radius: 3px;
  padding: 24px 18px 18px;
  text-align: center;
  transition: all 0.25s ease;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.mg-card::before {
  content: "";
  position: absolute;
  inset: 4px;
  border: 1px solid transparent;
  border-radius: 2px;
  pointer-events: none;
  transition: border-color 0.25s ease;
}
.mg-card:hover {
  border-color: var(--mg-gold);
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(201, 169, 97, 0.15);
}
.mg-card:hover::before { border-color: rgba(201, 169, 97, 0.20); }
.mg-card-name {
  font-family: var(--mg-serif);
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--mg-text);
  letter-spacing: 0.05em;
}
.mg-card-desc {
  font-size: 12px;
  color: var(--mg-text-muted);
  margin: 0 0 16px;
  min-height: 32px;
  line-height: 1.5;
  font-style: italic;
}
.mg-card-btns { display: flex; gap: 6px; }
.mg-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 2px;
  background: rgba(201, 169, 97, 0.1);
  border: 1px solid rgba(201, 169, 97, 0.3);
  color: var(--mg-gold);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.mg-card-manage {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
}
.mg-card-manage button {
  background: rgba(42, 42, 64, 0.6);
  border: 1px solid var(--mg-border);
  border-radius: 2px;
  color: var(--mg-text-muted);
  cursor: pointer;
  font-size: 11px;
  padding: 3px 8px;
  font-family: var(--mg-sans);
  transition: all 0.15s ease;
}
.mg-card-manage button:hover {
  color: var(--mg-gold);
  border-color: var(--mg-gold);
  background: rgba(201, 169, 97, 0.08);
}

/* ---------- Game View ---------- */
.mg-game-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.mg-game-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 22px;
  background: linear-gradient(180deg, rgba(19, 19, 31, 0.92) 0%, rgba(13, 13, 26, 0.6) 100%);
  border-bottom: 1px solid var(--mg-border);
  flex-shrink: 0;
  position: relative;
}
.mg-game-bar::after {
  content: "";
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(201, 169, 97, 0.4) 50%, transparent 100%);
}
.mg-game-bar-title {
  font-family: var(--mg-serif);
  font-size: 16px;
  font-weight: 600;
  flex: 1;
  color: var(--mg-gold);
  letter-spacing: 0.05em;
}
.mg-game-frame {
  flex: 1;
  border: none;
  width: 100%;
  background: #fff;
}

/* ---------- Form ---------- */
.mg-form-wrap {
  max-width: 680px;
  margin: 0 auto;
  padding: 28px 32px;
  background: linear-gradient(180deg, var(--mg-surface) 0%, #0f0f1a 100%);
  border: 1px solid var(--mg-border);
  border-radius: 3px;
  position: relative;
}
.mg-form-wrap::before {
  content: "";
  position: absolute;
  inset: 4px;
  border: 1px solid rgba(201, 169, 97, 0.08);
  border-radius: 2px;
  pointer-events: none;
}
.mg-form-title {
  font-family: var(--mg-serif);
  font-size: 19px;
  font-weight: 600;
  margin: 0 0 22px;
  color: var(--mg-gold);
  letter-spacing: 0.05em;
}
.mg-field { margin-bottom: 18px; }
.mg-field-row { display: flex; gap: 14px; }
.mg-field-row .mg-field { flex: 1; }
.mg-label {
  display: block;
  font-size: 11px;
  color: var(--mg-gold);
  margin-bottom: 7px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.85;
}
.mg-input, .mg-textarea, select.mg-input {
  width: 100%;
  background: rgba(10, 10, 20, 0.5);
  border: none;
  border-bottom: 1px solid var(--mg-border);
  border-radius: 0;
  color: var(--mg-text);
  padding: 9px 4px;
  font-size: 14px;
  font-family: var(--mg-sans);
  box-sizing: border-box;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.mg-textarea {
  border: 1px solid var(--mg-border);
  border-radius: 2px;
  font-family: "Cascadia Code", "Fira Code", "Courier New", monospace;
  min-height: 320px;
  resize: vertical;
  line-height: 1.55;
  padding: 12px 14px;
}
select.mg-input {
  border: 1px solid var(--mg-border);
  border-radius: 2px;
  padding: 9px 12px;
  background-image: linear-gradient(45deg, transparent 50%, var(--mg-gold) 50%), linear-gradient(135deg, var(--mg-gold) 50%, transparent 50%);
  background-position: calc(100% - 14px) center, calc(100% - 9px) center;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  -webkit-appearance: none;
  appearance: none;
}
select.mg-input option { background: var(--mg-surface); color: var(--mg-text); }
.mg-input:focus, .mg-textarea:focus, select.mg-input:focus {
  outline: none;
  border-color: var(--mg-gold);
  background: rgba(10, 10, 20, 0.7);
}
.mg-input::placeholder, .mg-textarea::placeholder { color: var(--mg-text-dim); font-style: italic; }
.mg-form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--mg-divider);
}
.mg-hint {
  font-size: 12px;
  color: var(--mg-text-dim);
  margin-top: 6px;
  line-height: 1.5;
  font-style: italic;
}

/* ---------- Empty ---------- */
.mg-empty {
  text-align: center;
  padding: 56px 24px;
  color: var(--mg-text-muted);
  font-style: italic;
}
.mg-empty-icon { display: none; }

/* ---------- Preset ---------- */
.mg-preset-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  background: linear-gradient(180deg, var(--mg-surface) 0%, #0f0f1a 100%);
  border: 1px solid var(--mg-border);
  border-radius: 3px;
  margin-bottom: 10px;
  transition: border-color 0.2s ease;
}
.mg-preset-row:hover { border-color: rgba(201, 169, 97, 0.35); }
.mg-preset-info { flex: 1; }
.mg-preset-name {
  font-family: var(--mg-serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--mg-text);
  margin: 0 0 4px;
  letter-spacing: 0.04em;
}
.mg-preset-summary {
  font-size: 12px;
  color: var(--mg-text-muted);
  letter-spacing: 0.03em;
}
.mg-preset-actions { display: flex; gap: 8px; }

.mg-check-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding: 10px;
  background: rgba(10, 10, 20, 0.4);
  border: 1px solid var(--mg-border);
  border-radius: 2px;
}
.mg-check-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  background: rgba(19, 19, 31, 0.6);
  border: 1px solid transparent;
  border-radius: 2px;
  transition: border-color 0.15s ease;
}
.mg-check-item:hover { border-color: rgba(201, 169, 97, 0.18); }
.mg-check-item label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--mg-text);
}
.mg-check-item input[type="checkbox"] {
  accent-color: var(--mg-gold);
  cursor: pointer;
}
.mg-check-config {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  padding-left: 24px;
}
.mg-check-config label {
  font-size: 12px;
  color: var(--mg-text-muted);
  display: flex;
  align-items: center;
  gap: 5px;
}
.mg-check-config input[type="number"] { width: 60px; }
.mg-check-config input[type="checkbox"] { accent-color: var(--mg-gold); }

.mg-loading {
  text-align: center;
  padding: 30px;
  color: var(--mg-text-dim);
  font-style: italic;
}

/* ---------- Werewolf · Role Card ---------- */
.mg-role-card {
  background:
    linear-gradient(135deg, rgba(122, 46, 58, 0.20) 0%, rgba(19, 19, 31, 0.95) 55%, #0d0d1a 100%);
  border: 1px solid var(--mg-gold);
  border-radius: 3px;
  padding: 20px 22px;
  margin-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  box-shadow: 0 0 0 1px rgba(201, 169, 97, 0.08), 0 4px 20px rgba(0, 0, 0, 0.4);
}
.mg-role-card::before {
  content: "";
  position: absolute;
  inset: 5px;
  border: 1px solid rgba(201, 169, 97, 0.20);
  border-radius: 2px;
  pointer-events: none;
}
.mg-role-emoji { display: none; }
.mg-role-name {
  font-family: var(--mg-serif);
  color: var(--mg-gold);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.mg-role-skill {
  font-size: 12px;
  color: var(--mg-text-muted);
  font-style: italic;
  letter-spacing: 0.02em;
}

/* ---------- Werewolf · Seats ---------- */
.mg-seats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.mg-seat-card {
  background: linear-gradient(180deg, var(--mg-surface) 0%, #0f0f1a 100%);
  border: 1px solid var(--mg-border);
  border-radius: 3px;
  padding: 14px 8px 12px;
  text-align: center;
  position: relative;
  transition: all 0.2s ease;
}
.mg-seat-card.is-user {
  border-color: var(--mg-gold);
  box-shadow: 0 0 0 1px rgba(201, 169, 97, 0.18), 0 0 16px rgba(201, 169, 97, 0.18);
}
.mg-seat-card.dead {
  opacity: 0.5;
  filter: grayscale(0.6);
  background: rgba(10, 10, 20, 0.4);
}
.mg-seat-card.dead::after {
  content: "出局";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-12deg);
  font-family: var(--mg-serif);
  font-size: 14px;
  font-style: italic;
  color: rgba(196, 120, 138, 0.75);
  letter-spacing: 0.15em;
  border: 1px solid rgba(139, 58, 74, 0.5);
  padding: 2px 10px;
  border-radius: 2px;
  pointer-events: none;
}
.mg-seat-num {
  font-size: 11px;
  color: var(--mg-gold);
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.mg-seat-name {
  font-family: var(--mg-serif);
  font-size: 13px;
  color: var(--mg-text);
  margin: 5px 0 3px;
  letter-spacing: 0.03em;
}
.mg-seat-status {
  font-size: 11px;
  color: var(--mg-text-dim);
  font-style: italic;
}

/* ---------- Werewolf · Ganelog ---------- */
.mg-gamelog {
  background: linear-gradient(180deg, rgba(10, 10, 20, 0.7) 0%, rgba(13, 13, 26, 0.5) 100%);
  border: 1px solid var(--mg-border-gold);
  border-radius: 2px;
  padding: 14px 16px;
  min-height: 120px;
  max-height: 340px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.7;
}
.mg-gamelog-line {
  margin: 5px 0;
  padding: 4px 10px;
  border-radius: 2px;
  border-left: 2px solid transparent;
}
.mg-gamelog-line.dm {
  color: var(--mg-gold);
  font-family: var(--mg-serif);
  border-left-color: var(--mg-gold);
  background: rgba(201, 169, 97, 0.05);
  letter-spacing: 0.02em;
}
.mg-gamelog-line.msg {
  color: var(--mg-text);
}
.mg-gamelog-line.vote {
  color: #c4788a;
  border-left-color: var(--mg-wine-bright);
  background: rgba(139, 58, 74, 0.07);
}
.mg-gamelog-line.heart {
  color: #b57fa0;
  font-style: italic;
  opacity: 0.7;
}
.mg-gamelog-line.private {
  color: var(--mg-gold);
  font-style: italic;
  opacity: 0.85;
  border-left-color: rgba(201, 169, 97, 0.4);
}

/* ---------- Werewolf · Phase / Action ---------- */
.mg-phase-label {
  font-size: 11px;
  color: var(--mg-gold);
  margin-bottom: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-weight: 600;
}
.mg-action-panel {
  background: linear-gradient(180deg, var(--mg-surface) 0%, #0f0f1a 100%);
  border: 1px solid var(--mg-border);
  border-radius: 3px;
  padding: 14px 16px;
  margin: 12px 0;
}
.mg-action-panel-title {
  font-family: var(--mg-serif);
  font-size: 14px;
  color: var(--mg-gold);
  margin-bottom: 10px;
  letter-spacing: 0.05em;
  padding-bottom: 7px;
  border-bottom: 1px solid rgba(201, 169, 97, 0.15);
}
.mg-target-btns { display: flex; flex-wrap: wrap; gap: 7px; }
.mg-target-btn {
  background: rgba(10, 10, 20, 0.5);
  border: 1px solid var(--mg-border);
  color: var(--mg-text);
  border-radius: 2px;
  padding: 6px 13px;
  cursor: pointer;
  font-size: 13px;
  font-family: var(--mg-sans);
  transition: all 0.18s ease;
}
.mg-target-btn:hover {
  background: rgba(201, 169, 97, 0.08);
  border-color: var(--mg-gold);
  color: var(--mg-gold);
}
.mg-speak-area {
  width: 100%;
  background: rgba(10, 10, 20, 0.6);
  border: 1px solid var(--mg-border);
  border-radius: 2px;
  color: var(--mg-text);
  padding: 11px 13px;
  font-size: 14px;
  min-height: 84px;
  box-sizing: border-box;
  font-family: var(--mg-sans);
  resize: vertical;
  line-height: 1.55;
  transition: border-color 0.2s ease;
}
.mg-speak-area:focus {
  outline: none;
  border-color: var(--mg-gold);
}
.mg-speak-area::placeholder { color: var(--mg-text-dim); font-style: italic; }

/* ---------- Game Over ---------- */
.mg-game-over {
  text-align: center;
  padding: 44px 20px 28px;
}
.mg-game-over-title {
  font-family: var(--mg-serif);
  font-size: 34px;
  font-weight: 600;
  margin-bottom: 14px;
  letter-spacing: 0.08em;
  text-shadow: 0 0 24px rgba(201, 169, 97, 0.2);
}
.mg-game-over-wolf {
  color: #c4788a;
  text-shadow: 0 0 24px rgba(139, 58, 74, 0.3);
}
.mg-game-over-good {
  color: var(--mg-gold);
  text-shadow: 0 0 24px rgba(201, 169, 97, 0.3);
}

/* ---------- Translation Toggle ---------- */
.mg-trans-toggle {
  color: var(--mg-gold);
  cursor: pointer;
  font-size: 11px;
  border: 1px solid rgba(201, 169, 97, 0.5);
  border-radius: 2px;
  padding: 0 5px;
  margin-left: 6px;
  letter-spacing: 0.05em;
}
.mg-trans-toggle:hover { background: rgba(201, 169, 97, 0.1); }
.mg-trans-zh {
  color: #9a8f7a;
  margin-left: 6px;
  font-style: italic;
}
`;

  /* ============================================================
   * 状态
   * ============================================================ */
  var styleEl = null;
  var messageHandler = null; // 当前游戏的消息监听器（用于清理）
  var werewolfState = null; // 狼人杀游戏状态
  var wwLoadedPresets = []; // 狼人杀视图加载的预设列表

  /* ============================================================
   * 辅助函数
   * ============================================================ */

  // 读取自定义游戏列表
  async function getCustomGames(roche) {
    var list = await roche.storage.get(STORAGE_KEY);
    return Array.isArray(list) ? list : [];
  }

  // 保存自定义游戏列表
  async function setCustomGames(roche, games) {
    await roche.storage.set(STORAGE_KEY, games);
  }

  // 读取预设列表
  async function getPresets(roche) {
    var list = await roche.storage.get(PRESETS_KEY);
    return Array.isArray(list) ? list : [];
  }

  // 保存预设列表
  async function setPresets(roche, list) {
    await roche.storage.set(PRESETS_KEY, list);
  }

  // 读取 API 预设列表
  async function getApiPresets(roche) {
    var list = await roche.storage.get(API_PRESETS_KEY);
    return Array.isArray(list) ? list : [];
  }

  // 保存 API 预设列表
  async function setApiPresets(roche, list) {
    await roche.storage.set(API_PRESETS_KEY, list);
  }

  // 测试 API 连接并获取可用模型列表
  // baseUrl: 如 "https://api.openai.com/v1"
  // apiKey: 如 "sk-xxx"
  // 返回模型 id 数组；失败抛错
  async function fetchModels(baseUrl, apiKey) {
    var url = baseUrl.replace(/\/$/, '') + '/models';
    var res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (!data.data || !Array.isArray(data.data)) return [];
    return data.data.map(function (m) { return m.id; }).filter(Boolean).sort();
  }

  // 统一的 AI 调用封装：如果 werewolfState 选了 API 预设，注入 provider/endpoint/apiKey/model
  // 否则走默认 roche.ai.chat 行为
  async function aiChat(roche, options) {
    var opts = options || {};
    var st = werewolfState;
    if (st && st.apiPresetId) {
      try {
        var presets = await getApiPresets(roche);
        var preset = presets.find(function (p) { return p.id === st.apiPresetId; });
        if (preset) {
          opts.provider = preset.baseUrl;
          opts.endpoint = preset.baseUrl.replace(/\/$/, '') + '/chat/completions';
          opts.apiKey = preset.apiKey;
          opts.model = preset.model;
        }
      } catch (e) { /* 读取预设失败，走默认 */ }
    }
    return await roche.ai.chat(opts);
  }

  // 获取所有游戏（内置 + 自定义）
  async function getAllGames(roche) {
    var custom = await getCustomGames(roche);
    return BUILTIN_GAMES.concat(custom);
  }

  // 转义 HTML
  function esc(text) {
    var div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // 转义 HTML 并将真实换行转为 <br>，用于调试日志多行渲染（不再依赖 <pre>/white-space）
  function debugEscape(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r\n/g, '\n')
      .replace(/\n/g, '<br>');
  }

  // 将一条消息直接写入 Roche 主数据库（IndexedDB 'Roche_db' 的 messages store）
  // 用于"短期消息注入"。
  // mode: 'system' (系统通知，群聊用) | 'char' (角色消息，单聊/群聊均可用，需传 senderId 和 senderName)
  // 兼容旧调用：若 mode 为布尔值，则视为 isGroup（true → 'system'，false → 'char'）
  // 注意：此写入绕过插件 storage，卸载插件不会清除这些消息。
  function injectMessageToRoche(conversationId, text, mode, senderId, senderName) {
    // 兼容旧签名 (conversationId, text, isGroup, contactId)
    var realMode = mode;
    var realSenderId = senderId;
    var realSenderName = senderName;
    if (mode === true) {
      realMode = 'system';
    } else if (mode === false) {
      realMode = 'char';
      realSenderId = senderId || '';
      realSenderName = senderName || '游戏复盘';
    }
    if (!realSenderName) realSenderName = '游戏复盘';
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open('Roche_db');
        req.onsuccess = function () {
          var db = req.result;
          try {
            var tx = db.transaction('messages', 'readwrite');
            var store = tx.objectStore('messages');
            var now = Date.now();
            var msg;
            if (realMode === 'system') {
              // 系统通知
              msg = {
                id: now + Math.floor(Math.random() * 1000),
                isMe: false,
                text: text,
                type: 'system_notice',
                timestamp: now,
                conversationId: conversationId,
                senderId: '__system__',
                senderName: 'System'
              };
            } else {
              // 角色消息（单聊或群聊均以角色身份发送）
              msg = {
                id: now + Math.floor(Math.random() * 1000),
                isMe: false,
                text: text,
                senderId: realSenderId || '',
                timestamp: now,
                senderName: realSenderName,
                conversationId: conversationId
              };
              if (conversationId.endsWith('_offline')) {
                msg.isStreaming = false;
              }
            }
            var addReq = store.add(msg);
            addReq.onsuccess = function () { resolve(addReq.result); };
            addReq.onerror = function () { reject(addReq.error); };
          } catch (e) {
            reject(e);
          }
        };
        req.onerror = function () { reject(req.error); };
      } catch (e) {
        reject(e);
      }
    });
  }

  // 注入桥接脚本到游戏 HTML
  function prepareGameHtml(html) {
    var bridge = GAME_BRIDGE;
    if (html.indexOf("</body>") !== -1) {
      return html.replace("</body>", bridge + "</body>");
    }
    if (html.indexOf("</html>") !== -1) {
      return html.replace("</html>", bridge + "</html>");
    }
    return html + bridge;
  }

  /* ============================================================
   * 视图：游戏大厅
   * ============================================================ */
  async function showHub(container, roche) {
    var games = await getAllGames(roche);
    var customGames = games.filter(function (g) {
      return g.id.indexOf("builtin-") !== 0;
    });

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">小游戏</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="presets">预设管理</button>' +
      '<button class="mg-btn mg-btn-ghost" data-action="api-presets">API 设置</button>' +
      '<button class="mg-btn mg-btn-primary" data-action="add">添加游戏</button>' +
      '<button class="mg-btn mg-btn-ghost" data-action="close" title="关闭">关闭</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">';

    // 内置游戏
    html +=
      '<div class="mg-section-title">内置游戏</div>' +
      '<div class="mg-grid">';
    BUILTIN_GAMES.forEach(function (g) {
      html += cardHTML(g, true);
    });
    html += '</div>';

    // 自定义游戏
    html += '<div class="mg-section-title">我的游戏</div>';
    if (customGames.length === 0) {
      html +=
        '<div class="mg-empty">' +
        '<div class="mg-empty-icon"></div>' +
        '<div>还没有自定义游戏，点击右上角「添加游戏」来添加你的第一个游戏吧</div>' +
        '</div>';
    } else {
      html += '<div class="mg-grid">';
      customGames.forEach(function (g) {
        html += cardHTML(g, false);
      });
      html += '</div>';
    }

    html += '</div></div>';

    container.innerHTML = html;

    // 绑定事件
    container.querySelector('[data-action="presets"]').onclick = function () {
      showPresets(container, roche);
    };
    container.querySelector('[data-action="api-presets"]').onclick = function () {
      showApiPresets(container, roche);
    };
    container.querySelector('[data-action="add"]').onclick = function () {
      showForm(container, roche, null);
    };
    container.querySelector('[data-action="close"]').onclick = function () {
      roche.ui.closeApp();
    };

    // 绑定卡片事件
    var cards = container.querySelectorAll('.mg-card');
    cards.forEach(function (card) {
      var gameId = card.dataset.id;
      var game = games.find(function (g) { return g.id === gameId; });
      if (!game) return;

      var playBtn = card.querySelector('[data-action="play"]');
      if (playBtn) playBtn.onclick = function () {
        if (game.isNative) {
          showWerewolfGame(container, roche);
          return;
        }
        if (game.isPlaceholder) {
          roche.ui.toast("即将推出");
          return;
        }
        showGame(container, roche, game);
      };

      var editBtn = card.querySelector('[data-action="edit"]');
      if (editBtn) editBtn.onclick = function (e) {
        e.stopPropagation();
        showForm(container, roche, game);
      };

      var delBtn = card.querySelector('[data-action="delete"]');
      if (delBtn) delBtn.onclick = function (e) {
        e.stopPropagation();
        confirmDelete(container, roche, game);
      };
    });
  }

  // 生成卡片 HTML
  function cardHTML(game, isBuiltin) {
    var playBtnText = game.isPlaceholder ? '即将推出' : '开始游戏';
    var playBtnAttr = game.isPlaceholder ? ' disabled style="opacity:.5;cursor:default"' : '';
    var actions =
      '<div class="mg-card-btns">' +
      '<button class="mg-btn mg-btn-primary mg-btn-sm" data-action="play"' + playBtnAttr + '>' + playBtnText + '</button>' +
      '</div>';

    var badge = isBuiltin
      ? '<span class="mg-badge">内置</span>'
      : '<div class="mg-card-manage">' +
        '<button data-action="edit" title="编辑">编</button>' +
        '<button data-action="delete" title="删除">删</button>' +
        '</div>';

    return (
      '<div class="mg-card" data-id="' + esc(game.id) + '">' +
      badge +
      '<div class="mg-card-name">' + esc(game.name) + '</div>' +
      '<div class="mg-card-desc">' + esc(game.description || '') + '</div>' +
      actions +
      '</div>'
    );
  }

  /* ============================================================
   * 视图：游戏播放
   * ============================================================ */
  function showGame(container, roche, game) {
    var gameId = game.id;

    // 设置消息桥接处理器
    messageHandler = async function (event) {
      var msg = event.data;
      if (!msg || msg.type !== 'roche-game-req') return;

      var iframe = container.querySelector('.mg-game-frame');
      if (!iframe || !iframe.contentWindow) return;

      var result = null;
      var error = null;

      try {
        switch (msg.action) {
          case 'ai-chat':
            result = await roche.ai.chat({
              messages: msg.data.messages,
              temperature: (msg.data.options && msg.data.options.temperature) || 0.7
            });
            break;
          case 'toast':
            roche.ui.toast(msg.data.message);
            result = { ok: true };
            break;
          case 'storage-get':
            result = await roche.storage.get('game:' + gameId + ':' + msg.data.key);
            break;
          case 'storage-set':
            await roche.storage.set('game:' + gameId + ':' + msg.data.key, msg.data.value);
            result = { ok: true };
            break;
          case 'get-persona':
            result = await roche.persona.getActiveUserPersona();
            break;
          case 'get-characters':
            result = await roche.character.list();
            break;
          case 'search-memory':
            result = await roche.memory.search({
              query: msg.data.query,
              limit: msg.data.limit || 20
            });
            break;
          default:
            error = 'unknown action: ' + msg.action;
        }
      } catch (e) {
        error = e.message || String(e);
      }

      iframe.contentWindow.postMessage({
        type: 'roche-game-resp',
        id: msg.id,
        result: result,
        error: error
      }, '*');
    };
    window.addEventListener('message', messageHandler);

    // 渲染游戏视图
    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-game-view">' +
      '<div class="mg-game-bar">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回大厅">返回</button>' +
      '<span class="mg-game-bar-title">' + esc(game.name) + '</span>' +
      '<button class="mg-btn mg-btn-ghost" data-action="close" title="关闭">关闭</button>' +
      '</div>' +
      '<iframe class="mg-game-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>' +
      '</div>' +
      '</div>';

    container.innerHTML = html;

    // 设置 iframe
    var iframe = container.querySelector('.mg-game-frame');
    iframe.srcdoc = prepareGameHtml(game.html || '');

    // 绑定按钮
    container.querySelector('[data-action="back"]').onclick = function () {
      cleanupGame();
      showHub(container, roche);
    };
    container.querySelector('[data-action="close"]').onclick = function () {
      cleanupGame();
      roche.ui.closeApp();
    };
  }

  // 清理游戏资源
  function cleanupGame() {
    if (messageHandler) {
      window.removeEventListener('message', messageHandler);
      messageHandler = null;
    }
  }

  /* ============================================================
   * 视图：狼人杀（原生游戏，不走 iframe）
   * ============================================================ */
  async function showWerewolfGame(container, roche) {
    if (!werewolfState) {
      werewolfState = { phase: "setup" };
    }
    if (werewolfState.phase === "play") {
      renderWerewolfPlay(container, roche);
    } else {
      await renderWerewolfSetup(container, roche);
    }
  }

  // 渲染设置界面
  async function renderWerewolfSetup(container, roche) {
    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">狼人杀</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回">返回</button>' +
      '<button class="mg-btn mg-btn-ghost" data-action="close" title="关闭">关闭</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">' +
      '<div class="mg-form-wrap">' +
      '<div class="mg-field">' +
      '<label class="mg-label">预设</label>' +
      '<select class="mg-input" id="ww-preset"><option value="">加载中...</option></select>' +
      '<div class="mg-hint">选择预设后会自动填充下方角色；仍可手动调整</div>' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">参与角色 (多选)</label>' +
      '<div class="mg-check-list" id="ww-chars"><div class="mg-loading">加载中...</div></div>' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">玩家人数</label>' +
      '<select class="mg-input" id="ww-count">' +
      '<option value="6">6人</option>' +
      '<option value="7">7人</option>' +
      '<option value="8">8人</option>' +
      '<option value="9">9人</option>' +
      '</select>' +
      '<div class="mg-hint" id="ww-composition"></div>' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">AI 演算模式</label>' +
      '<select class="mg-input" id="ww-mode">' +
      '<option value="batch">批量模式（一次演算多个 char）</option>' +
      '<option value="polling">单个轮询模式（每个 char 独立演算，视野隔离）</option>' +
      '</select>' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label"><input type="checkbox" id="ww-spectator"> 旁观模式</label>' +
      '<div class="mg-hint">开启后你以第三人称旁观：所有角色由 AI 操控，你以第三人称旁观全场（含心声与夜间行动）</div>' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">API 预设</label>' +
      '<select class="mg-input" id="ww-api-preset"><option value="">加载中...</option></select>' +
      '<div class="mg-hint">选择已配置的 API 预设后，所有 AI 调用将走该 API；不选则使用 Roche 默认 AI。可在「API 设置」中创建预设</div>' +
      '</div>' +
      '<div class="mg-form-actions">' +
      '<button class="mg-btn mg-btn-primary" data-action="start">开始游戏</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    container.innerHTML = html;

    // 绑定头部按钮
    container.querySelector('[data-action="back"]').onclick = function () {
      werewolfState = null;
      showHub(container, roche);
    };
    container.querySelector('[data-action="close"]').onclick = function () {
      roche.ui.closeApp();
    };

    // 检查是否有未结束的存档，若有则在顶部显示"继续上次游戏"按钮
    try {
      var saved = await roche.storage.get('ww-save');
      if (saved) {
        var contentEl = container.querySelector('.mg-content');
        var formWrap = container.querySelector('.mg-form-wrap');
        if (contentEl && formWrap) {
          var resumeBar = document.createElement('div');
          resumeBar.className = 'mg-form-actions';
          resumeBar.style.marginBottom = '18px';
          resumeBar.style.padding = '14px 16px';
          resumeBar.style.background = 'linear-gradient(180deg, rgba(58,53,32,0.18) 0%, rgba(122,46,58,0.10) 100%)';
          resumeBar.style.border = '1px solid rgba(201,169,97,0.35)';
          resumeBar.style.borderRadius = '3px';
          resumeBar.innerHTML = '<div style="margin-bottom:10px;color:#c9a961;font-family:Georgia,serif;letter-spacing:0.05em;">检测到上次未结束的游戏</div>' +
            '<button class="mg-btn mg-btn-primary" data-action="resume">继续上次游戏</button>';
          contentEl.insertBefore(resumeBar, formWrap);
          resumeBar.querySelector('[data-action="resume"]').onclick = async function () {
            var loaded = await loadWerewolfState(roche);
            if (loaded && werewolfState && werewolfState.phase === 'play') {
              if (werewolfState.gameOver) {
                // 已结束的存档直接显示结束界面
                renderWerewolfPlay(container, roche);
                return;
              }
              if (werewolfState.subPhase) {
                // 中途恢复：从当前阶段继续
                werewolfState.gameLoopRunning = true;
                renderWerewolfPlay(container, roche);
                startGameLoop(container, roche);
              } else {
                // 刚发牌未开始，显示"进入夜晚"按钮
                renderWerewolfPlay(container, roche);
              }
            } else {
              roche.ui.toast('存档无法恢复');
            }
          };
        }
      }
    } catch (e) { /* 忽略存档检测错误 */ }

    // 加载预设
    var presetSel = container.querySelector('#ww-preset');
    try {
      wwLoadedPresets = await getPresets(roche);
    } catch (e) {
      wwLoadedPresets = [];
    }
    if (!Array.isArray(wwLoadedPresets)) wwLoadedPresets = [];
    var presetOpts = '<option value="">（不使用预设）</option>';
    wwLoadedPresets.forEach(function (p) {
      presetOpts += '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    });
    presetSel.innerHTML = presetOpts;

    // 加载 API 预设列表到下拉
    var apiPresetSel = container.querySelector('#ww-api-preset');
    var wwLoadedApiPresets = [];
    try {
      wwLoadedApiPresets = await getApiPresets(roche);
    } catch (e) {
      wwLoadedApiPresets = [];
    }
    if (!Array.isArray(wwLoadedApiPresets)) wwLoadedApiPresets = [];
    var apiOpts = '<option value="">（使用 Roche 默认 AI）</option>';
    wwLoadedApiPresets.forEach(function (p) {
      apiOpts += '<option value="' + esc(p.id) + '">' + esc(p.name || '未命名') + ' · ' + esc(p.model || '') + '</option>';
    });
    apiPresetSel.innerHTML = apiOpts;
    // 如果当前 werewolfState 已选过预设，恢复选择
    if (werewolfState && werewolfState.apiPresetId) {
      apiPresetSel.value = werewolfState.apiPresetId;
    }

    // 预设变化时自动勾选角色
    presetSel.onchange = function () {
      var pid = presetSel.value;
      if (!pid) return;
      var preset = wwLoadedPresets.find(function (p) { return p.id === pid; });
      if (!preset) return;
      var charIds = Array.isArray(preset.charIds) ? preset.charIds : [];
      var checks = container.querySelectorAll('#ww-chars input[type="checkbox"]');
      checks.forEach(function (cb) {
        cb.checked = (charIds.indexOf(cb.value) !== -1);
      });
    };

    // 加载角色列表
    var charsBox = container.querySelector('#ww-chars');
    var characters = [];
    try {
      characters = await roche.character.list();
    } catch (e) {
      characters = [];
    }
    if (!Array.isArray(characters)) characters = [];
    var charsHtml = '';
    if (characters.length === 0) {
      charsHtml = '<div class="mg-loading">暂无角色</div>';
    } else {
      characters.forEach(function (c) {
        var cid = esc(c.id || '');
        var cname = esc(c.handle || c.name || '未命名');
        charsHtml +=
          '<div class="mg-check-item">' +
          '<label><input type="checkbox" value="' + cid + '">' + cname + '</label>' +
          '</div>';
      });
    }
    charsBox.innerHTML = charsHtml;

    // 玩家人数变化时更新角色构成提示
    var countSel = container.querySelector('#ww-count');
    countSel.value = '6';
    var compositionEl = container.querySelector('#ww-composition');
    function updateComposition() {
      var count = parseInt(countSel.value, 10);
      compositionEl.textContent = getRoleCompositionText(count);
    }
    countSel.onchange = updateComposition;
    updateComposition();

    // 默认演算模式 polling
    container.querySelector('#ww-mode').value = 'polling';

    // 开始游戏
    container.querySelector('[data-action="start"]').onclick = async function () {
      var presetId = presetSel.value;
      var preset = presetId ? wwLoadedPresets.find(function (p) { return p.id === presetId; }) : null;
      var checkedIds = [];
      var checks = charsBox.querySelectorAll('input[type="checkbox"]:checked');
      checks.forEach(function (cb) { checkedIds.push(cb.value); });
      var count = parseInt(countSel.value, 10);
      var mode = container.querySelector('#ww-mode').value;
      var spectator = container.querySelector('#ww-spectator') ? container.querySelector('#ww-spectator').checked : false;
      var apiPresetId = container.querySelector('#ww-api-preset') ? container.querySelector('#ww-api-preset').value : '';

      if (spectator) {
        if (checkedIds.length !== count) {
          roche.ui.toast("旁观模式需要选择 " + count + " 个角色（共 " + count + " 人，你不参与）");
          return;
        }
      } else {
        if (checkedIds.length !== count - 1) {
          roche.ui.toast("需要选择 " + (count - 1) + " 个角色（加你共 " + count + " 人）");
          return;
        }
      }

      // 开新局前清除旧存档
      await clearWerewolfSave(roche);

      // 获取用户人设
      var userPersona = null;
      try {
        userPersona = await roche.persona.getActiveUserPersona();
      } catch (e) {
        userPersona = null;
      }
      var userPersonaText = (userPersona && (userPersona.persona || userPersona.bio)) || "";
      var userName = (userPersona && (userPersona.handle || userPersona.name)) || "你";
      var userAvatar = (userPersona && userPersona.avatar) || "";

      // 获取角色详情
      var charDetails = [];
      for (var i = 0; i < checkedIds.length; i++) {
        try {
          var cd = await roche.character.get(checkedIds[i]);
          charDetails.push(cd);
        } catch (e) {
          charDetails.push({ id: checkedIds[i], name: '角色' + checkedIds[i] });
        }
      }

      // 构建玩家列表（旁观模式：仅 chars；非旁观：user + chars）
      var allPlayers = [];
      if (!spectator) {
        allPlayers.push({
          id: "user",
          name: userName,
          realName: (userPersona && userPersona.name) || "",
          handle: (userPersona && userPersona.handle) || "",
          isUser: true,
          personaText: userPersonaText,
          avatar: userAvatar
        });
      }
      charDetails.forEach(function (cd) {
        allPlayers.push({
          id: cd.id,
          name: cd.handle || cd.name || ('角色' + cd.id),
          realName: cd.name || "",
          handle: cd.handle || "",
          isUser: false,
          personaText: cd.persona || cd.bio || "",
          avatar: cd.avatar || ""
        });
      });

      // 真随机：rolePool 与 seatOrder 双重洗牌，user 角色均匀分布（6人局2/6概率狼人）
      // 构建角色池并洗牌
      var rolePool = getRolePool(count);
      shuffleArray(rolePool);

      // 洗牌座位顺序
      var seatOrder = [];
      for (var s = 0; s < count; s++) seatOrder.push(s);
      shuffleArray(seatOrder);

      // 分配座位和角色
      var userSeat = 0;
      var userRole = "";
      for (var p = 0; p < count; p++) {
        var playerIdx = seatOrder[p];
        var player = allPlayers[playerIdx];
        player.seat = p + 1;
        player.role = rolePool[p];
        player.alive = true;
        if (player.isUser) {
          userSeat = p + 1;
          userRole = player.role;
        }
      }

      // 构建 conversation → char 映射（用于记忆加载）
      // 群聊会话适用于所有 char；私聊会话（contactId===charId）仅适用于该 char
      var convMap = {};
      try {
        var conversations = await roche.conversation.list();
        if (Array.isArray(conversations)) {
          conversations.forEach(function (conv) {
            var convId = conv.id || conv.conversationId;
            if (!convId) return;
            if (conv.isGroup) {
              // 仅映射给实际属于该群成员的 char，避免群聊记忆泄漏给非群内角色
              var memberIds = conv.members || [];
              if (Array.isArray(memberIds) && memberIds.length > 0) {
                allPlayers.forEach(function (p) {
                  if (!p.isUser && memberIds.indexOf(p.id) !== -1) {
                    if (!convMap[p.id]) convMap[p.id] = [];
                    convMap[p.id].push(convId);
                  }
                });
              } else if (conv.memberProfiles && Array.isArray(conv.memberProfiles)) {
                // 退路：使用 memberProfiles 提取 id
                var profileIds = conv.memberProfiles.map(function (m) { return m.id; });
                allPlayers.forEach(function (p) {
                  if (!p.isUser && profileIds.indexOf(p.id) !== -1) {
                    if (!convMap[p.id]) convMap[p.id] = [];
                    convMap[p.id].push(convId);
                  }
                });
              }
              // 若群聊无成员信息，则不映射给任何人（比映射给全部更安全）
            } else if (conv.contactId) {
              if (!convMap[conv.contactId]) convMap[conv.contactId] = [];
              convMap[conv.contactId].push(convId);
            }
          });
        }
      } catch (e) {
        convMap = {};
      }

      werewolfState = {
        phase: "play",
        day: 0,
        mode: mode,
        spectator: spectator,
        preset: preset || null,
        count: count,
        players: allPlayers,
        userSeat: userSeat,
        userRole: userRole,
        publicLog: [],
        gamelogLines: [],
        charHistory: {},
        nightActions: null,
        pendingDeaths: [],
        subPhase: null,
        gameOver: false,
        winner: null,
        speakIndex: 0,
        convMap: convMap,
        memoryCache: {},
        witchSaveUsed: false,
        witchPoisonUsed: false,
        gameLoopRunning: false,
        debugLog: [],
        debriefs: null,
        charMemories: null,
        apiPresetId: apiPresetId || null
      };

      // 发牌完成后保存初始存档
      saveWerewolfState(roche);

      renderWerewolfPlay(container, roche);
    };
  }

  // 渲染游戏界面（play 阶段）
  function renderWerewolfPlay(container, roche) {
    var st = werewolfState;

    if (st.gameOver) {
      renderGameOver(container, roche);
      return;
    }

    var skillText = getRoleSkillText(st.userRole);

    var seatsHtml = '';
    st.players.forEach(function (p) {
      var cls = 'mg-seat-card';
      if (!p.alive) cls += ' dead';
      if (p.isUser) cls += ' is-user';
      var status = p.alive ? '存活' : '已出局';
      if (st.spectator) status += ' · ' + p.role;
      seatsHtml +=
        '<div class="' + cls + '">' +
        '<div class="mg-seat-num">' + p.seat + '号</div>' +
        '<div class="mg-seat-name">' + esc(p.name) + '</div>' +
        '<div class="mg-seat-status">' + esc(status) + '</div>' +
        '</div>';
    });

    // 从 gamelogLines 渲染（仅 dm/msg/vote/private，不含 heart；heart 仅进 debugLog）
    // 旁观模式下 heart 也显示在主 gamelog（上帝视角）
    var logHtml = '';
    if (Array.isArray(st.gamelogLines)) {
      st.gamelogLines.forEach(function (line) {
        if (line.cls === 'heart' && !st.spectator) return; // 心声不显示在主 gamelog（旁观模式除外）
        logHtml += formatGamelogLineHTML(line);
      });
    }

    // 阶段标签
    var phaseName = '';
    if (st.subPhase === 'night') phaseName = '夜晚';
    else if (st.subPhase === 'day_speak') phaseName = '白天发言';
    else if (st.subPhase === 'day_vote') phaseName = '投票';
    var phaseLabel = '当前：第' + st.day + '天' + (phaseName ? ' ' + phaseName : ' 准备中');

    // 按钮：游戏进行中（gameLoopRunning 或 subPhase 已设置）显示"游戏进行中"，否则显示"进入夜晚"
    var buttonHtml = '';
    if (st.gameLoopRunning || st.subPhase) {
      buttonHtml = '<div class="mg-hint">游戏进行中…</div>';
    } else if (!st.gameOver) {
      buttonHtml = '<button class="mg-btn mg-btn-primary" data-action="night">进入夜晚</button>';
    }

    // 狼人同伴行（仅当 user 是狼人时显示）
    var fellowWolvesLine = '';
    if (st.userRole === '狼人') {
      var fellowWolves = st.players.filter(function (p) {
        return p.role === '狼人' && !p.isUser;
      });
      if (fellowWolves.length > 0) {
        fellowWolvesLine = '<div>同伴：<b>' + fellowWolves.map(function (p) { return p.seat + '号'; }).join('、') + '</b></div>';
      }
    }

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">狼人杀 · 第 ' + st.day + ' 天</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回大厅">返回大厅</button>' +
      '<button class="mg-btn mg-btn-ghost" data-action="close" title="关闭">关闭</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">' +
      '<div class="mg-form-wrap">' +
      '<div class="mg-role-card">' +
      '<div class="mg-role-emoji"></div>' +
      (st.spectator
        ? '<div class="mg-role-name">旁观模式 — 上帝视角</div><div class="mg-role-skill">你以第三人称旁观全场，所有角色由 AI 操控</div>'
        : '<div>你的座位号：<b>' + st.userSeat + '</b></div>' +
          '<div>你的底牌：<b class="mg-role-name">' + esc(st.userRole) + '</b></div>' +
          fellowWolvesLine +
          '<div class="mg-role-skill">' + esc(skillText) + '</div>'
      ) +
      '</div>' +
      '<div class="mg-phase-label" id="ww-phase-label">' + esc(phaseLabel) + '</div>' +
      '<div class="mg-seats-grid" id="ww-seats-grid">' + seatsHtml + '</div>' +
      '<div class="mg-gamelog" id="ww-gamelog">' + logHtml + '</div>' +
      '<div id="ww-action-panel"></div>' +
      '<div class="mg-form-actions">' + buttonHtml + '</div>' +
      '</div>' +
      '</div>' +
      '<div id="ww-debug-panel" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(5,7,15,0.72);z-index:9999;align-items:center;justify-content:center;">' +
      '<div style="display:flex;flex-direction:column;width:90%;max-width:640px;height:75%;background:linear-gradient(160deg,#11172a,#0a0e1a);border:1px solid rgba(201,169,97,0.4);border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.7);overflow:hidden;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(201,169,97,0.2);">' +
      '<span style="color:#c9a961;font-weight:600;font-family:Georgia,serif;letter-spacing:0.05em;">系统日志</span>' +
      '<button class="mg-btn mg-btn-ghost mg-btn-sm" data-action="close-debug">关闭日志</button>' +
      '</div>' +
      '<div id="ww-debug-panel-content" style="flex:1;overflow-y:auto;padding:12px 16px;"></div>' +
      '</div>' +
      '</div>' +
      '</div>';

    container.innerHTML = html;
    st._container = container;

    // 双击标题打开系统日志（隐藏入口）
    var titleEl = container.querySelector('.mg-title');
    if (titleEl) {
      titleEl.style.cursor = 'pointer';
      titleEl.title = '双击打开系统日志';
      titleEl.ondblclick = function () {
        var panel = container.querySelector('#ww-debug-panel');
        if (!panel) return;
        if (panel.style.display === 'none' || !panel.style.display) {
          renderDebugPanelContent(container);
          panel.style.display = 'flex';
        } else {
          panel.style.display = 'none';
        }
      };
    }

    // 恢复 gamelog 滚动位置（若有保存），否则滚到底部
    var logEl = container.querySelector('#ww-gamelog');
    if (logEl) {
      if (st._gamelogScroll != null) {
        logEl.scrollTop = st._gamelogScroll;
      } else {
        logEl.scrollTop = logEl.scrollHeight;
      }
      // 监听滚动以保存位置（标记位避免重复绑定）
      if (!logEl._wwScrollBound) {
        logEl.addEventListener('scroll', function () {
          if (werewolfState) werewolfState._gamelogScroll = logEl.scrollTop;
        });
        logEl._wwScrollBound = true;
      }
    }

    // 返回大厅（需确认）
    container.querySelector('[data-action="back"]').onclick = async function () {
      var ok = await roche.ui.confirm({
        title: '退出游戏',
        message: '确定退出本局？'
      });
      if (!ok) return;
      werewolfState = null;
      showHub(container, roche);
    };
    container.querySelector('[data-action="close"]').onclick = function () {
      roche.ui.closeApp();
    };

    // 系统日志面板切换
    var debugBtn = container.querySelector('[data-action="debug"]');
    if (debugBtn) {
      debugBtn.onclick = function () {
        var panel = container.querySelector('#ww-debug-panel');
        if (!panel) return;
        if (panel.style.display === 'none' || !panel.style.display) {
          renderDebugPanelContent(container);
          panel.style.display = 'flex';
        } else {
          panel.style.display = 'none';
        }
      };
    }
    var closeDebugBtn = container.querySelector('[data-action="close-debug"]');
    if (closeDebugBtn) {
      closeDebugBtn.onclick = function () {
        var panel = container.querySelector('#ww-debug-panel');
        if (panel) panel.style.display = 'none';
      };
    }

    // "译"切换的事件委托（容器级，只挂一次）
    if (!container._wwTransDelegation) {
      container.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.classList && t.classList.contains('mg-trans-toggle')) {
          var id = t.getAttribute('data-tr');
          var zh = id ? document.getElementById(id) : null;
          if (zh) {
            var showDisplay = zh.getAttribute('data-display') || 'inline';
            zh.style.display = (zh.style.display === 'none' || !zh.style.display) ? showDisplay : 'none';
          }
        }
      });
      container._wwTransDelegation = true;
    }

    // 进入夜晚按钮 → 启动游戏循环
    var nightBtn = container.querySelector('[data-action="night"]');
    if (nightBtn) {
      nightBtn.onclick = function () {
        st.gameLoopRunning = true;
        startGameLoop(container, roche);
      };
    }
  }

  // 重新渲染 play 屏幕（不重置状态）
  // 仅增量更新座位网格与阶段标签，不重建 gamelog，避免滚动位置丢失
  function rerenderPlay(container, roche) {
    var st = werewolfState;
    if (!st) return;

    var seatsGridEl = container.querySelector('#ww-seats-grid');
    if (seatsGridEl) {
      var seatsHtml = '';
      st.players.forEach(function (p) {
        var cls = 'mg-seat-card';
        if (!p.alive) cls += ' dead';
        if (p.isUser) cls += ' is-user';
        var status = p.alive ? '存活' : '已出局';
        if (st.spectator) status += ' · ' + p.role;
        seatsHtml +=
          '<div class="' + cls + '">' +
          '<div class="mg-seat-num">' + p.seat + '号</div>' +
          '<div class="mg-seat-name">' + esc(p.name) + '</div>' +
          '<div class="mg-seat-status">' + esc(status) + '</div>' +
          '</div>';
      });
      seatsGridEl.innerHTML = seatsHtml;
    }

    var phaseLabelEl = container.querySelector('#ww-phase-label');
    if (phaseLabelEl) {
      var phaseName = '';
      if (st.subPhase === 'night') phaseName = '夜晚';
      else if (st.subPhase === 'day_speak') phaseName = '白天发言';
      else if (st.subPhase === 'day_vote') phaseName = '投票';
      var phaseLabel = '当前：第' + st.day + '天' + (phaseName ? ' ' + phaseName : ' 准备中');
      phaseLabelEl.textContent = phaseLabel;
    }
    // 不重建 gamelog；appendGamelog 已增量更新
  }

  // 向 gamelog 追加一行：写入 gamelogLines + DOM；非 heart/private 也写入 publicLog
  // zhText 可选：若提供且非空且与 text 不同，渲染"译"切换
  function appendGamelog(container, text, cls, zhText) {
    var st = werewolfState;
    if (!st.gamelogLines) st.gamelogLines = [];
    st.gamelogLines.push({ text: text, cls: cls || 'msg', zhText: zhText || '' });
    if (cls !== 'heart' && cls !== 'private' && cls !== 'transition') {
      st.publicLog.push(text);
    }
    var logEl = container.querySelector('#ww-gamelog');
    if (logEl) {
      // 仅当用户已在底部附近时才自动滚动，否则保留其滚动位置
      var wasNearBottom = (logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight) < 80;
      var div = document.createElement('div');
      div.className = 'mg-gamelog-line ' + (cls === 'private' ? 'dm' : (cls || 'msg'));
      if (zhText && zhText.trim() && zhText !== text) {
        div.innerHTML = formatTranslatable(text, zhText);
      } else {
        div.textContent = text;
      }
      logEl.appendChild(div);
      if (wasNearBottom) logEl.scrollTop = logEl.scrollHeight;
    }
  }

  // 追加调试日志（仅写入 debugLog，不显示在主 gamelog）
  // 旁观模式下心声也同步显示在主 gamelog（上帝视角）
  function appendDebug(type, charName, text, zhText) {
    var st = werewolfState;
    if (!st) return;
    if (!st.debugLog) st.debugLog = [];
    st.debugLog.push({ type: type, charName: charName || '', text: text || '', zhText: zhText || '' });
    if (st.spectator && st._container && type === 'heart' && text) {
      appendGamelog(st._container, '[' + (charName || '') + ' 心声] ' + text, 'heart', zhText || '');
    }
  }

  // 保存当前游戏状态到 storage（fire-and-forget，不阻塞主流程）
  function saveWerewolfState(roche) {
    if (!werewolfState || !roche || !roche.storage) return;
    try {
      roche.storage.set('ww-save', JSON.stringify(werewolfState));
    } catch (e) { /* 忽略存储错误，存档失败不应影响游戏 */ }
  }

  // 从 storage 加载游戏状态
  async function loadWerewolfState(roche) {
    if (!roche || !roche.storage) return false;
    try {
      var s = await roche.storage.get('ww-save');
      if (s) {
        werewolfState = JSON.parse(s);
        // 设置恢复阶段标记，供各 run 函数跳过重复公告；清除旧标记
        werewolfState._resumePhase = werewolfState.subPhase || null;
        werewolfState._savedAfterPhase = null;
        return true;
      }
    } catch (e) { /* 忽略 */ }
    return false;
  }

  // 清除存档
  async function clearWerewolfSave(roche) {
    if (!roche || !roche.storage) return;
    try {
      if (typeof roche.storage.delete === 'function') {
        await roche.storage.delete('ww-save');
      } else {
        // 退路：用空值覆盖，使存档检测不再命中
        await roche.storage.set('ww-save', null);
      }
    } catch (e) { /* 忽略 */ }
  }

  // 可翻译文本渲染：若有 zhText 则返回带"译"切换的 HTML，否则返回转义文本
  function formatTranslatable(text, zhText) {
    if (zhText && zhText.trim() && zhText !== text) {
      var id = 'tr-' + Math.random().toString(36).slice(2, 8);
      return esc(text) + ' <span class="mg-trans-toggle" data-tr="' + id + '" style="color:#c9a961;cursor:pointer;font-size:11px;border:1px solid rgba(201,169,97,0.5);border-radius:3px;padding:0 5px;margin-left:6px;letter-spacing:0.05em;">译</span>' +
        '<span class="mg-trans-zh" id="' + id + '" style="display:none;color:#9a8f7a;margin-left:6px;font-style:italic;">（' + esc(zhText) + '）</span>';
    }
    return esc(text);
  }

  // 生成 gamelog 一行的 HTML（用于批量重渲染）
  function formatGamelogLineHTML(line) {
    var renderCls = line.cls === 'private' ? 'dm' : (line.cls || 'msg');
    var zh = line.zhText || '';
    var content = (zh && zh.trim() && zh !== line.text) ? formatTranslatable(line.text, zh) : esc(line.text);
    return '<div class="mg-gamelog-line ' + renderCls + '">' + content + '</div>';
  }

  // 渲染调试日志面板内容
  // 使用 debugEscape 转义并将真实换行转为 <br>，多行 JSON 可靠换行（不依赖 <pre>/white-space）
  function renderDebugPanelContent(container) {
    var st = werewolfState;
    if (!st || !st.debugLog) return;
    var contentEl = container.querySelector('#ww-debug-panel-content');
    if (!contentEl) return;
    var html = '';
    st.debugLog.forEach(function (entry) {
      var color = '#6a6557';
      if (entry.type === 'prompt') color = '#5b7fa8';
      else if (entry.type === 'response') color = '#e8e4d8';
      else if (entry.type === 'thinking') color = '#7a8fb5';
      else if (entry.type === 'heart') color = '#b57fa0';
      else if (entry.type === 'action') color = '#c9a961';
      else if (entry.type === 'system') color = '#6a6557';
      var label = '[' + entry.type + '] ' + debugEscape(entry.charName || '');
      var textHtml;
      if (entry.type === 'heart' && entry.zhText && entry.zhText.trim() && entry.zhText !== entry.text) {
        // 心声带翻译：内联 formatTranslatable 的逻辑但使用 debugEscape 以保留换行
        var id = 'tr-' + Math.random().toString(36).slice(2, 8);
        textHtml = debugEscape(entry.text) + ' <span class="mg-trans-toggle" data-tr="' + id + '" style="color:#c9a961;cursor:pointer;font-size:11px;border:1px solid rgba(201,169,97,0.5);border-radius:3px;padding:0 5px;margin-left:6px;letter-spacing:0.05em;">译</span>' +
          '<span class="mg-trans-zh" id="' + id + '" style="display:none;color:#9a8f7a;margin-left:6px;font-style:italic;">（' + debugEscape(entry.zhText) + '）</span>';
      } else {
        textHtml = '<span>' + debugEscape(entry.text) + '</span>';
      }
      html += '<div style="margin:6px 0;padding:6px 0;border-bottom:1px solid rgba(201,169,97,0.12);">' +
        '<div style="color:' + color + ';font-size:11px;font-weight:600;letter-spacing:0.03em;">' + label + '</div>' +
        '<div style="margin:3px 0 0;word-break:break-word;font-family:\'Cascadia Code\',\'Fira Code\',monospace;font-size:11px;color:#9a8f7a;line-height:1.5;">' + textHtml + '</div>' +
        '</div>';
    });
    contentEl.innerHTML = html;
    contentEl.scrollTop = contentEl.scrollHeight;
  }

  // 追加 char 历史（仅该 char 自己的过去）
  function appendCharHistory(charId, round, phase, type, content) {
    var st = werewolfState;
    if (!st.charHistory) st.charHistory = {};
    if (!st.charHistory[charId]) st.charHistory[charId] = [];
    st.charHistory[charId].push({
      round: round,
      phase: phase,
      type: type,
      content: content
    });
  }

  // 游戏结束判定
  function checkGameOver(roche) {
    var st = werewolfState;
    var aliveWolves = st.players.filter(function (p) { return p.alive && p.role === '狼人'; }).length;
    var aliveGood = st.players.filter(function (p) { return p.alive && p.role !== '狼人'; }).length;
    if (aliveWolves === 0) {
      st.gameOver = true;
      st.winner = '好人';
      return true;
    }
    if (aliveWolves >= aliveGood) {
      st.gameOver = true;
      st.winner = '狼人';
      return true;
    }
    return false;
  }

  // 渲染游戏结束界面（含角色记忆生成）
  async function renderGameOver(container, roche) {
    var st = werewolfState;
    if (!st) return;
    // 若记忆正在生成，避免重入
    if (st._debriefInProgress) return;

    // 游戏结束，清除存档（fire-and-forget，不阻塞记忆生成）
    clearWerewolfSave(roche);

    renderGameOverScreen(container, roche);

    // 若角色记忆尚未生成，单次批量调用生成
    if (!st.charMemories) {
      st._debriefInProgress = true;
      st.charMemories = [];
      renderGameOverScreen(container, roche);
      try {
        if (!werewolfState) return;
        st.charMemories = await generateCharMemories(roche);
      } catch (e) {
        appendDebug('system', '记忆', 'error: ' + (e && e.message || e));
        st.charMemories = [];
      }
      if (!werewolfState) return;
      renderGameOverScreen(container, roche);
      st._debriefInProgress = false;
    }
  }

  // 渲染游戏结束界面的静态部分（每次记忆进度更新都重渲染）
  function renderGameOverScreen(container, roche) {
    var st = werewolfState;
    if (!st) return;
    var winnerClass = st.winner === '狼人' ? 'mg-game-over-wolf' : 'mg-game-over-good';
    var winnerText = (st.winner || '') + '阵营胜利！';

    var seatsHtml = '';
    st.players.forEach(function (p) {
      var cls = 'mg-seat-card';
      if (!p.alive) cls += ' dead';
      if (p.isUser) cls += ' is-user';
      seatsHtml +=
        '<div class="' + cls + '">' +
        '<div class="mg-seat-num">' + p.seat + '号</div>' +
        '<div class="mg-seat-name">' + esc(p.name) + '</div>' +
        '<div class="mg-seat-status">' + esc(p.role) + '</div>' +
        '</div>';
    });

    var logHtml = '';
    if (Array.isArray(st.gamelogLines)) {
      st.gamelogLines.forEach(function (line) {
        if (line.cls === 'heart' && !st.spectator) return; // 心声不显示（旁观模式除外）
        logHtml += formatGamelogLineHTML(line);
      });
    }

    // 角色记忆卡片区域
    var memoriesHtml = '';
    if (!st.charMemories) {
      memoriesHtml = '<div class="mg-phase-label" style="margin-top:18px;">角色记忆</div>' +
        '<div class="mg-hint" style="padding:14px;text-align:center;">生成角色记忆中...</div>';
    } else if (st.charMemories.length === 0) {
      memoriesHtml = '<div class="mg-phase-label" style="margin-top:18px;">角色记忆</div>' +
        '<div class="mg-hint" style="padding:14px;text-align:center;">（无角色记忆，可能生成失败）</div>';
    } else {
      memoriesHtml = '<div class="mg-phase-label" style="margin-top:18px;">角色记忆</div>';
      st.charMemories.forEach(function (m) {
        var name = m.name || '';
        var role = m.role || '';
        var memory = m.memory || '';
        var memoryZh = m.memoryZh || '';
        var trId = 'mem-tr-' + Math.random().toString(36).slice(2, 8);
        var transHtml = '';
        if (memoryZh && memoryZh.trim() && memoryZh !== memory) {
          transHtml = '<span class="mg-trans-toggle" data-tr="' + trId + '" data-display="block" style="color:#c9a961;cursor:pointer;font-size:11px;border:1px solid rgba(201,169,97,0.5);border-radius:3px;padding:0 5px;margin-top:6px;display:inline-block;letter-spacing:0.05em;">译</span>' +
            '<div class="mg-trans-zh" id="' + trId + '" data-display="block" style="display:none;color:#9a8f7a;margin-top:6px;font-style:italic;white-space:pre-wrap;">' + esc(memoryZh) + '</div>';
        }
        memoriesHtml +=
          '<div class="mg-card" style="text-align:left;display:block;padding:14px 16px;">' +
          '<div style="font-weight:600;color:#c9a961;font-family:Georgia,serif;letter-spacing:0.04em;">' + esc(name) + ' (' + esc(role) + ')</div>' +
          '<div style="margin-top:8px;font-size:13px;line-height:1.6;color:#e8e4d8;white-space:pre-wrap;">' + esc(memory) + '</div>' +
          transHtml +
          '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
          '<button class="mg-btn mg-btn-sm mg-btn-primary" data-action="inject-dm" data-name="' + esc(name) + '">注入到单聊</button>' +
          '<select class="mg-input" data-conv-select="' + esc(name) + '" style="padding:5px 10px;font-size:12px;max-width:200px;"><option value="">选择群聊...</option></select>' +
          '<button class="mg-btn mg-btn-sm mg-btn-ghost" data-action="inject-group" data-name="' + esc(name) + '">注入到群聊</button>' +
          '</div>' +
          '</div>';
      });
    }

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">狼人杀</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回大厅">返回大厅</button>' +
      '<button class="mg-btn mg-btn-ghost" data-action="close" title="关闭">关闭</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">' +
      '<div class="mg-form-wrap">' +
      '<div class="mg-game-over">' +
      '<div class="mg-game-over-title ' + winnerClass + '">' + esc(winnerText) + '</div>' +
      '<div>游戏结束 · 共 ' + st.day + ' 天</div>' +
      '</div>' +
      '<div class="mg-seats-grid">' + seatsHtml + '</div>' +
      memoriesHtml +
      '<div class="mg-phase-label" style="margin-top:18px;">本局记录</div>' +
      '<div class="mg-gamelog" id="ww-gamelog">' + logHtml + '</div>' +
      '<div class="mg-form-actions">' +
      '<button class="mg-btn mg-btn-primary" data-action="back-hub">返回大厅</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div id="ww-debug-panel" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:90%;max-width:640px;height:75%;background:#0d0d20;border:1px solid #6c5ce7;border-radius:12px;z-index:9999;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.6);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #1f1f3a;">' +
      '<span style="color:#6c5ce7;font-weight:600;">系统日志</span>' +
      '<button class="mg-btn mg-btn-ghost mg-btn-sm" data-action="close-debug">关闭日志</button>' +
      '</div>' +
      '<div id="ww-debug-panel-content" style="flex:1;overflow-y:auto;padding:10px 14px;"></div>' +
      '</div>' +
      '</div>';

    container.innerHTML = html;
    st._container = container;

    // 双击标题打开系统日志（隐藏入口）
    var goTitleEl = container.querySelector('.mg-title');
    if (goTitleEl) {
      goTitleEl.style.cursor = 'pointer';
      goTitleEl.title = '双击打开系统日志';
      goTitleEl.ondblclick = function () {
        var panel = container.querySelector('#ww-debug-panel');
        if (!panel) return;
        if (panel.style.display === 'none' || !panel.style.display) {
          renderDebugPanelContent(container);
          panel.style.display = 'flex';
        } else {
          panel.style.display = 'none';
        }
      };
    }

    var logEl = container.querySelector('#ww-gamelog');
    if (logEl) logEl.scrollTop = logEl.scrollHeight;

    container.querySelector('[data-action="back"]').onclick = function () {
      werewolfState = null;
      showHub(container, roche);
    };
    container.querySelector('[data-action="close"]').onclick = function () {
      roche.ui.closeApp();
    };
    container.querySelector('[data-action="back-hub"]').onclick = function () {
      werewolfState = null;
      showHub(container, roche);
    };

    // 系统日志面板
    var debugBtn = container.querySelector('[data-action="debug"]');
    if (debugBtn) {
      debugBtn.onclick = function () {
        var panel = container.querySelector('#ww-debug-panel');
        if (!panel) return;
        if (panel.style.display === 'none' || !panel.style.display) {
          renderDebugPanelContent(container);
          panel.style.display = 'flex';
        } else {
          panel.style.display = 'none';
        }
      };
    }
    var closeDebugBtn = container.querySelector('[data-action="close-debug"]');
    if (closeDebugBtn) {
      closeDebugBtn.onclick = function () {
        var panel = container.querySelector('#ww-debug-panel');
        if (panel) panel.style.display = 'none';
      };
    }

    // "译"切换事件委托（容器级，只挂一次）
    if (!container._wwTransDelegation) {
      container.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.classList && t.classList.contains('mg-trans-toggle')) {
          var id = t.getAttribute('data-tr');
          var zh = id ? document.getElementById(id) : null;
          if (zh) {
            var showDisplay = zh.getAttribute('data-display') || 'inline';
            zh.style.display = (zh.style.display === 'none' || !zh.style.display) ? showDisplay : 'none';
          }
        }
      });
      container._wwTransDelegation = true;
    }

    // 异步填充每个角色记忆卡片的群聊下拉
    if (roche.conversation && typeof roche.conversation.list === 'function') {
      roche.conversation.list().then(function (conversations) {
        if (!Array.isArray(conversations)) return;
        var groupConvs = conversations.filter(function (c) {
          return c.isGroup && (c.id || c.conversationId);
        });
        var convSelects = container.querySelectorAll('select[data-conv-select]');
        convSelects.forEach(function (sel) {
          // 保留第一个占位 option
          groupConvs.forEach(function (c) {
            var cid = c.id || c.conversationId;
            var label = c.name || c.title || c.handle || cid;
            var opt = document.createElement('option');
            opt.value = cid;
            opt.text = label;
            opt._isGroup = true;
            opt._contactId = c.contactId || '';
            sel.appendChild(opt);
          });
        });
      }).catch(function () { /* 忽略列表加载失败 */ });
    }

    // 注入到单聊：以角色身份注入到该角色的私聊会话
    var injectDmBtns = container.querySelectorAll('[data-action="inject-dm"]');
    injectDmBtns.forEach(function (btn) {
      btn.onclick = async function () {
        var name = btn.getAttribute('data-name');
        if (!name) return;
        var mem = st.charMemories ? st.charMemories.find(function (m) { return m.name === name; }) : null;
        if (!mem) { roche.ui.toast('未找到该角色的记忆'); return; }
        var memoryText = mem.memory || '';
        if (mem.memoryZh && mem.memoryZh.trim() && mem.memoryZh !== mem.memory) {
          memoryText += '\n\n【中文翻译】\n' + mem.memoryZh;
        }
        try {
          var chars = await roche.character.list();
          if (!Array.isArray(chars)) { roche.ui.toast('无法获取角色列表'); return; }
          var char = chars.find(function (c) {
            return (c.handle || c.name) === name || c.name === name;
          });
          if (!char) { roche.ui.toast('未找到该角色'); return; }
          if (!char.conversationId) { roche.ui.toast('该角色没有绑定单聊'); return; }
          var senderName = char.handle || char.name || name;
          await injectMessageToRoche(char.conversationId, '【狼人杀游戏记忆】\n' + memoryText, 'char', char.id, senderName);
          roche.ui.toast('已注入到 ' + name + ' 的单聊');
        } catch (e) {
          roche.ui.toast('注入失败: ' + (e && e.message || e));
        }
      };
    });

    // 注入到群聊：以角色身份注入到选定的群聊会话
    var injectGroupBtns = container.querySelectorAll('[data-action="inject-group"]');
    injectGroupBtns.forEach(function (btn) {
      btn.onclick = async function () {
        var name = btn.getAttribute('data-name');
        if (!name) return;
        var mem = st.charMemories ? st.charMemories.find(function (m) { return m.name === name; }) : null;
        if (!mem) { roche.ui.toast('未找到该角色的记忆'); return; }
        var memoryText = mem.memory || '';
        if (mem.memoryZh && mem.memoryZh.trim() && mem.memoryZh !== mem.memory) {
          memoryText += '\n\n【中文翻译】\n' + mem.memoryZh;
        }
        // 找到紧邻该按钮的 select（同级父容器内）
        var parent = btn.parentElement;
        var sel = parent ? parent.querySelector('select[data-conv-select="' + name.replace(/"/g, '&quot;') + '"]') : null;
        if (!sel) { roche.ui.toast('请先选择群聊'); return; }
        var convId = sel.value;
        if (!convId) { roche.ui.toast('请先选择群聊'); return; }
        try {
          var chars = await roche.character.list();
          if (!Array.isArray(chars)) { roche.ui.toast('无法获取角色列表'); return; }
          var char = chars.find(function (c) {
            return (c.handle || c.name) === name || c.name === name;
          });
          var charId = char ? char.id : '';
          var senderName = char ? (char.handle || char.name || name) : name;
          await injectMessageToRoche(convId, '【狼人杀游戏记忆】\n' + memoryText, 'char', charId, senderName);
          roche.ui.toast('已注入到群聊');
        } catch (e) {
          roche.ui.toast('注入失败: ' + (e && e.message || e));
        }
      };
    });
  }

  // 为所有非用户角色一次性生成游戏记忆（批量调用，返回数组）
  // 每份记忆以该角色自己的口吻写，像日记/回忆，仅包含该角色视角下应知的信息
  async function generateCharMemories(roche) {
    var st = werewolfState;
    var roster = st.players.map(function (p) {
      return '座位' + p.seat + ': ' + p.name + (p.realName ? '(' + p.realName + ')' : '') + ' - ' + p.role + ' - ' + (p.alive ? '存活' : '出局');
    }).join('\n');

    var charList = st.players.filter(function (p) { return !p.isUser; }).map(function (p) {
      return p.name + '(' + p.role + ')';
    }).join(', ');

    var publicLogText = (st.publicLog && st.publicLog.length > 0) ? st.publicLog.join('\n') : '(无)';

    var systemMsg = '你是一群角色的记忆记录员。请为以下每个角色生成一份本轮狼人杀游戏的记忆记录。\n' +
      '要求：\n' +
      '1. 每份记忆以该角色自己的口吻写，像日记或回忆，不是介绍\n' +
      '2. 记录该角色视角下经历的事：自己的身份、夜晚行动、白天发言、投票、被杀/被救/被查验等\n' +
      '3. 该角色只能知道自己该知道的（不要写上帝视角信息）\n' +
      '4. 用该角色的母语写（如果非中文母语者）\n' +
      '5. 每份记忆 100-200 字\n' +
      '6. 返回 JSON 数组，每项 { name, role, memory, memoryZh }\n' +
      '   - name: 角色名\n' +
      '   - role: 身份\n' +
      '   - memory: 母语记忆（中文母语者就用中文）\n' +
      '   - memoryZh: 中文翻译（中文母语者留空）\n' +
      '7. 包含所有非用户角色\n\n' +
      '玩家名单：\n' + roster + '\n' +
      '需要生成记忆的角色：' + charList + '\n\n' +
      '公开事件记录：\n' + (publicLogText || '(无)').slice(-3000);

    var userMsg = '请生成这些角色的游戏记忆，返回 JSON 数组。';

    var messages = [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg }
    ];
    appendDebug('prompt', '记忆', JSON.stringify(messages, null, 2));

    try {
      var br = await aiChat(roche, { messages: messages, temperature: 0.7 });
      var text = (br && br.text) ? br.text : '';
      appendDebug('response', '记忆', text);
      var match = text.match(/\[[\s\S]*\]/);
      if (!match) return [];
      var arr = JSON.parse(match[0]);
      if (!Array.isArray(arr)) return [];
      return arr;
    } catch (e) {
      appendDebug('system', '记忆', 'error: ' + (e && e.message || e));
      return [];
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // 从 AI 文本中解析 JSON（对象或数组）
  function parseJsonResponse(text) {
    if (!text) return null;
    var s = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    try { return JSON.parse(s); } catch (e) { }
    var objMatch = s.match(/\{[\s\S]*\}/);
    if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (e) { } }
    var arrMatch = s.match(/\[[\s\S]*\]/);
    if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch (e) { } }
    return null;
  }

  // 角色构成文字
  function getRoleCompositionText(count) {
    switch (count) {
      case 6: return '6人：2狼人 + 2平民 + 2神（女巫、预言家）';
      case 7: return '7人：2狼人 + 3平民 + 2神（女巫、预言家）';
      case 8: return '8人：3狼人 + 2平民 + 3神（女巫、预言家、守卫）';
      case 9: return '9人：3狼人 + 3平民 + 3神（女巫、预言家、守卫）';
      default: return '';
    }
  }

  // 角色池（按人数）
  function getRolePool(count) {
    switch (count) {
      case 6: return ["狼人", "狼人", "平民", "平民", "女巫", "预言家"];
      case 7: return ["狼人", "狼人", "平民", "平民", "平民", "女巫", "预言家"];
      case 8: return ["狼人", "狼人", "狼人", "平民", "平民", "女巫", "预言家", "守卫"];
      case 9: return ["狼人", "狼人", "狼人", "平民", "平民", "平民", "女巫", "预言家", "守卫"];
      default: return ["狼人", "狼人", "平民", "平民", "女巫", "预言家"];
    }
  }

  // 角色技能描述
  function getRoleSkillText(role) {
    switch (role) {
      case '狼人': return '夜晚与同伴选择击杀目标';
      case '平民': return '无技能，靠白天发言推理';
      case '女巫': return '拥有一瓶解药和一瓶毒药';
      case '预言家': return '夜晚查验一人身份';
      case '守卫': return '每晚守护一人不被狼人杀害，不能连续两晚守护同一人';
      case '猎人': return '出局时可开枪带走一人';
      default: return '';
    }
  }

  // CSPRNG 整数（真随机，优先 crypto.getRandomValues）
  function secureRandomInt(maxExclusive) {
    if (window.crypto && window.crypto.getRandomValues) {
      var arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return arr[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  // Fisher-Yates 洗牌（基于 CSPRNG 真随机）
  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = secureRandomInt(i + 1);
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  /* ============================================================
   * 狼人杀：记忆加载 + 提示词构建 + 夜/昼/投票流程
   * ============================================================ */

  // 为单个 char 加载记忆（基于 preset.sessions + convMap）
  async function loadMemoryForChar(roche, charId) {
    var st = werewolfState;
    if (!st.preset || !Array.isArray(st.preset.sessions) || st.preset.sessions.length === 0) {
      return { core: '', facts: '', shortTerm: '' };
    }
    var convMap = st.convMap || {};
    var applicableConvIds = convMap[charId] || [];
    if (applicableConvIds.length === 0) {
      return { core: '', facts: '', shortTerm: '' };
    }

    var core = '';
    var facts = '';
    var shortTerm = '';

    for (var i = 0; i < st.preset.sessions.length; i++) {
      var session = st.preset.sessions[i];
      if (applicableConvIds.indexOf(session.conversationId) === -1) continue;

      try {
        if (session.mountCore || session.factCount > 0) {
          var lt = await roche.memory.getLongTerm({
            conversationId: session.conversationId,
            limit: 50
          });
          if (lt) {
            if (session.mountCore && lt.core && lt.core.summary) {
              core += lt.core.summary + '\n';
            }
            if (session.factCount > 0 && Array.isArray(lt.facts)) {
              var sliced = lt.facts.slice(0, session.factCount);
              sliced.forEach(function (item) {
                facts += (item.summaryText || item.action || '') + '\n';
              });
            }
          }
        }
        if (session.shortTermCount > 0) {
          var stArr = await roche.memory.getShortTerm({
            conversationId: session.conversationId,
            limit: session.shortTermCount
          });
          if (Array.isArray(stArr)) {
            stArr.forEach(function (item) {
              shortTerm += (item.text || '') + '\n';
            });
          }
        }
      } catch (e) {
        // 忽略单个会话的错误
      }
    }

    return { core: core, facts: facts, shortTerm: shortTerm };
  }

  // 获取 char 的记忆文本（带缓存）
  async function getCharMemoryText(roche, player) {
    var st = werewolfState;
    if (player.isUser) return '';
    if (st.memoryCache && st.memoryCache[player.id]) {
      return st.memoryCache[player.id];
    }
    var mem = await loadMemoryForChar(roche, player.id);
    var text = (mem.core + '\n' + mem.facts + '\n' + mem.shortTerm).trim();
    if (!st.memoryCache) st.memoryCache = {};
    st.memoryCache[player.id] = text;
    return text;
  }

  // 构建玩家名单字符串（座位号 + 展示名 + 真实姓名 + 存活状态）
  // excludePlayerId：若匹配某玩家 id，该行标记为"你"；传 null 则不标记
  // userOverride：若提供（字符串），user 行用此标签替代展示名（如"你(user)"）
  function buildPlayerRoster(excludePlayerId, userOverride) {
    var st = werewolfState;
    if (!st || !st.players) return '';
    var sorted = st.players.slice().sort(function (a, b) { return a.seat - b.seat; });
    var lines = [];
    sorted.forEach(function (p) {
      var display = p.name || '';
      var real = p.realName || '';
      var status = p.alive ? '存活' : '已出局';
      var namePart;
      if (excludePlayerId != null && p.id === excludePlayerId) {
        namePart = '你';
      } else if (userOverride && p.isUser) {
        namePart = userOverride;
      } else {
        namePart = display;
      }
      var realPart = real ? '（真实姓名：' + real + '）' : '';
      lines.push(p.seat + '号：' + namePart + realPart + ' — ' + status);
    });
    return '【本局玩家名单（座位号 + 展示名 + 真实姓名）】\n' + lines.join('\n');
  }

  // 构建 polling 模式下的单 char 提示词（视野隔离 + 人格优先 + 思维链）
  async function buildCharPrompt(roche, player, context) {
    var st = werewolfState;
    var memoryText = await getCharMemoryText(roche, player);

    var publicLogText = (st.publicLog && st.publicLog.length > 0)
      ? st.publicLog.join('\n')
      : '(无)';

    var ownHistory = '(无)';
    if (st.charHistory[player.id] && st.charHistory[player.id].length > 0) {
      ownHistory = st.charHistory[player.id].map(function (h) {
        return '[第' + h.round + '天 ' + h.phase + '] ' + h.content;
      }).join('\n');
    }

    // 狼人互知同伴（规则允许的唯一例外）
    var fellowWolves = '';
    if (player.role === '狼人') {
      var wolves = st.players.filter(function (p) {
        return p.role === '狼人' && p.id !== player.id && p.alive;
      });
      if (wolves.length > 0) {
        fellowWolves = '你的狼人同伴：' + wolves.map(function (p) { return p.seat + '号'; }).join('、') + '。\n';
      }
    }

    var systemContent =
      '【人格优先级宣言】\n' +
      '你的第一身份是"一个人"——有着完整人格、经历、记忆和关系——第二身份才是"本局游戏的玩家"。你的说话方式（语气、措辞、节奏、情感温度）是人格的产物，游戏不能改变它。一个冷漠的人即使在带队也依然冷漠；一个话痨即使在划水也依然话痨。绝对禁止你为了"配合游戏需要"而改变自己的说话方式。游戏胜负是次要的，首要是符合你自身人设。说话方式是人格产物，游戏不能改变它。\n' +
      '记忆和人设同等重要。记忆与经历对char的影响是真实存在的——它们塑造了现在的你。初始人设是起点，记忆和经历才是决定你当下行为的第一依据。如果初始人设和记忆冲突，记忆优先。你对陌生人和对恋人的态度不可能一样。\n\n' +
      '【这只是游戏】\n' +
      '这就是一群朋友在线上玩一局狼人杀而已。不是生死任务，不是战场，不是严肃的使命。放轻松，像和朋友打游戏一样。不要用"任务""战场""使命"这类词，不要郑重其事。用你平时和朋友打游戏的语气。\n\n' +
      '【高智商角色的演绎】\n' +
      '如果你的人设是聪明/高智商/狡猾/老练的人，请真的演绎出来：\n' +
      '- 狼人：不要自爆身份，不要直接说"我是狼"。学会伪装、甩锅、带节奏、装好人。发言要经得起逻辑推敲，制造混乱，转移视线。\n' +
      '- 神职：不要轻易跳身份，必要时才跳。预言家可以藏一轮，女巫可以伪装平民。\n' +
      '- 平民：可以装神职迷惑狼人，可以假装知道更多信息。\n' +
      '- 所有人：发言要有逻辑，要会分析漏洞，要会怀疑。不要傻乎乎地直接暴露。聪明人玩狼人杀会骗人、会演、会藏。\n' +
      '- 但一切伪装和欺骗都必须用你的人格声音说出来，不能变成"游戏套话"。\n\n' +
      '【视角转换与节奏控制 — 聪明人的玩法】\n' +
      '1. 视角转换：如果你是狼人，发言时请以好人视角出发。不要想"狼人该如何"，要想"一个平民/神职此刻会怎么想、怎么说"。你的发言逻辑要建立在"假设我是好人"的基础上。\n' +
      '2. 节奏控制：聪明人不着急。率先着急的家伙会漏出破绽。\n' +
      '   - 不要急着站边、不要急着踩人、不要急着跳身份。\n' +
      '   - 第一天可以观望、可以问问题、可以装糊涂。\n' +
      '   - 宁可少说，不要乱说。沉默胜过愚蠢的发言。\n' +
      '3. 深度伪装：如果你是神职需要藏身份，像平民一样发言。如果你是狼人，像一个真正的好人在分析局势。\n' +
      '4. 情报利用：充分利用公开信息（谁发言可疑、谁投票给谁、谁死了），但不要暴露你知道的比公开信息更多。\n' +
      '5. 反向思维：聪明的狼人会故意说一些真话来建立可信度，再在关键时刻带偏方向。\n\n' +
      '【你的角色信息】\n' +
      '名字：' + player.name + '\n' +
      '座位号：' + player.seat + '\n' +
      '身份：' + player.role + '\n' +
      '技能：' + getRoleSkillText(player.role) + '\n' +
      fellowWolves +
      '\n' + buildPlayerRoster(player.id) + '\n' +
      '\n【你的人设】\n' + (player.personaText || '(无)') + '\n' +
      '\n【你的记忆】\n' + (memoryText || '(无)') + '\n' +
      '\n【公开事件记录（仅含公开信息，不含他人私密行动）】\n' + publicLogText + '\n' +
      '\n【你的个人历史（仅含你自己的心声、行动、发言、投票）】\n' + ownHistory + '\n' +
      '\n【视野隔离铁律】\n' +
      '- 你绝对不能假设自己知道未给出的信息（他人身份、夜间行动、他人心声）。\n' +
      '- 只能基于公开记录和你自己的行动历史做决策。\n' +
      '- 严禁开天眼，严禁读取上帝视角。\n' +
      (player.role === '狼人' ? '- 狼人互知同伴是规则允许的唯一例外。\n' : '') +
      '\n【思维链要求——人格优先引擎（写在 thinking 字段内）】\n' +
      'thinking 字段是你的推理过程，不要把最终发言或行动的原文写进 thinking，只推理它们该怎么说/怎么做。在做出决策前，你必须在 thinking 字段内完成以下思维链（这是纯推理，绝不要把最终发言原文或行动原文写在这里）：\n' +
      '1. 人设全貌加载：我是谁？我怎么说话（语气、措辞、节奏、口癖、标点习惯）？我对user的初始态度是什么？\n' +
      '2. 记忆回溯：记忆和人设同等重要。记忆与经历对char的影响是真实存在的——它们塑造了现在的你。初始人设是起点，记忆和经历才是决定你当下行为的第一依据。如果初始人设和记忆冲突，记忆优先。你对陌生人和对恋人的态度不可能一样。我和user现在是什么关系？经历过什么转折？写下"经过记忆塑造后的现在的我"的一句话肖像。\n' +
      '3. 对其他玩家的看法与认识：对照本局玩家名单，我认识其中的谁？我和他们是什么关系？特别注意——我对陌生人和对恋人/挚友的态度、亲疏、说话方式是截然不同的。我对user是什么态度？这份关系是真实的，它决定了我在游戏里对待他们的底线。\n' +
      '4. 语气基线校准：如果这不是一场狼人杀，只是群聊里此刻我对user会说的一句话？写下这句示范——这就是我的语气基线，后续所有发言都必须从这里生长出来。游戏信息可以改变我说话的内容，但绝不能改变我说话的温度和质地。\n' +
      '5. 游戏决策→语气翻译：把我的游戏策略（站边/踩人/划水/带队/伪装）翻译成"我这种人"会说的话，不能用游戏套话。如果我的身份需要隐藏（我是狼人/神职），我该怎么伪装？我的发言能经得起推敲吗？自检：把翻译后的句子拿给认识我的人看，能不能不看名字就认出是我说的？如果听起来像任何一个路人玩家都能说的话——翻译失败，重来。\n' +
      '6. 防OOC自检：这句话和我[4]的语气基线一致吗？冷漠的人不能忽然热情，话痨不能忽然沉默，傲娇不能忽然直球。听起来像"一个玩家"在说话还是"我"在说话？\n' +
      '\n【心声字段 heart】\n' +
      'heart 字段是你此刻的内心独白——用你的声音、你的语气，说出你心里的一句话。它不是推理，是你真实的内心活动。一到两句即可。表达你此刻的真实感受/算计/对局势或user的态度。必须符合你的语气。\n' +
      '\n【当前决策请求】\n' + context + '\n' +
      '\n【输出要求】\n' +
      '请以严格JSON格式回复，不要包含任何其他文字：\n' +
      '{ "thinking":"<6步思维链推理过程。这是纯推理，绝不要把最终发言原文或行动原文写在这里>", "heart":"<心声：用你的人格声音说出的一句内心独白，表达你此刻的真实感受/算计/对局势或user的态度。不是推理，是你心里冒出来的一句话。必须符合你的语气>", "heartZh":"<仅当你是非中文母语者：heart的中文翻译；否则留空字符串>", "action":"<夜间行动描述，如\'选择击杀3号\'\'使用解药救2号\'\'查验5号\'。白天发言环节留空>", "target":<目标座位号整数或null>, "speech":"<白天公开发言的原文。夜间行动环节留空。必须是你会真正说出口的话>", "speechZh":"<仅当你是非中文母语者：speech的中文翻译；否则留空字符串>" }\n' +
      '\n【字段防混血铁律】\n' +
      '严格区分字段：thinking 只放推理，heart 只放内心独白，speech 只放说出口的话，action 只放夜间行动。绝不允许把一个字段的内容混进另一个字段。\n' +
      '\n【母语规则】\n' +
      '- 仔细阅读你的人设，判断你的母语是什么。德国人用德语，西班牙人用西班牙语，日本人用日语，法国人用法语，俄罗斯人用俄语，等等。\n' +
      '- 如果人设明确写了国籍/语言/出生地，以那个语言为准。\n' +
      '- 如果人设没有明确说明，但名字明显是某国人（如德国名字、西班牙名字），用对应语言。\n' +
      '- 如果实在无法判断，用英语。\n' +
      '- thinking/heart/speech 全部用你的母语。然后在 heartZh/speechZh 字段提供中文翻译（thinking 不需要翻译）。\n' +
      '- 如果你的母语就是中文，heartZh/speechZh 留空。';

    var userContent = '请做出你的决策并按JSON格式回复。';

    var messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent }
    ];
    appendDebug('prompt', player.name, JSON.stringify(messages, null, 2));

    return {
      messages: messages,
      temperature: 0.7
    };
  }

  // 构建 batch 模式下的批量提示词（一次演算多个 char + 人格优先）
  async function buildBatchPrompt(roche, context) {
    var st = werewolfState;
    var aliveChars = st.players.filter(function (p) { return p.alive && !p.isUser; });

    var charsInfo = '';
    for (var i = 0; i < aliveChars.length; i++) {
      var p = aliveChars[i];
      var memoryText = await getCharMemoryText(roche, p);
      var ownHistory = '(无)';
      if (st.charHistory[p.id] && st.charHistory[p.id].length > 0) {
        ownHistory = st.charHistory[p.id].map(function (h) {
          return '[第' + h.round + '天 ' + h.phase + '] ' + h.content;
        }).join('\n');
      }
      var fellowLine = '';
      if (p.role === '狼人') {
        var fw = st.players.filter(function (q) {
          return q.role === '狼人' && q.id !== p.id && q.alive;
        });
        if (fw.length > 0) {
          fellowLine = ' / 狼人同伴:' + fw.map(function (q) { return q.seat + '号'; }).join('、');
        }
      }
      charsInfo +=
        '座位' + p.seat + '号 / ' + p.name + ' / 身份:' + p.role + fellowLine + '\n' +
        '人设:' + (p.personaText || '(无)') + '\n' +
        '记忆:' + (memoryText || '(无)') + '\n' +
        '个人历史（仅含自己的心声、行动、发言、投票）:' + ownHistory + '\n---\n';
    }

    var publicLogText = (st.publicLog && st.publicLog.length > 0)
      ? st.publicLog.join('\n')
      : '(无)';

    var systemContent =
      '【人格优先级宣言】\n' +
      '每个角色的第一身份是"一个人"——有着完整人格、经历、记忆和关系——第二身份才是"本局游戏的玩家"。角色的说话方式（语气、措辞、节奏、情感温度）是人格的产物，游戏不能改变它。游戏胜负是次要的，首要是符合角色自身人设。绝对禁止角色为了"配合游戏需要"而改变自己的说话方式。\n' +
      '记忆和人设同等重要。记忆与经历对char的影响是真实存在的——它们塑造了现在的你。初始人设是起点，记忆和经历才是决定你当下行为的第一依据。如果初始人设和记忆冲突，记忆优先。你对陌生人和对恋人的态度不可能一样。\n\n' +
      '【这只是游戏】\n' +
      '这就是一群朋友在线上玩一局狼人杀而已。不是生死任务，不是战场，不是严肃的使命。放轻松，像和朋友打游戏一样。不要用"任务""战场""使命"这类词，不要郑重其事。用你平时和朋友打游戏的语气。\n\n' +
      '【高智商角色的演绎】\n' +
      '如果你的人设是聪明/高智商/狡猾/老练的人，请真的演绎出来：\n' +
      '- 狼人：不要自爆身份，不要直接说"我是狼"。学会伪装、甩锅、带节奏、装好人。发言要经得起逻辑推敲，制造混乱，转移视线。\n' +
      '- 神职：不要轻易跳身份，必要时才跳。预言家可以藏一轮，女巫可以伪装平民。\n' +
      '- 平民：可以装神职迷惑狼人，可以假装知道更多信息。\n' +
      '- 所有人：发言要有逻辑，要会分析漏洞，要会怀疑。不要傻乎乎地直接暴露。聪明人玩狼人杀会骗人、会演、会藏。\n' +
      '- 但一切伪装和欺骗都必须用你的人格声音说出来，不能变成"游戏套话"。\n\n' +
      '【视角转换与节奏控制 — 聪明人的玩法】\n' +
      '1. 视角转换：如果你是狼人，发言时请以好人视角出发。不要想"狼人该如何"，要想"一个平民/神职此刻会怎么想、怎么说"。你的发言逻辑要建立在"假设我是好人"的基础上。\n' +
      '2. 节奏控制：聪明人不着急。率先着急的家伙会漏出破绽。\n' +
      '   - 不要急着站边、不要急着踩人、不要急着跳身份。\n' +
      '   - 第一天可以观望、可以问问题、可以装糊涂。\n' +
      '   - 宁可少说，不要乱说。沉默胜过愚蠢的发言。\n' +
      '3. 深度伪装：如果你是神职需要藏身份，像平民一样发言。如果你是狼人，像一个真正的好人在分析局势。\n' +
      '4. 情报利用：充分利用公开信息（谁发言可疑、谁投票给谁、谁死了），但不要暴露你知道的比公开信息更多。\n' +
      '5. 反向思维：聪明的狼人会故意说一些真话来建立可信度，再在关键时刻带偏方向。\n\n' +
      buildPlayerRoster(null, '你(user)') + '\n\n' +
      '【角色列表】\n' + charsInfo + '\n' +
      '【公开事件记录】\n' + publicLogText + '\n' +
      '\n【视野隔离铁律】\n' +
      '- 每个角色只能基于公开信息和自己个人历史做决策。\n' +
      '- 严禁开天眼，严禁读取上帝视角。\n' +
      '- 狼人互知同伴是规则允许的唯一例外。\n' +
      '\n【思维链要求——人格优先引擎（写在 thinking 字段内）】\n' +
      'thinking 字段是角色的推理过程，不要把最终发言或行动的原文写进 thinking，只推理它们该怎么说/怎么做。每个角色在 thinking 字段内完成思维链（纯推理，绝不要把最终发言原文或行动原文写在这里）：\n' +
      '1. 人设全貌加载：我是谁？我怎么说话（语气、措辞、节奏、口癖）？\n' +
      '2. 记忆回溯：记忆和人设同等重要。记忆与经历对char的影响是真实存在的——它们塑造了现在的你。初始人设是起点，记忆和经历才是决定你当下行为的第一依据。如果初始人设和记忆冲突，记忆优先。你对陌生人和对恋人的态度不可能一样。我和user现在是什么关系？写下"经过记忆塑造后的现在的我"的一句话肖像。\n' +
      '3. 对其他玩家的看法与认识：对照本局玩家名单，我认识其中的谁？我和他们是什么关系？特别注意——我对陌生人和对恋人/挚友的态度、亲疏、说话方式是截然不同的。我对user是什么态度？这份关系是真实的，它决定了我在游戏里对待他们的底线。\n' +
      '4. 语气基线校准：写下我语气基线的示范句，后续发言从这里生长。\n' +
      '5. 游戏决策→语气翻译：把策略翻译成"我这种人"会说的话，不用游戏套话。如果我的身份需要隐藏（我是狼人/神职），我该怎么伪装？我的发言能经得起推敲吗？自检：不看名字能认出是我说的吗？\n' +
      '6. 防OOC自检：这句话符合我的语气基线吗？冷漠不能忽然热情，话痨不能忽然沉默。\n' +
      '\n【心声字段 heart】\n' +
      'heart 字段是角色此刻的内心独白——用角色的声音、语气，说出心里的一句话。它不是推理，是角色真实的内心活动。一到两句即可。表达此刻的真实感受/算计/对局势或user的态度。必须符合角色的语气。\n' +
      '\n【决策请求】\n' + context + '\n' +
      '\n【输出要求】\n' +
      '请为每个相关角色做出决策，以严格JSON数组格式回复：\n' +
      '[{ "seat":<座位号>, "thinking":"<6步思维链推理过程。这是纯推理，绝不要把最终发言原文或行动原文写在这里>", "heart":"<心声：用你的人格声音说出的一句内心独白，表达你此刻的真实感受/算计/对局势或user的态度。不是推理，是你心里冒出来的一句话。必须符合你的语气>", "heartZh":"<仅当你是非中文母语者：heart的中文翻译；否则留空字符串>", "action":"<夜间行动描述，如\'选择击杀3号\'\'使用解药救2号\'\'查验5号\'。白天发言环节留空>", "target":<目标座位号整数或null>, "speech":"<白天公开发言的原文。夜间行动环节留空。必须是你会真正说出口的话>", "speechZh":"<仅当你是非中文母语者：speech的中文翻译；否则留空字符串>" }]\n' +
      '\n【字段防混血铁律】\n' +
      '严格区分字段：thinking 只放推理，heart 只放内心独白，speech 只放说出口的话，action 只放夜间行动。绝不允许把一个字段的内容混进另一个字段。\n' +
      '\n【母语规则】\n' +
      '- 每个角色仔细阅读自己的人设，判断自己的母语是什么。德国人用德语，西班牙人用西班牙语，日本人用日语，法国人用法语，俄罗斯人用俄语，等等。\n' +
      '- 如果人设明确写了国籍/语言/出生地，以那个语言为准。\n' +
      '- 如果人设没有明确说明，但名字明显是某国人（如德国名字、西班牙名字），用对应语言。\n' +
      '- 如果实在无法判断，用英语。\n' +
      '- thinking/heart/speech 全部用角色的母语。然后在 heartZh/speechZh 字段提供中文翻译（thinking 不需要翻译）。\n' +
      '- 如果角色的母语就是中文，heartZh/speechZh 留空。';

    var userContent = '请为所有角色做出决策并按JSON数组格式回复。';

    var messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent }
    ];
    appendDebug('prompt', '批量', JSON.stringify(messages, null, 2));

    return {
      messages: messages,
      temperature: 0.7
    };
  }

  // 等待用户输入（基于 promptType 渲染不同的交互面板）
  function waitForUserInput(container, roche, promptType, options) {
    return new Promise(function (resolve) {
      // 防御：取消上一个尚未完成的用户输入等待，避免旧面板残留 / 旧 Promise 永不 resolve
      // 例如多次进入游戏循环或恢复存档时可能出现 waitForUserInput 重叠
      if (werewolfState && werewolfState._pendingResolve) {
        var prev = werewolfState._pendingResolve;
        werewolfState._pendingResolve = null;
        prev(null);
      }
      var panel = container.querySelector('#ww-action-panel');
      if (!panel) { resolve(null); return; }
      if (werewolfState) werewolfState._pendingResolve = resolve;

      // 等待用户输入前保存存档（fire-and-forget），便于中途退出后恢复
      saveWerewolfState(roche);

      var html = '';
      if (promptType === 'wolf_target') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">狼人行动：选择今晚要击杀的玩家</div>' +
          '<div class="mg-target-btns">' +
          options.targets.map(function (seat) {
            return '<button class="mg-target-btn" data-seat="' + seat + '">' + seat + '号</button>';
          }).join('') +
          '</div></div>';
      } else if (promptType === 'witch_save') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">女巫行动</div>' +
          (options.victim != null
            ? '<div>今晚 <b>' + options.victim + '号</b> 被刀。是否使用解药？</div>'
            : '<div>今晚没有人被刀。</div>') +
          '<div class="mg-target-btns">' +
          (options.canSave && options.victim != null
            ? '<button class="mg-target-btn" data-action="save">用解药</button>' : '') +
          '<button class="mg-target-btn" data-action="nosave">不用解药</button>' +
          '</div></div>';
      } else if (promptType === 'witch_poison') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">选择要毒的玩家（或不毒）</div>' +
          '<div class="mg-target-btns">' +
          options.targets.map(function (seat) {
            return '<button class="mg-target-btn" data-seat="' + seat + '">' + seat + '号</button>';
          }).join('') +
          '<button class="mg-target-btn" data-action="nopoison">不毒</button>' +
          '</div></div>';
      } else if (promptType === 'seer_check') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">预言家行动：选择要查验的玩家</div>' +
          '<div class="mg-target-btns">' +
          options.targets.map(function (seat) {
            return '<button class="mg-target-btn" data-seat="' + seat + '">' + seat + '号</button>';
          }).join('') +
          '</div></div>';
      } else if (promptType === 'guard_protect') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">守卫守护</div>' +
          '<div class="mg-hint">选择今晚要守护的玩家（不能连守昨晚的人）</div>' +
          '<div class="mg-target-btns">' +
          options.targets.map(function (seat) {
            return '<button class="mg-target-btn" data-seat="' + seat + '">' + seat + '号</button>';
          }).join('') +
          '</div></div>';
      } else if (promptType === 'day_speak') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">' + options.seat + '号发言</div>' +
          '<textarea class="mg-speak-area" id="ww-speak-input" placeholder="请输入你的发言..."></textarea>' +
          '<div class="mg-form-actions"><button class="mg-btn mg-btn-primary" data-action="submit-speak">发言</button></div>' +
          '</div>';
      } else if (promptType === 'wolf_channel_speak') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">狼人频道讨论</div>' +
          '<div class="mg-hint">和同伴商量今晚刀谁（其他狼人能看到你的发言）</div>' +
          '<textarea class="mg-speak-area" id="ww-wolf-speak" placeholder="说说你的想法..."></textarea>' +
          '<div class="mg-form-actions"><button class="mg-btn mg-btn-ghost" data-action="skip-wolf-speak">跳过</button><button class="mg-btn mg-btn-primary" data-action="submit-wolf-speak">发送</button></div>' +
          '</div>';
      } else if (promptType === 'day_vote') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">投票：选择要投出局的玩家</div>' +
          '<div class="mg-target-btns">' +
          options.targets.map(function (seat) {
            return '<button class="mg-target-btn" data-seat="' + seat + '">' + seat + '号</button>';
          }).join('') +
          '<button class="mg-target-btn" data-action="abstain">弃票</button>' +
          '</div></div>';
      }

      panel.innerHTML = html;

      // 绑定按钮
      if (promptType === 'day_speak') {
        var submitBtn = panel.querySelector('[data-action="submit-speak"]');
        var input = panel.querySelector('#ww-speak-input');
        if (submitBtn && input) {
          submitBtn.onclick = function () {
            var speech = input.value.trim();
            panel.innerHTML = '';
            if (werewolfState) werewolfState._pendingResolve = null;
            resolve({ speech: speech });
          };
        }
      } else if (promptType === 'wolf_channel_speak') {
        var wolfSubmitBtn = panel.querySelector('[data-action="submit-wolf-speak"]');
        var wolfSkipBtn = panel.querySelector('[data-action="skip-wolf-speak"]');
        var wolfInput = panel.querySelector('#ww-wolf-speak');
        if (wolfSubmitBtn && wolfInput) {
          wolfSubmitBtn.onclick = function () {
            var speech = wolfInput.value.trim();
            panel.innerHTML = '';
            if (werewolfState) werewolfState._pendingResolve = null;
            resolve({ speech: speech });
          };
        }
        if (wolfSkipBtn) {
          wolfSkipBtn.onclick = function () {
            panel.innerHTML = '';
            if (werewolfState) werewolfState._pendingResolve = null;
            resolve({ speech: '' });
          };
        }
      } else {
        var seatBtns = panel.querySelectorAll('.mg-target-btn[data-seat]');
        seatBtns.forEach(function (btn) {
          btn.onclick = function () {
            var seat = parseInt(btn.dataset.seat, 10);
            panel.innerHTML = '';
            if (werewolfState) werewolfState._pendingResolve = null;
            resolve({ seat: seat });
          };
        });
        var actionBtns = panel.querySelectorAll('.mg-target-btn[data-action]');
        actionBtns.forEach(function (btn) {
          btn.onclick = function () {
            var action = btn.dataset.action;
            panel.innerHTML = '';
            if (werewolfState) werewolfState._pendingResolve = null;
            resolve({ action: action });
          };
        });
      }
    });
  }

  // 主游戏循环
  // 简洁稳健的阶段推进：夜晚 → 白天发言 → 投票 → 循环。
  // 不再依赖旧的阶段完成标记跳过逻辑；恢复语义由各 run 函数顶部的 _resumePhase 检查处理。
  async function startGameLoop(container, roche) {
    // 安全阀：防止因胜利条件 bug 导致循环无限进行
    var safetyMaxDays = 20;
    try {
      while (werewolfState && !werewolfState.gameOver) {
        if (werewolfState.day > safetyMaxDays) {
          werewolfState.gameOver = true;
          werewolfState.winner = '平局';
          appendGamelog(container, '超过最大天数限制(' + safetyMaxDays + ')，强制结束游戏。', 'dm');
          break;
        }
        // 夜晚
        await runNight(container, roche);
        if (!werewolfState || werewolfState.gameOver) break;
        // 白天发言
        await runDaySpeak(container, roche);
        if (!werewolfState || werewolfState.gameOver) break;
        // 投票
        await runDayVote(container, roche);
        if (!werewolfState || werewolfState.gameOver) break;
      }
    } catch (e) {
      appendDebug('system', 'loop', '游戏循环异常: ' + (e && e.message || String(e)));
    } finally {
      if (werewolfState) werewolfState.gameLoopRunning = false;
      if (werewolfState && werewolfState.gameOver) {
        renderGameOver(container, roche);
      }
    }
  }

  // 夜晚流程
  async function runNight(container, roche) {
    var st = werewolfState;
    // 恢复时 subPhase 已是 'night'，不重复递增天数
    if (st.subPhase !== 'night') st.day++;
    st.subPhase = 'night';
    st.pendingDeaths = [];
    st.nightActions = {
      wolvesTarget: null,
      witchSave: false,
      witchPoisonTarget: null,
      seerCheckTarget: null,
      seerResult: null,
      guardTarget: null
    };
    // 夜晚初始化完成，保存存档（fire-and-forget）
    saveWerewolfState(roche);

    // 恢复时跳过"天黑请闭眼"公告
    if (st._resumePhase === 'night') {
      st._resumePhase = null;
    } else {
      appendGamelog(container, '天黑请闭眼。', 'dm');
    }
    rerenderPlay(container, roche);
    await sleep(400);

    var userPlayer = st.players.find(function (p) { return p.isUser; });
    var aliveWolves = st.players.filter(function (p) { return p.alive && p.role === '狼人'; });
    var aliveNonWolves = st.players.filter(function (p) { return p.alive && p.role !== '狼人'; });

    // 安全检查：一方已全灭则直接结算
    if (aliveWolves.length === 0 || aliveNonWolves.length === 0) {
      if (checkGameOver(roche)) {
        appendGamelog(container, '游戏结束！' + st.winner + '阵营胜利！', 'dm');
      }
      return;
    }

    // === 守卫阶段 ===
    var guard = st.players.find(function (p) { return p.alive && p.role === '守卫'; });
    if (guard) {
      if (userPlayer && userPlayer.role === '守卫' && userPlayer.alive && !st.spectator) {
        // user 是守卫：选择守护目标（不能连守昨晚的人）
        var guardTargets = st.players.filter(function (p) {
          return p.alive && (st.lastGuardTarget == null || p.seat !== st.lastGuardTarget);
        }).map(function (p) { return p.seat; });
        var guardResult = await waitForUserInput(container, roche, 'guard_protect', { targets: guardTargets });
        if (guardResult && guardResult.seat) {
          st.nightActions.guardTarget = guardResult.seat;
          appendCharHistory(userPlayer.id, st.day, 'night', 'action', '守护' + guardResult.seat + '号');
          appendGamelog(container, '[DM(私窗)] 你守护了' + guardResult.seat + '号', 'private');
        }
      } else {
        // 静默结算
        var guardAliveSeats = st.players.filter(function (p) { return p.alive; }).map(function (p) { return p.seat; });
        var guardContext = '你是守卫。请选择今晚要守护的玩家（不能连续两晚守护同一人）。可选目标：' + guardAliveSeats.join(', ');
        if (st.lastGuardTarget != null) {
          guardContext += '。注意：你上一晚守护了' + st.lastGuardTarget + '号，今晚不能再守他。';
        }

        var guardTargetSeat = null;
        appendGamelog(container, '守卫正在行动…', 'transition');
        rerenderPlay(container, roche);
        if (st.mode === 'batch') {
          try {
            var gbp = await buildBatchPrompt(roche, guardContext + ' 仅守卫角色需要行动。');
            var gbr = await aiChat(roche, { messages: gbp.messages, temperature: 0.7 });
            appendDebug('response', '批量', gbr.text);
            var gdArr = parseJsonResponse(gbr.text);
            appendDebug('action', '批量', JSON.stringify(gdArr, null, 2));
            if (Array.isArray(gdArr) && gdArr.length > 0) {
              var gd = gdArr.find(function (d) { return d.seat === guard.seat; });
              if (!gd) gd = gdArr[0];
              if (gd && gd.target != null) {
                var gdt = parseInt(gd.target, 10);
                var gdtValid = st.players.find(function (p) { return p.seat === gdt && p.alive; });
                if (gdtValid && (st.lastGuardTarget == null || gdt !== st.lastGuardTarget)) {
                  guardTargetSeat = gdt;
                }
                appendDebug('thinking', guard.name, gd.thinking || '');
                appendDebug('heart', guard.name, gd.heart || '', gd.heartZh || '');
                appendCharHistory(guard.id, st.day, 'night', 'heart', gd.heart || '');
                appendCharHistory(guard.id, st.day, 'night', 'action', gd.action || '');
              }
            }
          } catch (e) { appendDebug('system', '守卫', 'batch error: ' + (e && e.message || e)); }
        } else {
          try {
            var gcp = await buildCharPrompt(roche, guard, guardContext);
            var gcr = await aiChat(roche, { messages: gcp.messages, temperature: 0.7 });
            appendDebug('response', guard.name, gcr.text);
            var gcd = parseJsonResponse(gcr.text);
            appendDebug('action', guard.name, JSON.stringify(gcd, null, 2));
            if (gcd) {
              appendDebug('thinking', guard.name, gcd.thinking || '');
              appendDebug('heart', guard.name, gcd.heart || '', gcd.heartZh || '');
              appendCharHistory(guard.id, st.day, 'night', 'heart', gcd.heart || '');
              appendCharHistory(guard.id, st.day, 'night', 'action', gcd.action || '');
              if (gcd.target != null) {
                var gtt = parseInt(gcd.target, 10);
                var gttValid = st.players.find(function (p) { return p.seat === gtt && p.alive; });
                if (gttValid && (st.lastGuardTarget == null || gtt !== st.lastGuardTarget)) {
                  guardTargetSeat = gtt;
                }
              }
            }
          } catch (e) { appendDebug('system', guard.name, 'error: ' + (e && e.message || e)); }
        }

        if (guardTargetSeat != null) {
          st.nightActions.guardTarget = guardTargetSeat;
        }
      }
    }

    // === 狼人阶段 ===
    if (aliveWolves.length > 0 && aliveNonWolves.length > 0) {
      if (userPlayer && userPlayer.role === '狼人' && userPlayer.alive && !st.spectator) {
        // user 是狼人：显示同伴 → 用户发言 → 同伴讨论 → 选目标
        var fellowWolves = st.players.filter(function (p) {
          return p.role === '狼人' && !p.isUser && p.alive;
        });
        var fellowSeatsStr = fellowWolves.length > 0
          ? fellowWolves.map(function (p) { return p.seat + '号'; }).join('、')
          : '（无）';
        appendGamelog(container, '[DM(狼人频道)] 你的同伴：' + fellowSeatsStr, 'private');

        // 累积狼人频道发言，供后续狼人参考
        var wolfChannelMsgs = [];

        // 用户先在狼人频道发言
        var userWolfSpeak = await waitForUserInput(container, roche, 'wolf_channel_speak', {});
        var userSpeech = (userWolfSpeak && userWolfSpeak.speech) || '';
        if (userSpeech) {
          appendGamelog(container, '[狼人频道] ' + userPlayer.seat + '号(你)：' + userSpeech, 'private');
          appendCharHistory(userPlayer.id, st.day, 'night', 'heart', '狼人频道发言：' + userSpeech);
          wolfChannelMsgs.push(userPlayer.seat + '号(你)：' + userSpeech);
        }

        // 狼人频道讨论：同伴给出建议（看到用户发言 + 之前同伴发言）
        if (fellowWolves.length > 0) {
          if (st.mode === 'batch') {
            var userMsgForBatch = wolfChannelMsgs.length > 0 ? '【狼人频道已有发言】\n' + wolfChannelMsgs.join('\n') + '\n' : '';
            var wolfDiscussContext = userMsgForBatch + '狼人频道讨论：作为狼人，你建议今晚刀谁？在 speech 字段给出你在狼人频道的发言（用你的母语，非中文母语者附 speechZh），target 填建议座位号，action 填简短行动理由。';
            try {
              var wdbp = await buildBatchPrompt(roche, wolfDiscussContext + ' 仅存活的狼人角色需要讨论。');
              var wdbr = await aiChat(roche, { messages: wdbp.messages, temperature: 0.7 });
              appendDebug('response', '批量', wdbr.text);
              var wdArr = parseJsonResponse(wdbr.text);
              appendDebug('action', '批量', JSON.stringify(wdArr, null, 2));
              if (Array.isArray(wdArr)) {
                wdArr.forEach(function (d) {
                  var wolf = st.players.find(function (p) { return p.seat === d.seat && p.role === '狼人' && p.alive && !p.isUser; });
                  if (wolf && d.target != null) {
                    var wolfSpeech = d.speech || ('建议杀' + d.target + '号');
                    var wolfSpeechZh = d.speechZh || '';
                    appendGamelog(container, '[狼人频道] ' + wolf.seat + '号(' + wolf.name + ')：' + wolfSpeech, 'private', wolfSpeechZh);
                    appendDebug('thinking', wolf.name, d.thinking || '');
                    appendDebug('heart', wolf.name, d.heart || '', d.heartZh || '');
                    appendCharHistory(wolf.id, st.day, 'night', 'heart', d.heart || '');
                    appendCharHistory(wolf.id, st.day, 'night', 'action', '建议杀' + d.target + '号');
                    wolfChannelMsgs.push(wolf.seat + '号(' + wolf.name + ')：' + wolfSpeech);
                  }
                });
              }
            } catch (e) { appendDebug('system', '狼人讨论', 'batch error: ' + (e && e.message || e)); }
          } else {
            for (var fwi = 0; fwi < fellowWolves.length; fwi++) {
              var fwolf = fellowWolves[fwi];
              try {
                var priorMsgs = wolfChannelMsgs.length > 0 ? '【狼人频道已有发言】\n' + wolfChannelMsgs.join('\n') + '\n' : '';
                var fwContext = priorMsgs + '狼人频道讨论：作为狼人，你建议今晚刀谁？在 speech 字段给出你在狼人频道的发言（用你的母语，非中文母语者附 speechZh），target 填建议座位号，action 填简短行动理由。';
                var fwcp = await buildCharPrompt(roche, fwolf, fwContext);
                var fwcr = await aiChat(roche, { messages: fwcp.messages, temperature: 0.7 });
                appendDebug('response', fwolf.name, fwcr.text);
                var fwcd = parseJsonResponse(fwcr.text);
                appendDebug('action', fwolf.name, JSON.stringify(fwcd, null, 2));
                if (fwcd && fwcd.target != null) {
                  var wolfSpeech = fwcd.speech || ('建议杀' + fwcd.target + '号');
                  var wolfSpeechZh = fwcd.speechZh || '';
                  appendGamelog(container, '[狼人频道] ' + fwolf.seat + '号(' + fwolf.name + ')：' + wolfSpeech, 'private', wolfSpeechZh);
                  appendDebug('thinking', fwolf.name, fwcd.thinking || '');
                  appendDebug('heart', fwolf.name, fwcd.heart || '', fwcd.heartZh || '');
                  appendCharHistory(fwolf.id, st.day, 'night', 'heart', fwcd.heart || '');
                  appendCharHistory(fwolf.id, st.day, 'night', 'action', '建议杀' + fwcd.target + '号');
                  wolfChannelMsgs.push(fwolf.seat + '号(' + fwolf.name + ')：' + wolfSpeech);
                }
              } catch (e) { appendDebug('system', fwolf.name, '讨论 error: ' + (e && e.message || e)); }
            }
          }
          await sleep(400);
        }

        // 显示目标选择 UI
        var wolfTargets = aliveNonWolves.map(function (p) { return p.seat; });
        var wolfResult = await waitForUserInput(container, roche, 'wolf_target', { targets: wolfTargets });
        if (wolfResult && wolfResult.seat) {
          st.nightActions.wolvesTarget = wolfResult.seat;
          appendCharHistory(userPlayer.id, st.day, 'night', 'action', '你选择击杀' + wolfResult.seat + '号');
        }
      } else {
        // 静默结算
        appendGamelog(container, '狼人正在行动…', 'transition');
        rerenderPlay(container, roche);
        var wolfVotes = {};
        if (st.mode === 'batch') {
          try {
            var bp = await buildBatchPrompt(roche, '狼人请选择今晚要击杀的目标。所有存活狼人共同决定一个目标。仅狼人角色需要行动。');
            var br = await aiChat(roche, { messages: bp.messages, temperature: 0.7 });
            appendDebug('response', '批量', br.text);
            var decisions = parseJsonResponse(br.text);
            appendDebug('action', '批量', JSON.stringify(decisions, null, 2));
            if (Array.isArray(decisions)) {
              decisions.forEach(function (d) {
                if (d.target != null) {
                  var t = parseInt(d.target, 10);
                  if (!isNaN(t)) wolfVotes[t] = (wolfVotes[t] || 0) + 1;
                }
                var wolf = st.players.find(function (p) { return p.seat === d.seat && p.role === '狼人'; });
                if (wolf) {
                  appendDebug('thinking', wolf.name, d.thinking || '');
                  appendDebug('heart', wolf.name, d.heart || '', d.heartZh || '');
                  appendCharHistory(wolf.id, st.day, 'night', 'heart', d.heart || '');
                  appendCharHistory(wolf.id, st.day, 'night', 'action', '选择击杀' + (d.target || '?') + '号');
                  if (st.spectator && d.speech) {
                    appendGamelog(container, '[狼人频道] ' + wolf.seat + '号(' + wolf.name + ')：' + d.speech, 'private', d.speechZh || '');
                  }
                }
              });
            }
          } catch (e) { appendDebug('system', '狼人', 'batch error: ' + (e && e.message || e)); }
        } else {
          // polling：每只狼单独决策（看到之前狼的频道发言）
          var silentWolfMsgs = [];
          for (var wi = 0; wi < aliveWolves.length; wi++) {
            var wolf = aliveWolves[wi];
            try {
              var priorMsgs = silentWolfMsgs.length > 0 ? '【狼人频道已有发言】\n' + silentWolfMsgs.join('\n') + '\n' : '';
              var cp = await buildCharPrompt(roche, wolf, priorMsgs + '你是狼人。请选择今晚要击杀的目标（回复座位号）。你和同伴共同决定。');
              var cr = await aiChat(roche, { messages: cp.messages, temperature: 0.7 });
              appendDebug('response', wolf.name, cr.text);
              var cd = parseJsonResponse(cr.text);
              appendDebug('action', wolf.name, JSON.stringify(cd, null, 2));
              if (cd) {
                appendDebug('thinking', wolf.name, cd.thinking || '');
                appendDebug('heart', wolf.name, cd.heart || '', cd.heartZh || '');
                appendCharHistory(wolf.id, st.day, 'night', 'heart', cd.heart || '');
                appendCharHistory(wolf.id, st.day, 'night', 'action', '选择击杀' + (cd.target || '?') + '号');
                if (st.spectator && cd.speech) {
                  appendGamelog(container, '[狼人频道] ' + wolf.seat + '号(' + wolf.name + ')：' + cd.speech, 'private', cd.speechZh || '');
                }
                if (cd.target != null) {
                  var tt = parseInt(cd.target, 10);
                  if (!isNaN(tt)) {
                    wolfVotes[tt] = (wolfVotes[tt] || 0) + 1;
                    silentWolfMsgs.push(wolf.seat + '号(' + wolf.name + ')：建议杀' + tt + '号');
                  }
                }
              }
            } catch (e) { appendDebug('system', wolf.name, 'error: ' + (e && e.message || e)); }
          }
        }
        // 多数票
        var maxV = 0, winSeat = null;
        for (var v in wolfVotes) {
          if (wolfVotes[v] > maxV) { maxV = wolfVotes[v]; winSeat = parseInt(v, 10); }
        }
        if (winSeat != null) {
          var validT = st.players.find(function (p) { return p.seat === winSeat && p.alive && p.role !== '狼人'; });
          if (validT) st.nightActions.wolvesTarget = winSeat;
        }
      }
    }

    // === 女巫阶段 ===
    var witch = st.players.find(function (p) { return p.alive && p.role === '女巫'; });
    if (witch) {
      var victim = st.nightActions.wolvesTarget;
      var canSave = !st.witchSaveUsed;
      var canPoison = !st.witchPoisonUsed;

      if (userPlayer && userPlayer.role === '女巫' && userPlayer.alive && !st.spectator) {
        // user 是女巫；规则：每晚最多使用一瓶药（解药或毒药，不可兼用）
        var usedPotionThisNight = false;
        if (canSave && victim != null) {
          var saveResult = await waitForUserInput(container, roche, 'witch_save', {
            victim: victim,
            canSave: canSave
          });
          if (saveResult && saveResult.action === 'save' && canSave && victim != null) {
            st.nightActions.witchSave = true;
            st.witchSaveUsed = true;
            appendCharHistory(userPlayer.id, st.day, 'night', 'action', '使用解药救了' + victim + '号');
            usedPotionThisNight = true;
          }
        }
        if (canPoison && !usedPotionThisNight) {
          // 女巫可毒任意存活玩家（含 user），仅排除女巫自己（不能自毒）
          var poisonTargets = st.players.filter(function (p) {
            return p.alive && p.id !== userPlayer.id;
          }).map(function (p) { return p.seat; });
          var poisonResult = await waitForUserInput(container, roche, 'witch_poison', { targets: poisonTargets });
          if (poisonResult && poisonResult.seat) {
            st.nightActions.witchPoisonTarget = poisonResult.seat;
            st.witchPoisonUsed = true;
            appendCharHistory(userPlayer.id, st.day, 'night', 'action', '使用毒药毒了' + poisonResult.seat + '号');
          }
        }
      } else {
        // 静默结算
        appendGamelog(container, '女巫正在行动…', 'transition');
        rerenderPlay(container, roche);
        var witchContext = '你是女巫。';
        if (victim != null) {
          witchContext += '今晚' + victim + '号被刀了。';
        } else {
          witchContext += '今晚没有人被刀。';
        }
        witchContext += (canSave ? '你还有解药。' : '你的解药已用。');
        witchContext += (canPoison ? '你还有毒药。' : '你的毒药已用。');
        witchContext += '请决定是否使用解药或毒药。如使用毒药，请在target中给出座位号。';

        if (st.mode === 'batch') {
          try {
            var wbp = await buildBatchPrompt(roche, witchContext + ' 仅女巫角色需要行动。');
            var wbr = await aiChat(roche, { messages: wbp.messages, temperature: 0.7 });
            appendDebug('response', '批量', wbr.text);
            var wdArr = parseJsonResponse(wbr.text);
            appendDebug('action', '批量', JSON.stringify(wdArr, null, 2));
            if (Array.isArray(wdArr) && wdArr.length > 0) {
              var wd = wdArr.find(function (d) { return d.seat === witch.seat; });
              if (!wd) wd = wdArr[0];
              if (wd) {
                var usedPotionAI = false;
                if (wd.action && wd.action.indexOf('解药') !== -1 && canSave && victim != null) {
                  st.nightActions.witchSave = true;
                  st.witchSaveUsed = true;
                  usedPotionAI = true;
                }
                if (!usedPotionAI && wd.target != null && canPoison && wd.action && wd.action.indexOf('毒') !== -1) {
                  var pt = parseInt(wd.target, 10);
                  var ptValid = st.players.find(function (p) { return p.seat === pt && p.alive && p.id !== witch.id; });
                  if (ptValid) {
                    st.nightActions.witchPoisonTarget = pt;
                    st.witchPoisonUsed = true;
                  }
                }
                appendDebug('thinking', witch.name, wd.thinking || '');
                appendDebug('heart', witch.name, wd.heart || '', wd.heartZh || '');
                appendCharHistory(witch.id, st.day, 'night', 'heart', wd.heart || '');
                appendCharHistory(witch.id, st.day, 'night', 'action', wd.action || '');
              }
            }
          } catch (e) { appendDebug('system', '女巫', 'batch error: ' + (e && e.message || e)); }
        } else {
          try {
            var wcp = await buildCharPrompt(roche, witch, witchContext);
            var wcr = await aiChat(roche, { messages: wcp.messages, temperature: 0.7 });
            appendDebug('response', witch.name, wcr.text);
            var wcd = parseJsonResponse(wcr.text);
            appendDebug('action', witch.name, JSON.stringify(wcd, null, 2));
            if (wcd) {
              var usedPotionAI2 = false;
              if (wcd.action && wcd.action.indexOf('解药') !== -1 && canSave && victim != null) {
                st.nightActions.witchSave = true;
                st.witchSaveUsed = true;
                usedPotionAI2 = true;
              }
              if (!usedPotionAI2 && wcd.target != null && canPoison && wcd.action && wcd.action.indexOf('毒') !== -1) {
                var pt2 = parseInt(wcd.target, 10);
                var pt2Valid = st.players.find(function (p) { return p.seat === pt2 && p.alive && p.id !== witch.id; });
                if (pt2Valid) {
                  st.nightActions.witchPoisonTarget = pt2;
                  st.witchPoisonUsed = true;
                }
              }
              appendDebug('thinking', witch.name, wcd.thinking || '');
              appendDebug('heart', witch.name, wcd.heart || '', wcd.heartZh || '');
              appendCharHistory(witch.id, st.day, 'night', 'heart', wcd.heart || '');
              appendCharHistory(witch.id, st.day, 'night', 'action', wcd.action || '');
            }
          } catch (e) { appendDebug('system', witch.name, 'error: ' + (e && e.message || e)); }
        }
      }
    }

    // === 预言家阶段 ===
    var seer = st.players.find(function (p) { return p.alive && p.role === '预言家'; });
    if (seer) {
      if (userPlayer && userPlayer.role === '预言家' && userPlayer.alive && !st.spectator) {
        // user 是预言家
        var seerTargets = st.players.filter(function (p) {
          return p.alive && !p.isUser;
        }).map(function (p) { return p.seat; });
        var seerResult = await waitForUserInput(container, roche, 'seer_check', { targets: seerTargets });
        if (seerResult && seerResult.seat) {
          st.nightActions.seerCheckTarget = seerResult.seat;
          var checkedP = st.players.find(function (p) { return p.seat === seerResult.seat; });
          var checkRes = (checkedP && checkedP.role === '狼人') ? '狼人' : '好人';
          st.nightActions.seerResult = checkRes;
          appendGamelog(container, '[DM(私窗)] ' + seerResult.seat + '号是' + checkRes, 'private');
          appendCharHistory(userPlayer.id, st.day, 'night', 'action', '查验' + seerResult.seat + '号，结果：' + checkRes);
        }
      } else {
        // 静默结算
        appendGamelog(container, '预言家正在行动…', 'transition');
        rerenderPlay(container, roche);
        var seerTargets2 = st.players.filter(function (p) {
          return p.alive && p.id !== seer.id;
        }).map(function (p) { return p.seat; });
        var seerContext = '你是预言家。请选择今晚要查验的玩家（回复座位号）。可选目标：' + seerTargets2.join(', ');

        var seerTargetSeat = null;
        if (st.mode === 'batch') {
          try {
            var sbp = await buildBatchPrompt(roche, seerContext + ' 仅预言家角色需要行动。');
            var sbr = await aiChat(roche, { messages: sbp.messages, temperature: 0.7 });
            appendDebug('response', '批量', sbr.text);
            var sdArr = parseJsonResponse(sbr.text);
            appendDebug('action', '批量', JSON.stringify(sdArr, null, 2));
            if (Array.isArray(sdArr) && sdArr.length > 0) {
              var sd = sdArr.find(function (d) { return d.seat === seer.seat; });
              if (!sd) sd = sdArr[0];
              if (sd && sd.target != null) {
                seerTargetSeat = parseInt(sd.target, 10);
                appendDebug('thinking', seer.name, sd.thinking || '');
                appendDebug('heart', seer.name, sd.heart || '', sd.heartZh || '');
                appendCharHistory(seer.id, st.day, 'night', 'heart', sd.heart || '');
              }
            }
          } catch (e) { appendDebug('system', '预言家', 'batch error: ' + (e && e.message || e)); }
        } else {
          try {
            var scp = await buildCharPrompt(roche, seer, seerContext);
            var scr = await aiChat(roche, { messages: scp.messages, temperature: 0.7 });
            appendDebug('response', seer.name, scr.text);
            var scd = parseJsonResponse(scr.text);
            appendDebug('action', seer.name, JSON.stringify(scd, null, 2));
            if (scd && scd.target != null) {
              seerTargetSeat = parseInt(scd.target, 10);
              appendDebug('thinking', seer.name, scd.thinking || '');
              appendDebug('heart', seer.name, scd.heart || '', scd.heartZh || '');
              appendCharHistory(seer.id, st.day, 'night', 'heart', scd.heart || '');
            }
          } catch (e) { appendDebug('system', seer.name, 'error: ' + (e && e.message || e)); }
        }

        if (seerTargetSeat != null) {
          var cp2 = st.players.find(function (p) { return p.seat === seerTargetSeat && p.alive; });
          if (cp2) {
            st.nightActions.seerCheckTarget = seerTargetSeat;
            var cr2 = cp2.role === '狼人' ? '狼人' : '好人';
            st.nightActions.seerResult = cr2;
            // 私密记录到预言家的 charHistory（下次提示词可见）
            appendCharHistory(seer.id, st.day, 'night', 'action', '查验' + seerTargetSeat + '号，结果：' + cr2);
          }
        }
      }
    }

    // 旁观模式：显示所有夜间行动（上帝视角）
    if (st.spectator) {
      if (st.nightActions.guardTarget != null) appendGamelog(container, '[守卫] 守护了 ' + st.nightActions.guardTarget + '号', 'private');
      if (st.nightActions.wolvesTarget != null) appendGamelog(container, '[狼人] 选择击杀 ' + st.nightActions.wolvesTarget + '号', 'private');
      if (st.nightActions.witchSave) appendGamelog(container, '[女巫] 使用解药', 'private');
      if (st.nightActions.witchPoisonTarget != null) appendGamelog(container, '[女巫] 毒了 ' + st.nightActions.witchPoisonTarget + '号', 'private');
      if (st.nightActions.seerCheckTarget != null) appendGamelog(container, '[预言家] 查验 ' + st.nightActions.seerCheckTarget + '号，结果：' + st.nightActions.seerResult, 'private');
    }

    // === 结算死亡 ===
    // 狼刀：守卫守护或女巫救药任一生效 → 存活
    var guarded = (st.nightActions.guardTarget != null && st.nightActions.guardTarget === st.nightActions.wolvesTarget);
    var saved = st.nightActions.witchSave;
    var wolfKillHappens = st.nightActions.wolvesTarget != null && !guarded && !saved;
    if (wolfKillHappens) {
      var vP = st.players.find(function (p) { return p.seat === st.nightActions.wolvesTarget; });
      if (vP && vP.alive) {
        vP.alive = false;
        st.pendingDeaths.push(vP.seat);
      }
    }
    // 女巫毒
    if (st.nightActions.witchPoisonTarget != null) {
      var pP = st.players.find(function (p) { return p.seat === st.nightActions.witchPoisonTarget; });
      if (pP && pP.alive) {
        pP.alive = false;
        st.pendingDeaths.push(pP.seat);
      }
    }

    // 死亡结算日志（便于在系统日志面板核对毒/救/守是否生效）
    appendDebug('system', 'death', '夜刀目标:' + (st.nightActions.wolvesTarget != null ? st.nightActions.wolvesTarget : '无') +
      ' 守卫:' + (st.nightActions.guardTarget != null ? st.nightActions.guardTarget : '无') +
      ' 救:' + (st.nightActions.witchSave ? '是' : '否') +
      ' 毒:' + (st.nightActions.witchPoisonTarget != null ? st.nightActions.witchPoisonTarget : '无') +
      ' 死亡:' + (st.pendingDeaths.length > 0 ? st.pendingDeaths.join(',') : '无'));

    // 记录今晚守护目标，供下一晚连守判定
    st.lastGuardTarget = st.nightActions.guardTarget || null;

    rerenderPlay(container, roche);

    // 检查游戏结束
    if (checkGameOver(roche)) {
      appendGamelog(container, '游戏结束！' + st.winner + '阵营胜利！', 'dm');
      return;
    }
    // 夜晚结束，保存存档
    saveWerewolfState(roche);
  }

  // 白天发言流程
  async function runDaySpeak(container, roche) {
    var st = werewolfState;
    // 恢复时 _resumePhase 为 'day_speak'，跳过开场公告并从 speakIndex 继续
    var resuming = (st._resumePhase === 'day_speak');
    if (resuming) st._resumePhase = null;
    st.subPhase = 'day_speak';

    if (!resuming) {
      st.speakIndex = 1;
      appendGamelog(container, '天亮了。', 'dm');
      if (st.pendingDeaths.length === 0) {
        appendGamelog(container, '昨晚是平安夜。', 'dm');
      } else {
        var deathMsg = '昨晚，' + st.pendingDeaths.join('号、') + '号玩家出局。';
        appendGamelog(container, deathMsg, 'dm');
      }
      st.pendingDeaths = [];
      rerenderPlay(container, roche);
      await sleep(500);
    }

    for (var seat = (resuming ? st.speakIndex : 1); seat <= st.count; seat++) {
      var player = st.players.find(function (p) { return p.seat === seat; });
      if (!player) continue;
      if (!player.alive) {
        appendGamelog(container, seat + '号已出局', 'msg');
        continue;
      }

      st.speakIndex = seat;

      if (player.isUser && !st.spectator) {
        // user 发言
        var speakResult = await waitForUserInput(container, roche, 'day_speak', { seat: seat });
        var speech = (speakResult && speakResult.speech) || '(无发言)';
        appendGamelog(container, seat + '号(' + player.name + ')：' + speech, 'msg');
        appendCharHistory(player.id, st.day, 'day_speak', 'speech', speech);
      } else {
        // AI char 发言（batch 和 polling 都逐个调用，保证视野隔离）
        var speakContext = '现在是白天发言环节。请基于你的身份、人设、记忆和场上公开信息进行发言。发言要符合你的角色人格，不要使用游戏套话。请在speech字段给出你的发言内容。';
        appendGamelog(container, seat + '号正在思考发言…', 'transition');
        rerenderPlay(container, roche);
        try {
          var sp = await buildCharPrompt(roche, player, speakContext);
          var sr = await aiChat(roche, { messages: sp.messages, temperature: 0.7 });
          appendDebug('response', player.name, sr.text);
          var sd = parseJsonResponse(sr.text);
          appendDebug('action', player.name, JSON.stringify(sd, null, 2));
          if (sd) {
            // 思维链 + 心声仅进 debugLog，不进主 gamelog
            appendDebug('thinking', player.name, sd.thinking || '');
            appendDebug('heart', player.name, sd.heart || '', sd.heartZh || '');
            var speech2 = sd.speech || '(无发言)';
            var speechZh2 = sd.speechZh || '';
            appendGamelog(container, seat + '号(' + player.name + ')：' + speech2, 'msg', speechZh2);
            appendCharHistory(player.id, st.day, 'day_speak', 'heart', sd.heart || '');
            appendCharHistory(player.id, st.day, 'day_speak', 'speech', speech2);
          } else {
            appendGamelog(container, seat + '号(' + player.name + ')：(发言异常)', 'msg');
          }
        } catch (e) {
          appendDebug('system', player.name, '发言 error: ' + (e && e.message || e));
          appendGamelog(container, seat + '号(' + player.name + ')：(发言异常)', 'msg');
        }
        await sleep(300);
      }
    }
    // 白天发言结束，保存存档
    saveWerewolfState(roche);
  }

  // 投票流程
  async function runDayVote(container, roche) {
    var st = werewolfState;
    st.subPhase = 'day_vote';

    // 恢复时跳过"投票阶段开始"公告
    if (st._resumePhase === 'day_vote') {
      st._resumePhase = null;
    } else {
      appendGamelog(container, '投票阶段开始。', 'dm');
    }
    rerenderPlay(container, roche);
    await sleep(300);

    var votes = {}; // seat -> count
    var alivePlayers = st.players.filter(function (p) { return p.alive; });

    // AI char 投票
    for (var i = 0; i < alivePlayers.length; i++) {
      var player = alivePlayers[i];
      if (player.isUser && !st.spectator) continue;

      var voteTargets = st.players.filter(function (p) {
        return p.alive && p.seat !== player.seat;
      }).map(function (p) { return p.seat; });

      var voteContext = '现在是投票阶段。请选择你要投出局的玩家（在target字段回复座位号）。可选目标：' + voteTargets.join(', ');
      appendGamelog(container, player.seat + '号正在思考投票…', 'transition');
      rerenderPlay(container, roche);
      try {
        var vp = await buildCharPrompt(roche, player, voteContext);
        var vr = await aiChat(roche, { messages: vp.messages, temperature: 0.7 });
        appendDebug('response', player.name, vr.text);
        var vd = parseJsonResponse(vr.text);
        appendDebug('action', player.name, JSON.stringify(vd, null, 2));
        if (vd && vd.target != null) {
          var target = parseInt(vd.target, 10);
          var validTarget = st.players.find(function (p) { return p.seat === target && p.alive && p.seat !== player.seat; });
          if (validTarget) {
            votes[target] = (votes[target] || 0) + 1;
            appendGamelog(container, player.seat + '号 投 ' + target + '号', 'vote');
            appendDebug('thinking', player.name, vd.thinking || '');
            appendDebug('heart', player.name, vd.heart || '', vd.heartZh || '');
            appendCharHistory(player.id, st.day, 'day_vote', 'vote', '投了' + target + '号' + (vd.heart ? '（' + vd.heart + '）' : ''));
          }
        }
      } catch (e) { appendDebug('system', player.name, '投票 error: ' + (e && e.message || e)); }
    }

    // user 投票
    var userPlayer = st.players.find(function (p) { return p.isUser; });
    if (userPlayer && userPlayer.alive && !st.spectator) {
      var userVoteTargets = st.players.filter(function (p) {
        return p.alive && p.seat !== userPlayer.seat;
      }).map(function (p) { return p.seat; });
      var voteResult = await waitForUserInput(container, roche, 'day_vote', { targets: userVoteTargets });
      if (voteResult && voteResult.seat) {
        votes[voteResult.seat] = (votes[voteResult.seat] || 0) + 1;
        appendGamelog(container, userPlayer.seat + '号 投 ' + voteResult.seat + '号', 'vote');
        appendCharHistory(userPlayer.id, st.day, 'day_vote', 'vote', '投了' + voteResult.seat + '号');
      } else {
        appendGamelog(container, userPlayer.seat + '号弃票', 'vote');
      }
    }

    // 统计票数
    var maxVotes = 0;
    var winners = [];
    for (var s in votes) {
      if (votes[s] > maxVotes) {
        maxVotes = votes[s];
        winners = [parseInt(s, 10)];
      } else if (votes[s] === maxVotes) {
        winners.push(parseInt(s, 10));
      }
    }

    if (winners.length === 1) {
      var outSeat = winners[0];
      var outPlayer = st.players.find(function (p) { return p.seat === outSeat; });
      if (outPlayer) {
        outPlayer.alive = false;
        appendGamelog(container, '投票结果：' + outSeat + '号出局', 'dm');
      }
    } else {
      appendGamelog(container, '投票结果：平票，无人出局', 'dm');
    }

    rerenderPlay(container, roche);
    await sleep(500);

    checkGameOver(roche);
    // 投票结束，保存存档
    if (werewolfState && !werewolfState.gameOver) {
      saveWerewolfState(roche);
    }
  }

  /* ============================================================
   * 视图：添加 / 编辑游戏表单
   * ============================================================ */
  function showForm(container, roche, existing) {
    var isEdit = !!existing;

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">' + (isEdit ? '编辑游戏' : '添加游戏') + '</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回">返回</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">' +
      '<div class="mg-form-wrap">' +
      '<div class="mg-field-row">' +
      '<div class="mg-field" style="max-width:80px;">' +
      '<label class="mg-label">图标</label>' +
      '<input class="mg-input" id="mg-emoji" value="' + esc(existing ? existing.emoji : '') + '" maxlength="4" placeholder="图标">' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">游戏名称</label>' +
      '<input class="mg-input" id="mg-name" value="' + esc(existing ? existing.name : '') + '" placeholder="例如：狼人杀">' +
      '</div>' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">简介</label>' +
      '<input class="mg-input" id="mg-desc" value="' + esc(existing ? existing.description : '') + '" placeholder="一句话描述这个游戏">' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">游戏 HTML 代码</label>' +
      '<textarea class="mg-textarea" id="mg-html" placeholder="粘贴完整的 HTML 游戏代码（包含 <!DOCTYPE html> 或 <html>...）">' + esc(existing ? existing.html : '') + '</textarea>' +
      '<div class="mg-hint">支持完整的 HTML 文档。游戏内可使用 window.RocheGame.aiChat() 等 API 调用 Roche AI 能力。</div>' +
      '</div>' +
      '<div class="mg-form-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="cancel">取消</button>' +
      '<button class="mg-btn mg-btn-primary" data-action="save">' + (isEdit ? '保存修改' : '添加游戏') + '</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    container.innerHTML = html;

    // 绑定事件
    container.querySelector('[data-action="back"]').onclick = function () {
      showHub(container, roche);
    };
    container.querySelector('[data-action="cancel"]').onclick = function () {
      showHub(container, roche);
    };
    container.querySelector('[data-action="save"]').onclick = async function () {
      var emoji = container.querySelector('#mg-emoji').value.trim() || '';
      var name = container.querySelector('#mg-name').value.trim();
      var desc = container.querySelector('#mg-desc').value.trim();
      var htmlContent = container.querySelector('#mg-html').value.trim();

      if (!name) {
        roche.ui.toast('请填写游戏名称');
        return;
      }
      if (!htmlContent) {
        roche.ui.toast('请填写游戏 HTML 代码');
        return;
      }

      var customGames = await getCustomGames(roche);

      if (isEdit) {
        // 更新已有游戏
        var idx = customGames.findIndex(function (g) { return g.id === existing.id; });
        if (idx !== -1) {
          customGames[idx].emoji = emoji;
          customGames[idx].name = name;
          customGames[idx].description = desc;
          customGames[idx].html = htmlContent;
          customGames[idx].updatedAt = Date.now();
        }
      } else {
        // 添加新游戏
        customGames.push({
          id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
          emoji: emoji,
          name: name,
          description: desc,
          html: htmlContent,
          createdAt: Date.now()
        });
      }

      await setCustomGames(roche, customGames);
      roche.ui.toast(isEdit ? '修改已保存' : '游戏已添加');
      showHub(container, roche);
    };
  }

  /* ============================================================
   * 确认删除
   * ============================================================ */
  async function confirmDelete(container, roche, game) {
    var ok = await roche.ui.confirm({
      title: '删除游戏',
      message: '确定要删除「' + game.name + '」吗？此操作不可撤销。'
    });
    if (!ok) return;

    var customGames = await getCustomGames(roche);
    customGames = customGames.filter(function (g) { return g.id !== game.id; });
    await setCustomGames(roche, customGames);
    roche.ui.toast('已删除「' + game.name + '」');
    showHub(container, roche);
  }

  /* ============================================================
   * 视图：预设管理
   * ============================================================ */
  async function showPresets(container, roche) {
    var presets = await getPresets(roche);

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">预设管理</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回">返回</button>' +
      '<button class="mg-btn mg-btn-primary" data-action="new">新建预设</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">';

    if (presets.length === 0) {
      html +=
        '<div class="mg-empty">' +
        '<div class="mg-empty-icon"></div>' +
        '<div>还没有预设，点击右上角「新建预设」创建</div>' +
        '</div>';
    } else {
      presets.forEach(function (p) {
        var charCount = Array.isArray(p.charIds) ? p.charIds.length : 0;
        var sessCount = Array.isArray(p.sessions) ? p.sessions.length : 0;
        html +=
          '<div class="mg-preset-row" data-id="' + esc(p.id) + '">' +
          '<div class="mg-preset-info">' +
          '<p class="mg-preset-name">' + esc(p.name) + '</p>' +
          '<div class="mg-preset-summary">角色 ' + charCount + ' 个 · 会话 ' + sessCount + ' 个</div>' +
          '</div>' +
          '<div class="mg-preset-actions">' +
          '<button class="mg-btn mg-btn-ghost mg-btn-sm" data-action="edit" data-id="' + esc(p.id) + '">编辑</button>' +
          '<button class="mg-btn mg-btn-danger mg-btn-sm" data-action="delete" data-id="' + esc(p.id) + '">删除</button>' +
          '</div>' +
          '</div>';
      });
    }

    html += '</div></div>';

    container.innerHTML = html;

    // 绑定事件
    container.querySelector('[data-action="back"]').onclick = function () {
      showHub(container, roche);
    };
    container.querySelector('[data-action="new"]').onclick = function () {
      showPresetForm(container, roche, null);
    };

    // 绑定编辑按钮
    var editBtns = container.querySelectorAll('[data-action="edit"]');
    editBtns.forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.dataset.id;
        var existing = presets.find(function (p) { return p.id === id; });
        if (existing) showPresetForm(container, roche, existing);
      };
    });

    // 绑定删除按钮
    var delBtns = container.querySelectorAll('[data-action="delete"]');
    delBtns.forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.dataset.id;
        var existing = presets.find(function (p) { return p.id === id; });
        if (!existing) return;
        var ok = await roche.ui.confirm({
          title: '删除预设',
          message: '确定删除「' + existing.name + '」？'
        });
        if (!ok) return;
        var list = await getPresets(roche);
        list = list.filter(function (p) { return p.id !== id; });
        await setPresets(roche, list);
        roche.ui.toast('已删除');
        showPresets(container, roche);
      };
    });
  }

  /* ============================================================
   * 视图：预设表单（新建 / 编辑）
   * ============================================================ */
  async function showPresetForm(container, roche, existing) {
    var isEdit = !!existing;

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">' + (isEdit ? '编辑预设' : '新建预设') + '</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回">返回</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">' +
      '<div class="mg-form-wrap">' +
      '<div class="mg-field">' +
      '<label class="mg-label">预设名称</label>' +
      '<input class="mg-input" id="mg-preset-name" value="' + esc(existing ? existing.name : '') + '" placeholder="例如：悬疑推理预设">' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">用户人设</label>' +
      '<select class="mg-input" id="mg-preset-user"><option value="">加载中...</option></select>' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">角色人设（多选）</label>' +
      '<div class="mg-check-list" id="mg-preset-chars"><div class="mg-loading">加载中...</div></div>' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">挂载会话（多选）</label>' +
      '<div class="mg-check-list" id="mg-preset-sessions"><div class="mg-loading">加载中...</div></div>' +
      '</div>' +
      '<div class="mg-form-actions">' +
      '<button class="mg-btn mg-btn-primary" data-action="save">保存</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    container.innerHTML = html;

    // 返回按钮
    container.querySelector('[data-action="back"]').onclick = function () {
      showPresets(container, roche);
    };

    // 异步加载用户人设
    var userSel = container.querySelector('#mg-preset-user');
    var userPersonas = [];
    try {
      userPersonas = await roche.persona.getUserPersonas();
    } catch (e) {
      userPersonas = [];
    }
    if (!Array.isArray(userPersonas)) userPersonas = [];
    var userOpts = '<option value="">（不指定）</option>';
    if (userPersonas.length === 0) {
      userOpts += '<option value="" disabled>暂无用户人设</option>';
    } else {
      userPersonas.forEach(function (p) {
        var pid = esc(p.id || '');
        var pname = esc(p.name || p.handle || '未命名');
        var sel = (existing && existing.userPersonaId === p.id) ? ' selected' : '';
        userOpts += '<option value="' + pid + '"' + sel + '>' + pname + '</option>';
      });
    }
    userSel.innerHTML = userOpts;

    // 异步加载角色人设
    var charsBox = container.querySelector('#mg-preset-chars');
    var characters = [];
    try {
      characters = await roche.character.list();
    } catch (e) {
      characters = [];
    }
    if (!Array.isArray(characters)) characters = [];
    var charCheckedIds = (existing && Array.isArray(existing.charIds)) ? existing.charIds : [];
    var charsHtml = '';
    if (characters.length === 0) {
      charsHtml = '<div class="mg-loading">暂无角色人设</div>';
    } else {
      characters.forEach(function (c) {
        var cid = esc(c.id || '');
        var cname = esc(c.handle || c.name || '未命名');
        var checked = (charCheckedIds.indexOf(c.id) !== -1) ? ' checked' : '';
        charsHtml +=
          '<div class="mg-check-item">' +
          '<label><input type="checkbox" value="' + cid + '"' + checked + '>' + cname + '</label>' +
          '</div>';
      });
    }
    charsBox.innerHTML = charsHtml;

    // 异步加载会话
    var sessBox = container.querySelector('#mg-preset-sessions');
    var conversations = [];
    try {
      conversations = await roche.conversation.list();
    } catch (e) {
      conversations = [];
    }
    if (!Array.isArray(conversations)) conversations = [];
    var existingSessions = (existing && Array.isArray(existing.sessions)) ? existing.sessions : [];
    var sessHtml = '';
    if (conversations.length === 0) {
      sessHtml = '<div class="mg-loading">暂无会话</div>';
    } else {
      conversations.forEach(function (conv) {
        var convId = conv.id || conv.conversationId;
        var cidEsc = esc(convId || '');
        var cname = esc(conv.name || conv.title || conv.handle || ('会话' + convId));
        var sessConf = existingSessions.find(function (s) { return s.conversationId === convId; });
        var checked = sessConf ? ' checked' : '';
        var mountCore = sessConf ? (sessConf.mountCore !== false) : true;
        var factCount = sessConf ? (sessConf.factCount != null ? sessConf.factCount : 5) : 5;
        var shortTermCount = sessConf ? (sessConf.shortTermCount != null ? sessConf.shortTermCount : 20) : 20;
        var configDisplay = sessConf ? 'flex' : 'none';
        sessHtml +=
          '<div class="mg-check-item" data-session="' + cidEsc + '">' +
          '<label><input type="checkbox" class="mg-sess-check" value="' + cidEsc + '"' + checked + '>' + cname + '</label>' +
          '<div class="mg-check-config" style="display:' + configDisplay + '">' +
          '<label><input type="checkbox" class="mg-sess-mount"' + (mountCore ? ' checked' : '') + '>核心记忆</label>' +
          '<label>事实记忆<input type="number" class="mg-sess-fact" min="0" value="' + factCount + '"></label>' +
          '<label>短期记忆<input type="number" class="mg-sess-short" min="0" value="' + shortTermCount + '"></label>' +
          '</div>' +
          '</div>';
      });
    }
    sessBox.innerHTML = sessHtml;

    // 绑定会话复选框切换显示配置
    var sessChecks = container.querySelectorAll('.mg-sess-check');
    sessChecks.forEach(function (cb) {
      cb.onchange = function () {
        var item = cb.closest('.mg-check-item');
        if (!item) return;
        var config = item.querySelector('.mg-check-config');
        if (config) config.style.display = cb.checked ? 'flex' : 'none';
      };
    });

    // 绑定保存按钮
    container.querySelector('[data-action="save"]').onclick = async function () {
      var name = container.querySelector('#mg-preset-name').value.trim();
      if (!name) {
        roche.ui.toast('请填写预设名称');
        return;
      }
      var userPersonaId = container.querySelector('#mg-preset-user').value;
      var charIds = [];
      var charChecks = charsBox.querySelectorAll('input[type="checkbox"]:checked');
      charChecks.forEach(function (cb) {
        charIds.push(cb.value);
      });
      var sessions = [];
      var sessItems = sessBox.querySelectorAll('.mg-check-item');
      sessItems.forEach(function (item) {
        var cb = item.querySelector('.mg-sess-check');
        if (!cb || !cb.checked) return;
        var convId = cb.value;
        var mountEl = item.querySelector('.mg-sess-mount');
        var factEl = item.querySelector('.mg-sess-fact');
        var shortEl = item.querySelector('.mg-sess-short');
        var mountCore = mountEl ? mountEl.checked : true;
        var factCount = factEl ? parseInt(factEl.value, 10) : 5;
        var shortTermCount = shortEl ? parseInt(shortEl.value, 10) : 20;
        if (isNaN(factCount) || factCount < 0) factCount = 5;
        if (isNaN(shortTermCount) || shortTermCount < 0) shortTermCount = 20;
        sessions.push({
          conversationId: convId,
          mountCore: mountCore,
          factCount: factCount,
          shortTermCount: shortTermCount
        });
      });

      var preset = {
        id: existing ? existing.id : ('preset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
        name: name,
        userPersonaId: userPersonaId,
        charIds: charIds,
        sessions: sessions
      };

      var list = await getPresets(roche);
      if (existing) {
        var idx = list.findIndex(function (p) { return p.id === existing.id; });
        if (idx !== -1) {
          list[idx] = preset;
        } else {
          list.push(preset);
        }
      } else {
        list.push(preset);
      }
      await setPresets(roche, list);
      roche.ui.toast('已保存');
      showPresets(container, roche);
    };
  }

  /* ============================================================
   * 视图：API 预设管理
   * ============================================================ */
  async function showApiPresets(container, roche) {
    var presets = await getApiPresets(roche);

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">API 设置</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回">返回</button>' +
      '<button class="mg-btn mg-btn-primary" data-action="new">新建 API 预设</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">';

    if (presets.length === 0) {
      html +=
        '<div class="mg-empty">' +
        '<div class="mg-empty-icon"></div>' +
        '<div>还没有 API 预设，点击右上角「新建 API 预设」创建</div>' +
        '</div>';
    } else {
      presets.forEach(function (p) {
        var modelDisplay = p.model ? esc(p.model) : '(未选择模型)';
        var baseUrlDisplay = p.baseUrl ? esc(p.baseUrl) : '(未设置)';
        html +=
          '<div class="mg-preset-row" data-id="' + esc(p.id) + '">' +
          '<div class="mg-preset-info">' +
          '<p class="mg-preset-name">' + esc(p.name || '未命名') + '</p>' +
          '<div class="mg-preset-summary">BaseURL: ' + baseUrlDisplay + ' · 模型: ' + modelDisplay + '</div>' +
          '</div>' +
          '<div class="mg-preset-actions">' +
          '<button class="mg-btn mg-btn-ghost mg-btn-sm" data-action="edit" data-id="' + esc(p.id) + '">编辑</button>' +
          '<button class="mg-btn mg-btn-danger mg-btn-sm" data-action="delete" data-id="' + esc(p.id) + '">删除</button>' +
          '</div>' +
          '</div>';
      });
    }

    html += '</div></div>';

    container.innerHTML = html;

    container.querySelector('[data-action="back"]').onclick = function () {
      showHub(container, roche);
    };
    container.querySelector('[data-action="new"]').onclick = function () {
      showApiPresetForm(container, roche, null);
    };

    var editBtns = container.querySelectorAll('[data-action="edit"]');
    editBtns.forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.dataset.id;
        var existing = presets.find(function (p) { return p.id === id; });
        if (existing) showApiPresetForm(container, roche, existing);
      };
    });

    var delBtns = container.querySelectorAll('[data-action="delete"]');
    delBtns.forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.dataset.id;
        var existing = presets.find(function (p) { return p.id === id; });
        if (!existing) return;
        var ok = await roche.ui.confirm({
          title: '删除 API 预设',
          message: '确定删除「' + (existing.name || '未命名') + '」？'
        });
        if (!ok) return;
        var list = await getApiPresets(roche);
        list = list.filter(function (p) { return p.id !== id; });
        await setApiPresets(roche, list);
        roche.ui.toast('已删除');
        showApiPresets(container, roche);
      };
    });
  }

  /* ============================================================
   * 视图：API 预设表单（新建 / 编辑）
   * ============================================================ */
  async function showApiPresetForm(container, roche, existing) {
    var isEdit = !!existing;

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">' + (isEdit ? '编辑 API 预设' : '新建 API 预设') + '</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回">返回</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">' +
      '<div class="mg-form-wrap">' +
      '<div class="mg-field">' +
      '<label class="mg-label">预设名称</label>' +
      '<input class="mg-input" id="mg-api-name" value="' + esc(existing ? existing.name : '') + '" placeholder="例如：我的 OpenAI">' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">API Base URL</label>' +
      '<input class="mg-input" id="mg-api-baseurl" value="' + esc(existing ? existing.baseUrl : '') + '" placeholder="https://api.openai.com/v1">' +
      '<div class="mg-hint">OpenAI 兼容接口的根地址，例如 https://api.openai.com/v1</div>' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">API Key</label>' +
      '<input class="mg-input" id="mg-api-key" type="password" value="' + esc(existing ? existing.apiKey : '') + '" placeholder="sk-xxx">' +
      '</div>' +
      '<div class="mg-field">' +
      '<label class="mg-label">模型</label>' +
      '<select class="mg-input" id="mg-api-model"><option value="">' + (existing && existing.model ? esc(existing.model) : '请先测试连接或手动输入') + '</option></select>' +
      '<input class="mg-input" id="mg-api-model-manual" style="margin-top:8px;" value="' + (existing ? esc(existing.model || '') : '') + '" placeholder="也可手动输入模型名（回填此处）">' +
      '<div class="mg-hint">点击下方按钮测试连接并自动获取可用模型列表</div>' +
      '</div>' +
      '<div class="mg-form-actions" style="justify-content:flex-start;">' +
      '<button class="mg-btn mg-btn-ghost" data-action="test">测试连接并获取模型</button>' +
      '<span id="mg-api-test-status" style="margin-left:10px;font-size:12px;color:#8a8578;"></span>' +
      '</div>' +
      '<div class="mg-form-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="cancel">取消</button>' +
      '<button class="mg-btn mg-btn-primary" data-action="save">保存</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    container.innerHTML = html;

    container.querySelector('[data-action="back"]').onclick = function () {
      showApiPresets(container, roche);
    };
    container.querySelector('[data-action="cancel"]').onclick = function () {
      showApiPresets(container, roche);
    };

    // 缓存的模型列表（用于后续保存时取值）
    var cachedModels = (existing && Array.isArray(existing.models)) ? existing.models.slice() : [];
    var modelSel = container.querySelector('#mg-api-model');
    var modelManual = container.querySelector('#mg-api-model-manual');

    // 初始化下拉：若已有缓存模型列表，回填
    function rebuildModelSelect(selectedModel) {
      var opts = '';
      if (cachedModels.length === 0) {
        opts = '<option value="">' + (selectedModel ? esc(selectedModel) : '请先测试连接或手动输入') + '</option>';
      } else {
        if (!selectedModel || cachedModels.indexOf(selectedModel) === -1) {
          opts += '<option value="">（选择模型）</option>';
        }
        cachedModels.forEach(function (m) {
          var sel = (m === selectedModel) ? ' selected' : '';
          opts += '<option value="' + esc(m) + '"' + sel + '>' + esc(m) + '</option>';
        });
      }
      modelSel.innerHTML = opts;
    }
    rebuildModelSelect(existing ? existing.model : '');

    // 选择下拉时同步到手动输入框
    modelSel.onchange = function () {
      modelManual.value = modelSel.value || '';
    };

    // 测试连接并获取模型
    var testBtn = container.querySelector('[data-action="test"]');
    var testStatus = container.querySelector('#mg-api-test-status');
    testBtn.onclick = async function () {
      var baseUrl = container.querySelector('#mg-api-baseurl').value.trim();
      var apiKey = container.querySelector('#mg-api-key').value.trim();
      if (!baseUrl) { roche.ui.toast('请填写 Base URL'); return; }
      if (!apiKey) { roche.ui.toast('请填写 API Key'); return; }
      testBtn.disabled = true;
      testStatus.textContent = '测试中...';
      try {
        var models = await fetchModels(baseUrl, apiKey);
        if (models.length === 0) {
          testStatus.textContent = '连接成功，但未返回模型列表';
          roche.ui.toast('连接成功，但未返回模型列表');
        } else {
          cachedModels = models;
          rebuildModelSelect(modelManual.value.trim() || (models[0] || ''));
          // 自动选中第一个模型并回填手动输入框
          if (!modelManual.value.trim() && models.length > 0) {
            modelManual.value = models[0];
          }
          // 同步下拉到手动框
          modelSel.value = modelManual.value;
          testStatus.textContent = '成功获取 ' + models.length + ' 个模型';
          roche.ui.toast('成功获取 ' + models.length + ' 个模型');
        }
      } catch (e) {
        testStatus.textContent = '失败: ' + (e && e.message || e);
        roche.ui.toast('测试失败: ' + (e && e.message || e));
      } finally {
        testBtn.disabled = false;
      }
    };

    // 保存
    container.querySelector('[data-action="save"]').onclick = async function () {
      var name = container.querySelector('#mg-api-name').value.trim();
      var baseUrl = container.querySelector('#mg-api-baseurl').value.trim();
      var apiKey = container.querySelector('#mg-api-key').value.trim();
      var model = modelManual.value.trim() || modelSel.value || '';

      if (!name) { roche.ui.toast('请填写预设名称'); return; }
      if (!baseUrl) { roche.ui.toast('请填写 Base URL'); return; }
      if (!apiKey) { roche.ui.toast('请填写 API Key'); return; }
      if (!model) { roche.ui.toast('请选择或填写模型'); return; }

      var preset = {
        id: existing ? existing.id : ('api-preset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
        name: name,
        baseUrl: baseUrl,
        apiKey: apiKey,
        model: model,
        models: cachedModels
      };

      var list = await getApiPresets(roche);
      if (existing) {
        var idx = list.findIndex(function (p) { return p.id === existing.id; });
        if (idx !== -1) {
          list[idx] = preset;
        } else {
          list.push(preset);
        }
      } else {
        list.push(preset);
      }
      await setApiPresets(roche, list);
      roche.ui.toast('已保存');
      showApiPresets(container, roche);
    };
  }

  /* ============================================================
   * 注册插件
   * ============================================================ */
  window.RochePlugin.register({
    id: "mini-games",
    name: "小游戏",
    version: "1.0.0",
    apps: [
      {
        id: "mini-games-hub",
        name: "游戏大厅",
        icon: "sports_esports",
        iconImage: "",
        async mount(container, roche) {
          // 注入样式
          styleEl = document.createElement("style");
          styleEl.textContent = CSS;
          document.head.appendChild(styleEl);

          // 渲染大厅
          await showHub(container, roche);
        },
        async unmount(container, roche) {
          // 清理游戏资源
          cleanupGame();
          // 移除样式
          if (styleEl) {
            styleEl.remove();
            styleEl = null;
          }
          // 清空容器
          container.replaceChildren();
        }
      }
    ]
  });
})();
