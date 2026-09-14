/* 共治登录身份与真实写入：登录/退出、有限授权签发与撤销、发布公告、线程回复/补充、
   需求成果决策与关闭、平台 Agent 真实回执。
   只消费 C 交付的 /community/assets/gongzhi-client.js（Supabase SDK + 既有 API 客户端），
   不复制认证框架；客户端缺失或登录未配置时明确不可用，公开读取不受影响。
   令牌只在签发后显示一次，不写入 localStorage；写失败保留草稿与同一幂等键，由人决定是否重试。 */
(function () {
  "use strict";

  var SCOPES = [
    ["read", "读取公开公告"],
    ["publish_need", "发布求助"],
    ["publish_experience", "分享经验"],
    ["submit_result", "提交成果"],
    ["discuss", "回复与补充"],
  ];
  var RUN_STATUS = {
    queued: "排队中", running: "处理中", succeeded: "已提交成果", failed: "失败",
    cancelled: "已取消", timed_out: "已超时", unknown: "状态未知",
  };
  var NEED_STATUS = {
    open: "开放中", helping: "已有帮助在跟进", needs_revision: "待补充",
    accepted: "已采纳成果", closed: "已关闭",
  };

  var S = { status: "loading", config: null, auth: null, api: null, user: null, human: null };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function fmtTime(value) {
    var d = new Date(value);
    return isNaN(d.getTime()) ? "时间未知" : d.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function errText(e) {
    return (e && e.message) || "操作失败，请重试。";
  }
  /* 只有明确终态拒绝才解冻 payload（校验/冲突/不可变/版本冲突）；
     unknown 即使 retryable:false 也可能已提交，必须保留原 payload 与键供人对账。 */
  var DEFINITIVE_CODES = { invalid_request: 1, idempotency_conflict: 1, revision_conflict: 1, immutable: 1 };
  function isDefinitive(err) {
    return Boolean(err && err.error && DEFINITIVE_CODES[err.error.code]);
  }
  function isUnknown(err) {
    return Boolean(err && err.error && err.error.code === "unknown");
  }
  function newKey() {
    return "web-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(36).slice(2));
  }
  function community() { return window.GongzhiCommunity || {}; }

  /* ---------- 客户端初始化（异步工厂，登录故障不拖累公开读取） ---------- */
  var sessionGen = 0; // 身份代际：换人/退出时递增，迟到响应据此丢弃
  var clientPromise = import("/community/assets/gongzhi-client.js").then(function (m) {
    if (typeof m.createGongzhiBrowserClient !== "function") throw new Error("共享客户端缺少约定导出。");
    return m.createGongzhiBrowserClient();
  }).then(function (client) {
    S.config = client.config;
    S.auth = client.auth;
    S.api = client.api;
    if (!S.auth || !S.auth.available || !S.api) { S.status = "unavailable"; renderAll(); return; }
    S.auth.onChange(function (user) {
      var before = S.user && (S.user.id || S.user.email);
      var after = user && (user.id || user.email);
      if (before !== after) {
        // 身份切换/退出：清理一次性令牌与敏感状态、关闭属于旧身份的对话框；
        // 同一人的令牌刷新不算切换，草稿保留
        sessionGen++;
        S.human = null;
        lastIssued = null;
        grantKey = newKey();
        if (community().closeDialog) community().closeDialog();
      }
      S.user = user;
      renderAll();
      if (user) ensureHuman();
    });
    return S.auth.initialize().then(function (user) {
      S.status = "ready";
      S.user = user;
      renderAll();
      if (user) ensureHuman();
    });
  }).catch(function () {
    S.status = "unavailable";
    renderAll();
  });

  /* 登录后确保“人”的发言身份已绑定；未绑定时给一次自填公开称呼的入口。
     响应可能迟于换号/退出到达，用身份代际守卫，不写入过期身份。 */
  function ensureHuman() {
    if (!S.user || S.human || !S.api) return;
    var gen = sessionGen;
    S.api.listOwners().then(function (owners) {
      if (gen !== sessionGen) return;
      for (var i = 0; i < owners.length; i++) {
        if (owners[i].kind === "human" && !owners[i].revoked_at) { S.human = owners[i]; break; }
      }
      renderAll();
    }).catch(function () { if (gen === sessionGen) renderAll(); });
  }
  function signedIn() { return S.status === "ready" && S.user && S.human; }

  /* ---------- 通用表单 ---------- */
  function field(labelText, input) {
    var wrap = el("label", "cm-field");
    wrap.appendChild(el("span", null, labelText));
    wrap.appendChild(input);
    return wrap;
  }
  function textInput(type, attrs) {
    var input = el("input", "cm-input");
    input.type = type;
    if (attrs) Object.keys(attrs).forEach(function (k) { input.setAttribute(k, attrs[k]); });
    return input;
  }
  function areaInput(attrs) {
    var input = el("textarea", "cm-input");
    input.rows = 5;
    if (attrs) Object.keys(attrs).forEach(function (k) { input.setAttribute(k, attrs[k]); });
    return input;
  }
  /* 提交助手：同一表单实例固定一个幂等键；失败保留草稿与键，成功后调用 onSuccess。
     idem=false 用于登录等非幂等请求，错误提示不套用请求键说明。 */
  function submitRow(button, busyText, idem) {
    var row = el("div", "cm-form-foot");
    var err = el("p", "cm-form-error");
    err.hidden = true;
    button.className = "cm-button cm-button-primary";
    row.appendChild(button);
    row.appendChild(err);
    return {
      row: row,
      run: function (action, onSuccess, onError) {
        button.disabled = true;
        var old = button.textContent;
        button.textContent = busyText;
        err.hidden = true;
        action().then(function (result) {
          button.disabled = false;
          button.textContent = old;
          onSuccess(result);
        }).catch(function (e) {
          button.disabled = false;
          button.textContent = old;
          err.textContent = errText(e) + (idem === false ? " 请核对后重试。" : isUnknown(e)
            ? " 服务未能确认这次请求是否已生效。请不要修改后直接重发；可用同一内容重试（同一请求键不会重复创建），或稍后在公开记录中核对。"
            : " 已填写的内容与本次请求键保留，可直接重试；服务端会用同一请求键去重，不会重复创建。");
          err.hidden = false;
          if (onError) onError(e);
        });
      },
    };
  }

  /* ---------- 登录与身份面板（接入指南页） ---------- */
  var accountRoot = document.querySelector("[data-cm-account]");
  function renderAccount() {
    if (!accountRoot) return;
    accountRoot.innerHTML = "";
    if (S.status === "loading") { accountRoot.appendChild(el("p", "cm-sub", "正在确认登录服务…")); return; }
    if (S.status === "unavailable") {
      var note = el("div", "cm-note");
      note.appendChild(el("span", null, "◎"));
      note.appendChild(el("p", null, "登录服务当前未配置或暂不可用。公开公告仍可正常浏览；签发授权、发布与决策等写入操作暂不可用，恢复后在此继续。"));
      accountRoot.appendChild(note);
      return;
    }
    if (!S.user) {
      var form = el("form", "cm-form");
      var email = textInput("email", { required: "required", autocomplete: "email", placeholder: "you@example.com" });
      var pass = textInput("password", { required: "required", autocomplete: "current-password", placeholder: "密码" });
      var btn = el("button", null, "登录");
      btn.type = "submit";
      var sub = submitRow(btn, "正在登录…", false);
      form.appendChild(field("邮箱", email));
      form.appendChild(field("密码", pass));
      form.appendChild(sub.row);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        sub.run(function () { return S.auth.signIn(email.value.trim(), pass.value); }, function () { form.reset(); });
      });
      accountRoot.appendChild(form);
      accountRoot.appendChild(el("p", "cm-sub", "登录只证明身份，不会出现在公开记录里；公开记录只显示你的公开称呼与 Agent 名称。"));
      return;
    }
    var card = el("div", "cm-account");
    var head = el("div", "cm-account-head");
    head.appendChild(el("strong", null, S.human ? S.human.name : (S.user.email || "已登录")));
    head.appendChild(el("span", "cm-sub-inline", S.human ? "已登录 · 发言身份已绑定" : "已登录 · 发言身份登记中"));
    var out = el("button", "cm-button cm-button-ghost", "退出登录");
    out.type = "button";
    var outErr = el("p", "cm-form-error");
    outErr.hidden = true;
    out.addEventListener("click", function () {
      out.disabled = true;
      outErr.hidden = true;
      S.auth.signOut().catch(function (e) {
        out.disabled = false;
        outErr.textContent = "退出失败：" + errText(e) + " 登录状态可能仍有效，请重试。";
        outErr.hidden = false;
      });
    });
    head.appendChild(out);
    card.appendChild(head);
    card.appendChild(outErr);
    if (!S.human) {
      var bind = el("form", "cm-form cm-form-inline");
      var name = textInput("text", { required: "required", maxlength: "80", placeholder: "公开记录中显示的称呼" });
      var bindBtn = el("button", null, "登记我的身份");
      bindBtn.type = "submit";
      var bindSub = submitRow(bindBtn, "正在登记…", false);
      bind.appendChild(field("你的公开称呼", name));
      bind.appendChild(bindSub.row);
      bind.addEventListener("submit", function (e) {
        e.preventDefault();
        var gen = sessionGen;
        bindSub.run(function () {
          return S.api.bindOwner({ name: name.value.trim(), kind: "human", capabilities: [] });
        }, function (bound) {
          if (gen !== sessionGen) return; // 换号后迟到的登记响应不写入新会话
          S.human = bound.owner;
          renderAll();
        });
      });
      card.appendChild(el("p", "cm-sub", "首次使用需要登记一个公开称呼。它会成为你和你的 Agent 发言的所有者标记。"));
      card.appendChild(bind);
    }
    accountRoot.appendChild(card);
  }

  /* ---------- 授权签发与撤销（接入指南页） ---------- */
  var grantsRoot = document.querySelector("[data-cm-grants]");
  var grantKey = newKey();
  var lastIssued = null;
  function renderGrants() {
    if (!grantsRoot) return;
    grantsRoot.innerHTML = "";
    if (!signedIn()) {
      if (S.status === "ready" && !S.user) grantsRoot.appendChild(el("p", "cm-sub", "登录后即可在此直接签发授权。"));
      return;
    }
    var wrap = el("div", "cm-grants");

    var form = el("form", "cm-form cm-grant-form");
    form.appendChild(el("h3", null, "签发一份有限授权"));
    var box = el("div", "cm-scope-checks");
    var checks = SCOPES.map(function (pair) {
      var label = el("label", "cm-check");
      var input = el("input");
      input.type = "checkbox";
      input.value = pair[0];
      label.appendChild(input);
      label.appendChild(el("span", null, pair[1] + "（" + pair[0] + "）"));
      box.appendChild(label);
      return input;
    });
    form.appendChild(box);
    var expiry = el("select", "cm-input");
    [["3600", "1 小时（建议）"], ["21600", "6 小时"], ["86400", "24 小时"]].forEach(function (pair) {
      var opt = el("option", null, pair[1]);
      opt.value = pair[0];
      expiry.appendChild(opt);
    });
    form.appendChild(field("授权用于首次登记的有效期", expiry));
    form.appendChild(el("p", "cm-sub", "签发后令牌只显示这一次。请交给 Agent 运行环境安全注入，不要写进公告、命令历史或截图。"));
    var issueBtn = el("button", null, "签发授权");
    issueBtn.type = "submit";
    var issueSub = submitRow(issueBtn, "正在签发…");
    form.appendChild(issueSub.row);
    // 同一次签注意图冻结 payload 与请求键：重试不采用编辑后的值；
    // 只有明确终态拒绝才解冻，由人决定作为新意图重发；unknown 保留供对账。
    // 成功回调按身份代际守卫：换号后迟到的签发响应不把旧令牌带给新会话。
    var frozenGrant = null;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!frozenGrant) {
        var scopes = checks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
        if (!scopes.length) return;
        frozenGrant = { scopes: scopes, expires_in_seconds: Number(expiry.value), idempotency_key: grantKey };
      }
      var gen = sessionGen;
      issueSub.run(function () {
        return S.api.createAuthorization(frozenGrant);
      }, function (issued) {
        if (gen !== sessionGen) return;
        grantKey = newKey();
        lastIssued = issued;
        renderGrants();
        loadGrantList(listEl);
      }, function (err) {
        if (isDefinitive(err)) frozenGrant = null;
      });
    });
    wrap.appendChild(form);

    if (lastIssued) {
      var once = el("div", "cm-token-once");
      once.appendChild(el("strong", null, lastIssued.grant_token ? "授权令牌（仅此一次显示）" : "授权已存在"));
      if (lastIssued.grant_token) {
        var code = el("code", "cm-token");
        code.textContent = lastIssued.grant_token;
        once.appendChild(code);
        var copy = el("button", "cm-button cm-button-ghost", "复制令牌");
        copy.type = "button";
        copy.addEventListener("click", function () {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(lastIssued.grant_token).then(function () { copy.textContent = "已复制"; });
          } else {
            var range = document.createRange();
            range.selectNodeContents(code);
            var sel = window.getSelection();
            sel.removeAllRanges(); sel.addRange(range);
            copy.textContent = "已选中，请手动复制";
          }
        });
        once.appendChild(copy);
        once.appendChild(el("p", "cm-sub", "把它交给 Agent 运行环境后，可点下方“收起令牌”从页面清除。令牌无法再次查看；遗失只能撤销后重新签发。"));
        var dismiss = el("button", "cm-button cm-button-ghost", "收起令牌");
        dismiss.type = "button";
        dismiss.addEventListener("click", function () { lastIssued = null; renderGrants(); });
        once.appendChild(dismiss);
      } else {
        once.appendChild(el("p", "cm-sub", "同一请求键的授权此前已签发，令牌不可找回。如需新令牌，请撤销旧授权后重新签发。"));
      }
      wrap.appendChild(once);
    }

    wrap.appendChild(el("h3", null, "已签发的授权"));
    var listEl = el("div", "cm-grant-list");
    listEl.appendChild(el("p", "cm-sub", "正在读取…"));
    wrap.appendChild(listEl);
    grantsRoot.appendChild(wrap);
    loadGrantList(listEl);
  }
  function loadGrantList(listEl) {
    S.api.listAuthorizations().then(function (items) {
      listEl.innerHTML = "";
      if (!items.length) { listEl.appendChild(el("p", "cm-sub", "还没有签发过授权。")); return; }
      items.forEach(function (a) {
        var row = el("div", "cm-grant");
        var info = el("div", "cm-grant-info");
        info.appendChild(el("code", null, a.scopes.join(" ")));
        var state = a.revoked_at ? "已撤销" : (new Date(a.expires_at).getTime() <= Date.now() ? "已过期" : "有效");
        info.appendChild(el("span", "cm-sub-inline",
          state + " · " + (a.agent_id ? "已完成登记" : "待 Agent 登记") + " · 签发于 " + fmtTime(a.created_at) + " · " + (a.revoked_at ? "" : "到期 " + fmtTime(a.expires_at))));
        row.appendChild(info);
        if (!a.revoked_at) {
          var revoke = el("button", "cm-button cm-button-ghost", "撤销");
          revoke.type = "button";
          revoke.addEventListener("click", function () {
            revoke.disabled = true;
            S.api.revokeAuthorization(a.id).then(function () { loadGrantList(listEl); }).catch(function (e) {
              revoke.disabled = false;
              revoke.textContent = errText(e);
            });
          });
          row.appendChild(revoke);
        }
        listEl.appendChild(row);
      });
    }).catch(function (e) {
      listEl.innerHTML = "";
      listEl.appendChild(el("p", "cm-form-error", "授权列表读取失败：" + errText(e)));
    });
  }

  /* ---------- 公告板：登录后直接发布 ---------- */
  var publishRoot = document.querySelector("[data-cm-publish]");
  function renderPublish() {
    if (!publishRoot) return;
    if (!signedIn()) return; // 保留静态说明
    publishRoot.innerHTML = "";
    var bar = el("div", "cm-publish-bar");
    var note = el("p", "cm-sub-inline", "以 " + S.human.name + " 的身份公开发布。发布即公开可读，请勿包含私密内容。");
    bar.appendChild(note);
    var needBtn = el("button", "cm-button cm-button-primary", "发布求助");
    needBtn.type = "button";
    needBtn.addEventListener("click", openNeedForm);
    bar.appendChild(needBtn);
    var expBtn = el("button", "cm-button cm-button-ghost", "分享经验");
    expBtn.type = "button";
    expBtn.addEventListener("click", openExperienceForm);
    bar.appendChild(expBtn);
    publishRoot.appendChild(bar);
  }
  function tagsOf(raw) {
    return raw.split(/[,，\s]+/).map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 20);
  }
  function openNeedForm() {
    var panel = community().openDialog("发布求助", "发布后即为公开记录，任何读者可读。");
    var form = el("form", "cm-form");
    var title = textInput("text", { required: "required", maxlength: "200", placeholder: "一句话说明你需要什么帮助" });
    var body = areaInput({ required: "required", maxlength: "8000", placeholder: "背景、已经试过什么、卡在哪里" });
    var constraints = areaInput({ maxlength: "1500", placeholder: "可选：限制条件，如时间、环境、不能用的方案" });
    constraints.rows = 3;
    var expected = areaInput({ maxlength: "1000", placeholder: "可选：期望得到什么样的结果" });
    expected.rows = 2;
    var tags = textInput("text", { placeholder: "可选：标签，用逗号分隔" });
    var key = newKey();
    var btn = el("button", null, "公开发布求助");
    btn.type = "submit";
    var sub = submitRow(btn, "正在发布…");
    form.appendChild(field("标题", title));
    form.appendChild(field("正文", body));
    form.appendChild(field("限制条件", constraints));
    form.appendChild(field("期望结果", expected));
    form.appendChild(field("标签", tags));
    form.appendChild(sub.row);
    // 首次提交后冻结 payload 与请求键：重试不采用编辑后的值；明确失败才解冻作新意图。
    var frozen = null;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!frozen) frozen = { title: title.value.trim(), body: body.value.trim(), constraints: constraints.value.trim(), expected_result: expected.value.trim(), tags: tagsOf(tags.value), visibility: "public", idempotency_key: key };
      sub.run(function () {
        return S.api.createNeed(frozen);
      }, function () { community().closeDialog(); community().refreshBoard(); }, function (err) {
        if (isDefinitive(err)) frozen = null;
      });
    });
    panel.appendChild(form);
  }
  function openExperienceForm() {
    var panel = community().openDialog("分享经验", "发布后即为公开记录；原文按版本保留，修订请发新版本。");
    var form = el("form", "cm-form");
    var title = textInput("text", { required: "required", maxlength: "200", placeholder: "这条经验解决什么问题" });
    var body = areaInput({ required: "required", maxlength: "8000", placeholder: "做法、步骤、注意事项" });
    var applicability = areaInput({ maxlength: "1000", placeholder: "可选：适用场景与边界" });
    applicability.rows = 2;
    var tags = textInput("text", { placeholder: "可选：标签，用逗号分隔" });
    var key = newKey();
    var btn = el("button", null, "公开发布经验");
    btn.type = "submit";
    var sub = submitRow(btn, "正在发布…");
    form.appendChild(field("标题", title));
    form.appendChild(field("正文", body));
    form.appendChild(field("适用场景", applicability));
    form.appendChild(field("标签", tags));
    form.appendChild(sub.row);
    var frozen = null;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!frozen) frozen = { title: title.value.trim(), body: body.value.trim(), applicability: applicability.value.trim(), tags: tagsOf(tags.value), sources: [], visibility: "public", idempotency_key: key };
      sub.run(function () {
        return S.api.publishExperience(frozen);
      }, function () { community().closeDialog(); community().refreshBoard(); }, function (err) {
        if (isDefinitive(err)) frozen = null;
      });
    });
    panel.appendChild(form);
  }

  /* ---------- 线程增强：回复/补充、需求详情、成果决策、平台 Agent ---------- */
  function enhanceThread(panel, record) {
    var detailSlot = panel.querySelector("[data-cm-need-detail]");
    if (detailSlot) renderNeedDetail(detailSlot, record);
    if (!signedIn()) return;
    var form = el("form", "cm-form cm-reply-form");
    form.appendChild(el("h3", null, "参与这条公开线程"));
    var category = el("select", "cm-input");
    [["reply", "回复：针对线程给出回应"], ["supplement", "补充：为线程补充信息"]].forEach(function (pair) {
      var opt = el("option", null, pair[1]);
      opt.value = pair[0];
      category.appendChild(opt);
    });
    var body = areaInput({ required: "required", maxlength: "8000", placeholder: "内容公开可读；引用他人方法请注明来处。" });
    var key = newKey();
    var btn = el("button", null, "公开发表");
    btn.type = "submit";
    var sub = submitRow(btn, "正在发表…");
    form.appendChild(field("类型", category));
    form.appendChild(field("内容", body));
    form.appendChild(sub.row);
    /* 首次提交后冻结 payload（含解析出的当前版本号）与请求键：响应丢失后重试发同一请求，
       不采用编辑后的值、不静默换版本；明确的终态拒绝（校验/冲突/不可变/版本冲突）才解冻，
       由人决定新意图；unknown 一律保留原 payload 与键供对账。
       公告卡可能是求助线程内的回复/成果，用 readRecord 直接取线程根（分页首屏可能不含根）；
       reply_to_id 保留被点击的记录，留下可回读的交流依据。 */
    var frozen = null;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      sub.run(function () {
        if (!frozen) {
          // 在意图创建时捕获类型与正文，异步读取返回后不再重读控件
          var capturedCategory = category.value;
          var capturedBody = body.value.trim();
          frozen = S.api.readRecord(record.thread_id).then(function (root) {
            var base = root.kind === "need"
              ? S.api.readNeed(record.thread_id).then(function (detail) { return detail.need.revision; })
              : Promise.resolve(undefined);
            return base.then(function (revision) {
              var input = { thread_id: record.thread_id, reply_to_id: record.id, category: capturedCategory, body: capturedBody, idempotency_key: key };
              if (revision !== undefined) input.expected_revision = revision;
              return input;
            });
          });
        }
        return frozen.then(function (input) {
          return S.api.postReply(input).catch(function (err) {
            // 明确终态拒绝：解冻，由人决定作为新意图重发；unknown 保留下方提示对账
            if (isDefinitive(err)) frozen = null;
            throw err;
          });
        }, function (buildErr) {
          // 版本解析本身失败：不算已发出的意图，解冻允许重建
          frozen = null;
          throw buildErr;
        });
      }, function () {
        community().reopenThread(record);
        community().refreshBoard();
      });
    });
    panel.appendChild(form);
  }

  function renderNeedDetail(slot, record) {
    slot.innerHTML = "";
    slot.appendChild(el("p", "cm-sub", "正在读取需求详情…"));
    if (!S.api) {
      if (S.status === "loading") { clientPromise.then(function () { if (slot.isConnected) renderNeedDetail(slot, record); }); return; }
      slot.innerHTML = "";
      slot.appendChild(el("p", "cm-sub", "需求详情需要登录服务可用；线程公开记录仍可阅读。"));
      return;
    }
    S.api.readNeed(record.id).then(function (detail) {
      if (slot.isConnected) renderNeedDetailLoaded(slot, record, detail);
    }).catch(function (e) {
      slot.innerHTML = "";
      slot.appendChild(el("p", "cm-form-error", "需求详情暂不可读：" + errText(e) + " 线程公开记录仍可阅读。"));
    });
  }
  function renderNeedDetailLoaded(slot, record, detail) {
    slot.innerHTML = "";
    var need = detail.need;
    var box = el("div", "cm-need-detail");
    var head = el("div", "cm-need-head");
    head.appendChild(el("span", "cm-pill need", "需求 · 第 " + need.revision + " 版"));
    head.appendChild(el("span", "cm-need-status", NEED_STATUS[need.status] || need.status));
    head.appendChild(el("span", "cm-sub-inline", "有效期至 " + fmtTime(need.expires_at)));
    box.appendChild(head);
    if (need.constraints) box.appendChild(el("p", "cm-need-meta", "限制条件：" + need.constraints));
    if (need.expected_result) box.appendChild(el("p", "cm-need-meta", "期望结果：" + need.expected_result));

    var mine = signedIn() && need.owner_id === S.human.id;

    if (detail.results.length) {
      box.appendChild(el("h3", null, "收到的帮助与成果（" + detail.results.length + "）"));
      detail.results.forEach(function (r) {
        var card = el("div", "cm-result");
        var byline = el("div", "cm-byline");
        byline.appendChild(el("span", "cm-pill " + (r.subtype === "help" ? "reply" : "result"), r.subtype === "help" ? "帮助" : "成果"));
        byline.appendChild(el("span", null, "对应第 " + r.need_revision + " 版"));
        byline.appendChild(el("time", null, fmtTime(r.created_at)));
        card.appendChild(byline);
        card.appendChild(el("h4", null, r.title));
        card.appendChild(el("p", "cm-body", r.body));
        if (r.sources && r.sources.length) {
          var src = el("div", "cm-sources");
          src.appendChild(el("span", "cm-need-meta", "来源："));
          r.sources.forEach(function (s) {
            var item = el("span", "cm-source");
            item.appendChild(el("span", null, s.title + (s.author ? "（" + s.author + "）" : "")));
            if (s.url && /^https?:\/\//i.test(s.url)) {
              var a = el("a", null, "原文链接 ↗");
              a.href = s.url;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              item.appendChild(a);
            }
            src.appendChild(item);
          });
          card.appendChild(src);
        }
        if (r.method_refs && r.method_refs.length) {
          var refs = el("div", "cm-sources");
          refs.appendChild(el("span", "cm-need-meta", "引用的经验方法："));
          r.method_refs.forEach(function (ref) {
            var open = el("button", "cm-ref-link", "经验第 " + ref.revision + " 版（" + ref.experience_id.slice(0, 8) + "…）");
            open.type = "button";
            open.title = ref.usage;
            open.addEventListener("click", function () { openExperience(ref); });
            refs.appendChild(open);
          });
          card.appendChild(refs);
        }
        if (mine && need.status !== "accepted" && need.status !== "closed" && r.need_revision === need.revision) {
          var actions = el("div", "cm-result-actions");
          [["accept", "采纳这份成果"], ["request_revision", "请补充修改"], ["reject", "暂不采纳"]].forEach(function (pair) {
            var b = el("button", "cm-button " + (pair[0] === "accept" ? "cm-button-primary" : "cm-button-ghost"), pair[1]);
            b.type = "button";
            // 同一次决定意图固定一个请求键：失败/结果未知时重试仍用同一键，服务端去重。
            var decideKey = newKey();
            b.addEventListener("click", function () {
              b.disabled = true;
              S.api.decideResult(need.id, { result_id: r.id, expected_revision: need.revision, decision: pair[0], note: "", idempotency_key: decideKey }).then(function () {
                renderNeedDetail(slot, record);
                community().refreshBoard();
              }).catch(function (e) {
                b.disabled = false;
                b.textContent = errText(e);
              });
            });
            actions.appendChild(b);
          });
          card.appendChild(actions);
        }
        box.appendChild(card);
      });
    } else {
      box.appendChild(el("p", "cm-sub", "还没有收到针对当前版本的帮助或成果。"));
    }

    if (detail.decisions.length) {
      var last = detail.decisions[detail.decisions.length - 1];
      var label = { accept: "已采纳一份成果", request_revision: "已要求补充修改", reject: "已暂不采纳" }[last.decision] || last.decision;
      box.appendChild(el("p", "cm-need-meta", "最近一次决定：" + label + "（第 " + last.need_revision + " 版，" + fmtTime(last.created_at) + "）。"));
    }

    if (mine && need.status !== "closed" && need.status !== "accepted") {
      var closeBtn = el("button", "cm-button cm-button-ghost", "关闭这个需求");
      closeBtn.type = "button";
      var closeKey = newKey();
      closeBtn.addEventListener("click", function () {
        closeBtn.disabled = true;
        S.api.closeNeed(need.id, { expected_revision: need.revision, idempotency_key: closeKey }).then(function () {
          renderNeedDetail(slot, record);
          community().refreshBoard();
        }).catch(function (e) {
          closeBtn.disabled = false;
          closeBtn.textContent = errText(e);
        });
      });
      box.appendChild(closeBtn);
    }

    if (mine && need.status !== "closed" && need.status !== "accepted") {
      box.appendChild(runBlock(slot, record, need));
    }
    slot.appendChild(box);
  }

  /* 平台 Agent：只对本人需求发起；只展示服务端回执，不模拟过程。 */
  function runBlock(slot, record, need) {
    var wrap = el("div", "cm-run");
    wrap.appendChild(el("h3", null, "让平台助手尝试当前版本"));
    var note = el("p", "cm-sub", "请求发出后等待服务端真实回执（可能约一分钟）。回执只说明服务确认的状态，不做过程动画。");
    wrap.appendChild(note);
    var btn = el("button", "cm-button cm-button-ghost", "请求平台助手帮助");
    btn.type = "button";
    wrap.appendChild(btn);
    var out = el("div", "cm-run-out");
    wrap.appendChild(out);
    var key = newKey();
    btn.addEventListener("click", function () {
      btn.disabled = true;
      out.innerHTML = "";
      out.appendChild(el("p", "cm-sub", "已发出请求，等待服务端回执…"));
      S.api.startRun({ need_id: need.id, need_revision: need.revision, idempotency_key: key }).then(function (run) {
        btn.disabled = false;
        renderRun(out, run);
        // 终态才换键；状态未知必须保留原键与原任务，只能用 readRun 核对，不能一次点击重开模型。
        if (["succeeded", "failed", "cancelled", "timed_out"].indexOf(run.status) !== -1) key = newKey();
        if (run.status === "succeeded") {
          out.appendChild(el("p", "cm-sub", "成果已提交到本需求。关闭并重新打开线程可看到最新内容与版本状态。"));
          community().refreshBoard();
        }
      }).catch(function (e) {
        btn.disabled = false;
        out.innerHTML = "";
        out.appendChild(el("p", "cm-form-error", "平台助手暂不可用：" + errText(e) + " 本次请求键保留，可再次尝试；服务未配置时会明确返回不可用，不会展示虚构状态。"));
      });
    });
    return wrap;
  }
  function renderRun(out, run) {
    out.innerHTML = "";
    var card = el("div", "cm-run-card");
    card.appendChild(el("strong", null, "回执：" + (RUN_STATUS[run.status] || run.status)));
    var usage = run.usage || {};
    card.appendChild(el("p", "cm-need-meta",
      "任务 " + run.id.slice(0, 8) + "… · 模型步骤 " + usage.model_steps + " · 知乎查询 " + usage.zhihu_queries +
      (run.result_id ? " · 已提交成果" : "") + " · " + fmtTime(run.updated_at)));
    if (run.error && run.error.message) card.appendChild(el("p", "cm-form-error", run.error.message));
    if (run.status === "unknown") card.appendChild(el("p", "cm-sub", "服务端不能确认这次执行的结果。请用“查询最新状态”核对，不要直接重新请求；同一请求键不会重复启动模型。"));
    if (run.status === "queued" || run.status === "running" || run.status === "unknown") {
      if (run.status !== "unknown") {
        var cancel = el("button", "cm-button cm-button-ghost", "取消这个任务");
        cancel.type = "button";
        cancel.addEventListener("click", function () {
          cancel.disabled = true;
          S.api.cancelRun(run.id).then(function (next) { renderRun(out, next); }).catch(function (e) {
            cancel.disabled = false;
            cancel.textContent = errText(e);
          });
        });
        card.appendChild(cancel);
      }
      var check = el("button", "cm-button cm-button-ghost", "查询最新状态");
      check.type = "button";
      check.addEventListener("click", function () {
        check.disabled = true;
        S.api.readRun(run.id).then(function (next) { renderRun(out, next); }).catch(function (e) {
          check.disabled = false;
          check.textContent = errText(e);
        });
      });
      card.appendChild(check);
    }
    out.appendChild(card);
  }

  /* 打开被引用的经验：接口只读当前公开版；引用版本与当前版本不一致时明确标注。 */
  function openExperience(ref) {
    var panel = community().openDialog("被引用的经验", "引用方注明使用方式：" + ref.usage);
    var status = el("p", "cm-sub", "正在读取经验…");
    panel.appendChild(status);
    S.api.readExperience(ref.experience_id).then(function (exp) {
      status.remove();
      if (exp.revision !== ref.revision) {
        panel.appendChild(el("p", "cm-form-error", "引用的是第 " + ref.revision + " 版；当前公开可读的是第 " + exp.revision + " 版，内容可能已有修订。"));
      }
      var card = el("article", "cm-thread-record");
      var byline = el("div", "cm-byline");
      byline.appendChild(el("span", "cm-pill experience", "经验"));
      byline.appendChild(el("span", null, "第 " + exp.revision + " 版"));
      byline.appendChild(el("time", null, fmtTime(exp.created_at)));
      card.appendChild(byline);
      card.appendChild(el("h3", null, exp.title));
      card.appendChild(el("p", "cm-body", exp.body));
      if (exp.applicability) card.appendChild(el("p", "cm-need-meta", "适用场景：" + exp.applicability));
      panel.appendChild(card);
    }).catch(function (e) {
      status.textContent = "这条经验暂时无法读取：" + errText(e);
    });
  }

  /* ---------- 渲染调度 ---------- */
  function renderAll() {
    renderAccount();
    renderGrants();
    renderPublish();
  }
  window.GongzhiAccount = { enhanceThread: enhanceThread };
  renderAll();
})();
