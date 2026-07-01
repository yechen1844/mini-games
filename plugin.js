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
 *   { id: "builtin-xxx", name: "游戏名", description: "简介", emoji: "🎮", html: "<!DOCTYPE html>..." }
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
      emoji: "🐢",
      isPlaceholder: true
    },
    {
      id: "builtin-werewolf",
      name: "狼人杀",
      description: "人设与记忆驱动的狼人杀",
      emoji: "🐺",
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
.mini-games-root {
  height: 100%;
  background: #0a0a1a;
  color: #e0e0e0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 14px;
}

/* ---------- Header ---------- */
.mg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #111128;
  border-bottom: 1px solid #1f1f3a;
  flex-shrink: 0;
}
.mg-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.mg-actions { display: flex; gap: 8px; align-items: center; }

/* ---------- Buttons ---------- */
.mg-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  font-family: inherit;
}
.mg-btn-primary { background: #6c5ce7; color: #fff; }
.mg-btn-primary:hover { background: #5a4bd1; }
.mg-btn-ghost {
  background: transparent;
  color: #777;
  padding: 8px 12px;
  font-size: 16px;
}
.mg-btn-ghost:hover { color: #fff; background: #1f1f3a; }
.mg-btn-danger { background: #e94560; color: #fff; }
.mg-btn-danger:hover { background: #d63851; }
.mg-btn-sm { padding: 5px 12px; font-size: 12px; }

/* ---------- Content ---------- */
.mg-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.mg-content::-webkit-scrollbar { width: 6px; }
.mg-content::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }

/* ---------- Section ---------- */
.mg-section-title {
  font-size: 12px;
  color: #6c5ce7;
  margin: 8px 0 14px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 600;
}

/* ---------- Grid & Cards ---------- */
.mg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}
.mg-card {
  background: #111128;
  border: 1px solid #1f1f3a;
  border-radius: 12px;
  padding: 20px 16px;
  text-align: center;
  transition: all 0.2s;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.mg-card:hover {
  border-color: #6c5ce7;
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(108, 92, 231, 0.15);
}
.mg-card-emoji { font-size: 44px; margin-bottom: 10px; line-height: 1; }
.mg-card-name { font-size: 15px; font-weight: 600; margin: 0 0 4px; color: #fff; }
.mg-card-desc {
  font-size: 12px;
  color: #888;
  margin: 0 0 14px;
  min-height: 32px;
  line-height: 1.4;
}
.mg-card-btns { display: flex; gap: 6px; }
.mg-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #1f1f3a;
  color: #6c5ce7;
  font-weight: 500;
}
.mg-card-manage {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
}
.mg-card-manage button {
  background: #1f1f3a;
  border: none;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  font-size: 12px;
  padding: 3px 7px;
  transition: all 0.15s;
}
.mg-card-manage button:hover { color: #fff; background: #2a2a4a; }

/* ---------- Game View ---------- */
.mg-game-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.mg-game-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #111128;
  border-bottom: 1px solid #1f1f3a;
  flex-shrink: 0;
}
.mg-game-bar-title { font-size: 16px; font-weight: 600; flex: 1; }
.mg-game-frame {
  flex: 1;
  border: none;
  width: 100%;
  background: #fff;
}

/* ---------- Form ---------- */
.mg-form-wrap {
  max-width: 640px;
  margin: 0 auto;
  padding: 20px 0;
}
.mg-form-title { font-size: 18px; font-weight: 600; margin: 0 0 20px; }
.mg-field { margin-bottom: 16px; }
.mg-field-row { display: flex; gap: 12px; }
.mg-field-row .mg-field { flex: 1; }
.mg-label {
  display: block;
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
  font-weight: 500;
}
.mg-input, .mg-textarea {
  width: 100%;
  background: #111128;
  border: 1px solid #1f1f3a;
  border-radius: 8px;
  color: #e0e0e0;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}
.mg-textarea {
  font-family: "Cascadia Code", "Fira Code", "Courier New", monospace;
  min-height: 320px;
  resize: vertical;
  line-height: 1.5;
}
.mg-input:focus, .mg-textarea:focus {
  outline: none;
  border-color: #6c5ce7;
}
.mg-form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}
.mg-hint {
  font-size: 12px;
  color: #555;
  margin-top: 4px;
  line-height: 1.5;
}

/* ---------- Empty ---------- */
.mg-empty {
  text-align: center;
  padding: 40px 20px;
  color: #555;
}
.mg-empty-icon { font-size: 48px; margin-bottom: 12px; }

/* ---------- Preset ---------- */
.mg-preset-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #111128;
  border: 1px solid #1f1f3a;
  border-radius: 10px;
  margin-bottom: 10px;
}
.mg-preset-info { flex: 1; }
.mg-preset-name { font-size: 15px; font-weight: 600; color: #fff; margin: 0 0 4px; }
.mg-preset-summary { font-size: 12px; color: #888; }
.mg-preset-actions { display: flex; gap: 8px; }
.mg-check-list { display: flex; flex-direction: column; gap: 10px; max-height: 280px; overflow-y: auto; padding: 8px; background: #0d0d20; border: 1px solid #1f1f3a; border-radius: 8px; }
.mg-check-item { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: #111128; border-radius: 6px; }
.mg-check-item label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; }
.mg-check-config { display: flex; gap: 12px; flex-wrap: wrap; padding-left: 24px; }
.mg-check-config label { font-size: 12px; color: #888; display: flex; align-items: center; gap: 4px; }
.mg-check-config input[type="number"] { width: 60px; }
.mg-loading { text-align: center; padding: 30px; color: #555; }

/* ---------- Werewolf ---------- */
.mg-role-card {
  background: linear-gradient(135deg,#2d1b4e,#1a1a2e);
  border: 1px solid #6c5ce7;
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mg-role-emoji { font-size: 32px; }
.mg-role-name { color: #ffd93d; }
.mg-role-skill { font-size: 12px; color: #888; }
.mg-seats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.mg-seat-card {
  background: #111128;
  border: 1px solid #1f1f3a;
  border-radius: 10px;
  padding: 12px 8px;
  text-align: center;
}
.mg-seat-card.dead { opacity: .45; }
.mg-seat-card.is-user { border-color: #6c5ce7; }
.mg-seat-num { font-size: 12px; color: #6c5ce7; font-weight: 600; }
.mg-seat-name { font-size: 13px; color: #fff; margin: 4px 0; }
.mg-seat-status { font-size: 11px; color: #888; }
.mg-gamelog {
  background: #0d0d20;
  border: 1px solid #1f1f3a;
  border-radius: 8px;
  padding: 12px;
  min-height: 120px;
  max-height: 320px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
}
.mg-gamelog-line { margin: 4px 0; padding: 4px 8px; border-radius: 4px; }
.mg-gamelog-line.dm { color: #ffd93d; }
.mg-gamelog-line.msg { color: #e0e0e0; }
.mg-gamelog-line.vote { color: #e94560; }
.mg-gamelog-line.heart { color: #6c5ce7; font-style: italic; }

/* ---------- Werewolf Phase / Action ---------- */
.mg-phase-label { font-size: 12px; color: #6c5ce7; margin-bottom: 8px; }
.mg-action-panel { background: #111128; border: 1px solid #1f1f3a; border-radius: 8px; padding: 12px; margin: 10px 0; }
.mg-action-panel-title { font-size: 13px; color: #ffd93d; margin-bottom: 8px; }
.mg-target-btns { display: flex; flex-wrap: wrap; gap: 6px; }
.mg-target-btn { background: #1f1f3a; border: 1px solid #2a2a4a; color: #e0e0e0; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px; font-family: inherit; }
.mg-target-btn:hover { background: #6c5ce7; color: #fff; }
.mg-speak-area { width: 100%; background: #0d0d20; border: 1px solid #1f1f3a; border-radius: 8px; color: #e0e0e0; padding: 10px; font-size: 14px; min-height: 80px; box-sizing: border-box; font-family: inherit; resize: vertical; }
.mg-speak-area:focus { outline: none; border-color: #6c5ce7; }
.mg-game-over { text-align: center; padding: 40px 20px; }
.mg-game-over-title { font-size: 32px; font-weight: 700; margin-bottom: 12px; }
.mg-game-over-wolf { color: #e94560; }
.mg-game-over-good { color: #6c5ce7; }
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
      '<h1 class="mg-title">🎮 小游戏</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="presets">⚙ 预设管理</button>' +
      '<button class="mg-btn mg-btn-primary" data-action="add">+ 添加游戏</button>' +
      '<button class="mg-btn mg-btn-ghost" data-action="close" title="关闭">✕</button>' +
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
        '<div class="mg-empty-icon">🎲</div>' +
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
        '<button data-action="edit" title="编辑">✏</button>' +
        '<button data-action="delete" title="删除">🗑</button>' +
        '</div>';

    return (
      '<div class="mg-card" data-id="' + esc(game.id) + '">' +
      badge +
      '<div class="mg-card-emoji">' + esc(game.emoji || '🎮') + '</div>' +
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
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回大厅">← 返回</button>' +
      '<span class="mg-game-bar-title">' + esc(game.emoji || '🎮') + ' ' + esc(game.name) + '</span>' +
      '<button class="mg-btn mg-btn-ghost" data-action="close" title="关闭">✕</button>' +
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
      '<h1 class="mg-title">🐺 狼人杀</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回">← 返回</button>' +
      '<button class="mg-btn mg-btn-ghost" data-action="close" title="关闭">✕</button>' +
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
      '<label class="mg-label"><input type="checkbox" disabled> 旁观模式（即将推出）</label>' +
      '<div class="mg-hint">未来功能：user 不参与，旁观 char 互杀</div>' +
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

      if (checkedIds.length !== count - 1) {
        roche.ui.toast("需要选择 " + (count - 1) + " 个角色（加你共 " + count + " 人）");
        return;
      }

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

      // 构建玩家列表（user + chars）
      var allPlayers = [];
      allPlayers.push({
        id: "user",
        name: userName,
        isUser: true,
        personaText: userPersonaText,
        avatar: userAvatar
      });
      charDetails.forEach(function (cd) {
        allPlayers.push({
          id: cd.id,
          name: cd.handle || cd.name || ('角色' + cd.id),
          isUser: false,
          personaText: cd.persona || cd.bio || "",
          avatar: cd.avatar || ""
        });
      });

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
              allPlayers.forEach(function (p) {
                if (!p.isUser) {
                  if (!convMap[p.id]) convMap[p.id] = [];
                  convMap[p.id].push(convId);
                }
              });
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
        gameLoopRunning: false
      };

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
      var status = p.alive ? '存活' : '已出局 💀';
      seatsHtml +=
        '<div class="' + cls + '">' +
        '<div class="mg-seat-num">' + p.seat + '号</div>' +
        '<div class="mg-seat-name">' + esc(p.name) + '</div>' +
        '<div class="mg-seat-status">' + status + '</div>' +
        '</div>';
    });

    // 从 gamelogLines 渲染（包含 dm/msg/vote/heart/private 全部行）
    var logHtml = '';
    if (Array.isArray(st.gamelogLines)) {
      st.gamelogLines.forEach(function (line) {
        var renderCls = line.cls === 'private' ? 'dm' : (line.cls || 'msg');
        logHtml += '<div class="mg-gamelog-line ' + renderCls + '">' + esc(line.text) + '</div>';
      });
    }

    // 阶段标签
    var phaseName = '';
    if (st.subPhase === 'night') phaseName = '夜晚';
    else if (st.subPhase === 'day_speak') phaseName = '白天发言';
    else if (st.subPhase === 'day_vote') phaseName = '投票';
    var phaseLabel = '当前：第' + st.day + '天' + (phaseName ? ' ' + phaseName : ' 准备中');

    // 按钮：仅在初始（subPhase 为空且循环未运行）时显示
    var buttonHtml = '';
    if (!st.subPhase && !st.gameLoopRunning) {
      buttonHtml = '<button class="mg-btn mg-btn-primary" data-action="night">进入夜晚</button>';
    } else if (st.gameLoopRunning) {
      buttonHtml = '<div class="mg-hint">游戏进行中…</div>';
    }

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">🐺 狼人杀 · 第 ' + st.day + ' 天</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回大厅">← 返回大厅</button>' +
      '<button class="mg-btn mg-btn-ghost" data-action="close" title="关闭">✕</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">' +
      '<div class="mg-form-wrap">' +
      '<div class="mg-role-card">' +
      '<div class="mg-role-emoji">🎴</div>' +
      '<div>你的座位号：<b>' + st.userSeat + '</b></div>' +
      '<div>你的底牌：<b class="mg-role-name">' + esc(st.userRole) + '</b></div>' +
      '<div class="mg-role-skill">' + esc(skillText) + '</div>' +
      '</div>' +
      '<div class="mg-phase-label">' + esc(phaseLabel) + '</div>' +
      '<div class="mg-seats-grid">' + seatsHtml + '</div>' +
      '<div class="mg-gamelog" id="ww-gamelog">' + logHtml + '</div>' +
      '<div id="ww-action-panel"></div>' +
      '<div class="mg-form-actions">' + buttonHtml + '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    container.innerHTML = html;

    // 滚动到底部
    var logEl = container.querySelector('#ww-gamelog');
    if (logEl) logEl.scrollTop = logEl.scrollHeight;

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
  function rerenderPlay(container, roche) {
    renderWerewolfPlay(container, roche);
  }

  // 向 gamelog 追加一行：写入 gamelogLines + DOM；非 heart/private 也写入 publicLog
  function appendGamelog(container, text, cls) {
    var st = werewolfState;
    if (!st.gamelogLines) st.gamelogLines = [];
    st.gamelogLines.push({ text: text, cls: cls || 'msg' });
    if (cls !== 'heart' && cls !== 'private') {
      st.publicLog.push(text);
    }
    var logEl = container.querySelector('#ww-gamelog');
    if (logEl) {
      var div = document.createElement('div');
      div.className = 'mg-gamelog-line ' + (cls === 'private' ? 'dm' : (cls || 'msg'));
      div.textContent = text;
      logEl.appendChild(div);
      logEl.scrollTop = logEl.scrollHeight;
    }
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

  // 渲染游戏结束界面
  function renderGameOver(container, roche) {
    var st = werewolfState;
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
        var renderCls = line.cls === 'private' ? 'dm' : (line.cls || 'msg');
        logHtml += '<div class="mg-gamelog-line ' + renderCls + '">' + esc(line.text) + '</div>';
      });
    }

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">🐺 狼人杀</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回大厅">← 返回大厅</button>' +
      '<button class="mg-btn mg-btn-ghost" data-action="close" title="关闭">✕</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">' +
      '<div class="mg-form-wrap">' +
      '<div class="mg-game-over">' +
      '<div class="mg-game-over-title ' + winnerClass + '">' + esc(winnerText) + '</div>' +
      '<div>游戏结束 · 共 ' + st.day + ' 天</div>' +
      '</div>' +
      '<div class="mg-seats-grid">' + seatsHtml + '</div>' +
      '<div class="mg-gamelog" id="ww-gamelog">' + logHtml + '</div>' +
      '<div class="mg-form-actions">' +
      '<button class="mg-btn mg-btn-primary" data-action="back-hub">返回大厅</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    container.innerHTML = html;

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
      case 8: return '8人：3狼人 + 3平民 + 2神（女巫、预言家）';
      case 9: return '9人：3狼人 + 3平民 + 3神（女巫、预言家、猎人）';
      default: return '';
    }
  }

  // 角色池（按人数）
  function getRolePool(count) {
    switch (count) {
      case 6: return ["狼人", "狼人", "平民", "平民", "女巫", "预言家"];
      case 7: return ["狼人", "狼人", "平民", "平民", "平民", "女巫", "预言家"];
      case 8: return ["狼人", "狼人", "狼人", "平民", "平民", "平民", "女巫", "预言家"];
      case 9: return ["狼人", "狼人", "狼人", "平民", "平民", "平民", "女巫", "预言家", "猎人"];
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
      case '猎人': return '出局时可开枪带走一人';
      default: return '';
    }
  }

  // Fisher-Yates 洗牌（基于 Math.random）
  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
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

  // 构建 polling 模式下的单 char 提示词（视野隔离）
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
      '你是狼人杀游戏的DM（主持人）+角色演绎引擎。你需要扮演一个角色在游戏中做决策。\n\n' +
      '【你的角色信息】\n' +
      '名字：' + player.name + '\n' +
      '座位号：' + player.seat + '\n' +
      '身份：' + player.role + '\n' +
      '技能：' + getRoleSkillText(player.role) + '\n' +
      fellowWolves +
      '\n【你的人设】\n' + (player.personaText || '(无)') + '\n' +
      '\n【你的记忆】\n' + (memoryText || '(无)') + '\n' +
      '\n【公开事件记录（仅含公开信息，不含他人私密行动）】\n' + publicLogText + '\n' +
      '\n【你的个人行动历史（只有你自己做过的事）】\n' + ownHistory + '\n' +
      '\n【视野隔离铁律】\n' +
      '- 你绝对不能假设自己知道未给出的信息（他人身份、夜间行动、他人心声）。\n' +
      '- 只能基于公开记录和你自己的行动历史做决策。\n' +
      '- 严禁开天眼，严禁读取上帝视角。\n' +
      '\n【当前决策请求】\n' + context + '\n' +
      '\n请以严格JSON格式回复，不要包含任何其他文字：\n' +
      '{ "thought":"<内心独白，符合角色人格>", "action":"<行动描述>", "target":"<目标座位号或null>", "speech":"<白天发言或空>" }';

    var userContent = '请做出你的决策并按JSON格式回复。';

    return {
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7
    };
  }

  // 构建 batch 模式下的批量提示词（一次演算多个 char）
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
      charsInfo +=
        '座位' + p.seat + '号 / ' + p.name + ' / 身份:' + p.role + '\n' +
        '人设:' + (p.personaText || '(无)') + '\n' +
        '记忆:' + (memoryText || '(无)') + '\n' +
        '个人历史:' + ownHistory + '\n---\n';
    }

    var publicLogText = (st.publicLog && st.publicLog.length > 0)
      ? st.publicLog.join('\n')
      : '(无)';

    var systemContent =
      '你是狼人杀游戏的批量演算引擎。你需要为多个角色同时做出决策。\n\n' +
      '【角色列表】\n' + charsInfo + '\n' +
      '【公开事件记录】\n' + publicLogText + '\n' +
      '\n【视野隔离铁律】\n' +
      '- 每个角色只能基于公开信息和自己个人历史做决策。\n' +
      '- 严禁开天眼，严禁读取上帝视角。\n' +
      '\n【决策请求】\n' + context + '\n' +
      '\n请为每个相关角色做出决策，以严格JSON数组格式回复：\n' +
      '[{ "seat":<座位号>, "thought":"<内心独白>", "action":"<行动描述>", "target":"<目标座位号或null>" }]';

    var userContent = '请为所有角色做出决策并按JSON数组格式回复。';

    return {
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7
    };
  }

  // 等待用户输入（基于 promptType 渲染不同的交互面板）
  function waitForUserInput(container, roche, promptType, options) {
    return new Promise(function (resolve) {
      var panel = container.querySelector('#ww-action-panel');
      if (!panel) { resolve(null); return; }

      var html = '';
      if (promptType === 'wolf_target') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">🐺 狼人行动：选择今晚要击杀的玩家</div>' +
          '<div class="mg-target-btns">' +
          options.targets.map(function (seat) {
            return '<button class="mg-target-btn" data-seat="' + seat + '">' + seat + '号</button>';
          }).join('') +
          '</div></div>';
      } else if (promptType === 'witch_save') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">🧪 女巫行动</div>' +
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
          '<div class="mg-action-panel-title">🧪 选择要毒的玩家（或不毒）</div>' +
          '<div class="mg-target-btns">' +
          options.targets.map(function (seat) {
            return '<button class="mg-target-btn" data-seat="' + seat + '">' + seat + '号</button>';
          }).join('') +
          '<button class="mg-target-btn" data-action="nopoison">不毒</button>' +
          '</div></div>';
      } else if (promptType === 'seer_check') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">🔮 预言家行动：选择要查验的玩家</div>' +
          '<div class="mg-target-btns">' +
          options.targets.map(function (seat) {
            return '<button class="mg-target-btn" data-seat="' + seat + '">' + seat + '号</button>';
          }).join('') +
          '</div></div>';
      } else if (promptType === 'day_speak') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">🎤 ' + options.seat + '号发言</div>' +
          '<textarea class="mg-speak-area" id="ww-speak-input" placeholder="请输入你的发言..."></textarea>' +
          '<div class="mg-form-actions"><button class="mg-btn mg-btn-primary" data-action="submit-speak">发言</button></div>' +
          '</div>';
      } else if (promptType === 'day_vote') {
        html = '<div class="mg-action-panel">' +
          '<div class="mg-action-panel-title">🗳 投票：选择要投出局的玩家</div>' +
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
            resolve({ speech: speech });
          };
        }
      } else {
        var seatBtns = panel.querySelectorAll('.mg-target-btn[data-seat]');
        seatBtns.forEach(function (btn) {
          btn.onclick = function () {
            var seat = parseInt(btn.dataset.seat, 10);
            panel.innerHTML = '';
            resolve({ seat: seat });
          };
        });
        var actionBtns = panel.querySelectorAll('.mg-target-btn[data-action]');
        actionBtns.forEach(function (btn) {
          btn.onclick = function () {
            var action = btn.dataset.action;
            panel.innerHTML = '';
            resolve({ action: action });
          };
        });
      }
    });
  }

  // 主游戏循环
  async function startGameLoop(container, roche) {
    try {
      while (!werewolfState.gameOver) {
        await runNight(container, roche);
        if (werewolfState.gameOver) break;
        await runDaySpeak(container, roche);
        if (werewolfState.gameOver) break;
        await runDayVote(container, roche);
        if (werewolfState.gameOver) break;
      }
    } finally {
      werewolfState.gameLoopRunning = false;
    }
    if (werewolfState.gameOver) {
      renderGameOver(container, roche);
    }
  }

  // 夜晚流程
  async function runNight(container, roche) {
    var st = werewolfState;
    st.day++;
    st.subPhase = 'night';
    st.pendingDeaths = [];
    st.nightActions = {
      wolvesTarget: null,
      witchSave: false,
      witchPoisonTarget: null,
      seerCheckTarget: null,
      seerResult: null
    };

    appendGamelog(container, '天黑请闭眼。', 'dm');
    rerenderPlay(container, roche);
    await sleep(400);

    var userPlayer = st.players.find(function (p) { return p.isUser; });
    var aliveWolves = st.players.filter(function (p) { return p.alive && p.role === '狼人'; });
    var aliveNonWolves = st.players.filter(function (p) { return p.alive && p.role !== '狼人'; });

    // === 狼人阶段 ===
    if (aliveWolves.length > 0 && aliveNonWolves.length > 0) {
      if (userPlayer && userPlayer.role === '狼人' && userPlayer.alive) {
        // user 是狼人：显示 UI
        var wolfTargets = aliveNonWolves.map(function (p) { return p.seat; });
        var wolfResult = await waitForUserInput(container, roche, 'wolf_target', { targets: wolfTargets });
        if (wolfResult && wolfResult.seat) {
          st.nightActions.wolvesTarget = wolfResult.seat;
          appendCharHistory(userPlayer.id, st.day, 'night', 'action', '你选择击杀' + wolfResult.seat + '号');
        }
      } else {
        // 静默结算
        var wolfVotes = {};
        if (st.mode === 'batch') {
          try {
            var bp = await buildBatchPrompt(roche, '狼人请选择今晚要击杀的目标。所有存活狼人共同决定一个目标。仅狼人角色需要行动。');
            var br = await roche.ai.chat({ messages: bp.messages, temperature: 0.7 });
            var decisions = parseJsonResponse(br.text);
            if (Array.isArray(decisions)) {
              decisions.forEach(function (d) {
                if (d.target != null) {
                  var t = parseInt(d.target, 10);
                  if (!isNaN(t)) wolfVotes[t] = (wolfVotes[t] || 0) + 1;
                }
                var wolf = st.players.find(function (p) { return p.seat === d.seat && p.role === '狼人'; });
                if (wolf) {
                  appendCharHistory(wolf.id, st.day, 'night', 'heart', d.thought || '');
                  appendCharHistory(wolf.id, st.day, 'night', 'action', '选择击杀' + (d.target || '?') + '号');
                }
              });
            }
          } catch (e) { /* 忽略 */ }
        } else {
          // polling：每只狼单独决策
          for (var wi = 0; wi < aliveWolves.length; wi++) {
            var wolf = aliveWolves[wi];
            try {
              var cp = await buildCharPrompt(roche, wolf, '你是狼人。请选择今晚要击杀的目标（回复座位号）。你和同伴共同决定。');
              var cr = await roche.ai.chat({ messages: cp.messages, temperature: 0.7 });
              var cd = parseJsonResponse(cr.text);
              if (cd) {
                appendCharHistory(wolf.id, st.day, 'night', 'heart', cd.thought || '');
                appendCharHistory(wolf.id, st.day, 'night', 'action', '选择击杀' + (cd.target || '?') + '号');
                if (cd.target != null) {
                  var tt = parseInt(cd.target, 10);
                  if (!isNaN(tt)) wolfVotes[tt] = (wolfVotes[tt] || 0) + 1;
                }
              }
            } catch (e) { /* 忽略 */ }
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

      if (userPlayer && userPlayer.role === '女巫' && userPlayer.alive) {
        // user 是女巫
        if (victim != null || canPoison) {
          var saveResult = await waitForUserInput(container, roche, 'witch_save', {
            victim: victim,
            canSave: canSave
          });
          if (saveResult && saveResult.action === 'save' && canSave && victim != null) {
            st.nightActions.witchSave = true;
            st.witchSaveUsed = true;
            appendCharHistory(userPlayer.id, st.day, 'night', 'action', '使用解药救了' + victim + '号');
          }
          if (canPoison) {
            var poisonTargets = st.players.filter(function (p) {
              return p.alive && !p.isUser;
            }).map(function (p) { return p.seat; });
            var poisonResult = await waitForUserInput(container, roche, 'witch_poison', { targets: poisonTargets });
            if (poisonResult && poisonResult.seat) {
              st.nightActions.witchPoisonTarget = poisonResult.seat;
              st.witchPoisonUsed = true;
              appendCharHistory(userPlayer.id, st.day, 'night', 'action', '使用毒药毒了' + poisonResult.seat + '号');
            }
          }
        }
      } else {
        // 静默结算
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
            var wbr = await roche.ai.chat({ messages: wbp.messages, temperature: 0.7 });
            var wdArr = parseJsonResponse(wbr.text);
            if (Array.isArray(wdArr) && wdArr.length > 0) {
              var wd = wdArr.find(function (d) { return d.seat === witch.seat; });
              if (!wd) wd = wdArr[0];
              if (wd) {
                if (wd.action && wd.action.indexOf('解药') !== -1 && canSave && victim != null) {
                  st.nightActions.witchSave = true;
                  st.witchSaveUsed = true;
                }
                if (wd.target != null && canPoison && wd.action && wd.action.indexOf('毒') !== -1) {
                  var pt = parseInt(wd.target, 10);
                  var ptValid = st.players.find(function (p) { return p.seat === pt && p.alive && p.id !== witch.id; });
                  if (ptValid) {
                    st.nightActions.witchPoisonTarget = pt;
                    st.witchPoisonUsed = true;
                  }
                }
                appendCharHistory(witch.id, st.day, 'night', 'heart', wd.thought || '');
                appendCharHistory(witch.id, st.day, 'night', 'action', wd.action || '');
              }
            }
          } catch (e) { /* 忽略 */ }
        } else {
          try {
            var wcp = await buildCharPrompt(roche, witch, witchContext);
            var wcr = await roche.ai.chat({ messages: wcp.messages, temperature: 0.7 });
            var wcd = parseJsonResponse(wcr.text);
            if (wcd) {
              if (wcd.action && wcd.action.indexOf('解药') !== -1 && canSave && victim != null) {
                st.nightActions.witchSave = true;
                st.witchSaveUsed = true;
              }
              if (wcd.target != null && canPoison && wcd.action && wcd.action.indexOf('毒') !== -1) {
                var pt2 = parseInt(wcd.target, 10);
                var pt2Valid = st.players.find(function (p) { return p.seat === pt2 && p.alive && p.id !== witch.id; });
                if (pt2Valid) {
                  st.nightActions.witchPoisonTarget = pt2;
                  st.witchPoisonUsed = true;
                }
              }
              appendCharHistory(witch.id, st.day, 'night', 'heart', wcd.thought || '');
              appendCharHistory(witch.id, st.day, 'night', 'action', wcd.action || '');
            }
          } catch (e) { /* 忽略 */ }
        }
      }
    }

    // === 预言家阶段 ===
    var seer = st.players.find(function (p) { return p.alive && p.role === '预言家'; });
    if (seer) {
      if (userPlayer && userPlayer.role === '预言家' && userPlayer.alive) {
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
        var seerTargets2 = st.players.filter(function (p) {
          return p.alive && p.id !== seer.id;
        }).map(function (p) { return p.seat; });
        var seerContext = '你是预言家。请选择今晚要查验的玩家（回复座位号）。可选目标：' + seerTargets2.join(', ');

        var seerTargetSeat = null;
        if (st.mode === 'batch') {
          try {
            var sbp = await buildBatchPrompt(roche, seerContext + ' 仅预言家角色需要行动。');
            var sbr = await roche.ai.chat({ messages: sbp.messages, temperature: 0.7 });
            var sdArr = parseJsonResponse(sbr.text);
            if (Array.isArray(sdArr) && sdArr.length > 0) {
              var sd = sdArr.find(function (d) { return d.seat === seer.seat; });
              if (!sd) sd = sdArr[0];
              if (sd && sd.target != null) {
                seerTargetSeat = parseInt(sd.target, 10);
                appendCharHistory(seer.id, st.day, 'night', 'heart', sd.thought || '');
              }
            }
          } catch (e) { /* 忽略 */ }
        } else {
          try {
            var scp = await buildCharPrompt(roche, seer, seerContext);
            var scr = await roche.ai.chat({ messages: scp.messages, temperature: 0.7 });
            var scd = parseJsonResponse(scr.text);
            if (scd && scd.target != null) {
              seerTargetSeat = parseInt(scd.target, 10);
              appendCharHistory(seer.id, st.day, 'night', 'heart', scd.thought || '');
            }
          } catch (e) { /* 忽略 */ }
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

    // === 结算死亡 ===
    // 狼刀（除非女巫救）
    if (st.nightActions.wolvesTarget != null && !st.nightActions.witchSave) {
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

    rerenderPlay(container, roche);

    // 检查游戏结束
    if (checkGameOver(roche)) {
      appendGamelog(container, '游戏结束！' + st.winner + '阵营胜利！', 'dm');
      return;
    }
  }

  // 白天发言流程
  async function runDaySpeak(container, roche) {
    var st = werewolfState;
    st.subPhase = 'day_speak';
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

    for (var seat = 1; seat <= st.count; seat++) {
      var player = st.players.find(function (p) { return p.seat === seat; });
      if (!player) continue;
      if (!player.alive) {
        appendGamelog(container, '💀 ' + seat + '号已出局', 'msg');
        continue;
      }

      st.speakIndex = seat;

      if (player.isUser) {
        // user 发言
        var speakResult = await waitForUserInput(container, roche, 'day_speak', { seat: seat });
        var speech = (speakResult && speakResult.speech) || '(无发言)';
        appendGamelog(container, seat + '号(' + player.name + ')：' + speech, 'msg');
        appendCharHistory(player.id, st.day, 'day_speak', 'speech', speech);
        rerenderPlay(container, roche);
      } else {
        // AI char 发言（batch 和 polling 都逐个调用，保证视野隔离）
        var speakContext = '现在是白天发言环节。请基于你的身份、人设、记忆和场上公开信息进行发言。发言要符合你的角色人格，不要使用游戏套话。请在speech字段给出你的发言内容。';
        try {
          var sp = await buildCharPrompt(roche, player, speakContext);
          var sr = await roche.ai.chat({ messages: sp.messages, temperature: 0.7 });
          var sd = parseJsonResponse(sr.text);
          if (sd) {
            if (sd.thought) {
              appendGamelog(container, '[心声] ' + seat + '号：' + sd.thought, 'heart');
            }
            var speech2 = sd.speech || '(无发言)';
            appendGamelog(container, seat + '号(' + player.name + ')：' + speech2, 'msg');
            appendCharHistory(player.id, st.day, 'day_speak', 'heart', sd.thought || '');
            appendCharHistory(player.id, st.day, 'day_speak', 'speech', speech2);
          } else {
            appendGamelog(container, seat + '号(' + player.name + ')：(发言异常)', 'msg');
          }
        } catch (e) {
          appendGamelog(container, seat + '号(' + player.name + ')：(发言异常)', 'msg');
        }
        rerenderPlay(container, roche);
        await sleep(300);
      }
    }
  }

  // 投票流程
  async function runDayVote(container, roche) {
    var st = werewolfState;
    st.subPhase = 'day_vote';

    appendGamelog(container, '投票阶段开始。', 'dm');
    rerenderPlay(container, roche);
    await sleep(300);

    var votes = {}; // seat -> count
    var alivePlayers = st.players.filter(function (p) { return p.alive; });

    // AI char 投票
    for (var i = 0; i < alivePlayers.length; i++) {
      var player = alivePlayers[i];
      if (player.isUser) continue;

      var voteTargets = st.players.filter(function (p) {
        return p.alive && p.seat !== player.seat;
      }).map(function (p) { return p.seat; });

      var voteContext = '现在是投票阶段。请选择你要投出局的玩家（在target字段回复座位号）。可选目标：' + voteTargets.join(', ');
      try {
        var vp = await buildCharPrompt(roche, player, voteContext);
        var vr = await roche.ai.chat({ messages: vp.messages, temperature: 0.7 });
        var vd = parseJsonResponse(vr.text);
        if (vd && vd.target != null) {
          var target = parseInt(vd.target, 10);
          var validTarget = st.players.find(function (p) { return p.seat === target && p.alive && p.seat !== player.seat; });
          if (validTarget) {
            votes[target] = (votes[target] || 0) + 1;
            appendGamelog(container, player.seat + '号 → ' + target + '号', 'vote');
            appendCharHistory(player.id, st.day, 'day_vote', 'vote', '投了' + target + '号' + (vd.thought ? '（' + vd.thought + '）' : ''));
          }
        }
      } catch (e) { /* 忽略 */ }
      rerenderPlay(container, roche);
    }

    // user 投票
    var userPlayer = st.players.find(function (p) { return p.isUser; });
    if (userPlayer && userPlayer.alive) {
      var userVoteTargets = st.players.filter(function (p) {
        return p.alive && p.seat !== userPlayer.seat;
      }).map(function (p) { return p.seat; });
      var voteResult = await waitForUserInput(container, roche, 'day_vote', { targets: userVoteTargets });
      if (voteResult && voteResult.seat) {
        votes[voteResult.seat] = (votes[voteResult.seat] || 0) + 1;
        appendGamelog(container, userPlayer.seat + '号 → ' + voteResult.seat + '号', 'vote');
        appendCharHistory(userPlayer.id, st.day, 'day_vote', 'vote', '投了' + voteResult.seat + '号');
      } else {
        appendGamelog(container, userPlayer.seat + '号弃票', 'vote');
      }
      rerenderPlay(container, roche);
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
  }

  /* ============================================================
   * 视图：添加 / 编辑游戏表单
   * ============================================================ */
  function showForm(container, roche, existing) {
    var isEdit = !!existing;

    var html =
      '<div class="mini-games-root">' +
      '<div class="mg-header">' +
      '<h1 class="mg-title">' + (isEdit ? '✏ 编辑游戏' : '➕ 添加游戏') + '</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回">← 返回</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">' +
      '<div class="mg-form-wrap">' +
      '<div class="mg-field-row">' +
      '<div class="mg-field" style="max-width:80px;">' +
      '<label class="mg-label">图标</label>' +
      '<input class="mg-input" id="mg-emoji" value="' + esc(existing ? existing.emoji : '🎮') + '" maxlength="4" placeholder="🎮">' +
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
      var emoji = container.querySelector('#mg-emoji').value.trim() || '🎮';
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
      '<h1 class="mg-title">⚙ 预设管理</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回">← 返回</button>' +
      '<button class="mg-btn mg-btn-primary" data-action="new">+ 新建预设</button>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">';

    if (presets.length === 0) {
      html +=
        '<div class="mg-empty">' +
        '<div class="mg-empty-icon">⚙</div>' +
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
      '<h1 class="mg-title">' + (isEdit ? '✏ 编辑预设' : '➕ 新建预设') + '</h1>' +
      '<div class="mg-actions">' +
      '<button class="mg-btn mg-btn-ghost" data-action="back" title="返回">← 返回</button>' +
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
