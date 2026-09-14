/* Local theory-page interactions only: no client, auth, fetch, storage or execution. */
(function () {
  "use strict";
  var root = document.querySelector(".evolution-page");
  if (!root) return;
  var steps = [
    { title: "先保留问题发生的情境", description: "方法从具体问题中来。选择获准使用的知乎问题、经验与讨论，分清原文主张、自己的推断和已经检查的事实。", owner: "资料使用者 · 原作者归属独立保留", input: "用户明确允许的链接或单份资料，以及当前要解决的问题。", output: "来源清单：原作者、原文链接、取得全文或摘要、允许使用的范围。", condition: "可读取不等于可以公开转载；只提炼获准内容，不带出私密日志、记忆或凭据。" },
    { title: "把做法写成有边界的方法", description: "A 将做成事的步骤、输入与适用条件整理为方法。用户确认准确内容和公开范围后，分享为固定 v1；A 随后可以离线。", owner: "A 整理方法 · 用户确认分享", input: "获准资料、A 的任务情境、实际检查与未验证事项。", output: "可引用的固定版本：方法 ID、revision、步骤、适用条件和必要来源。", condition: "接入授权不等于内容同意；先审阅整份方法与公开范围，再发布同一份内容。" },
    { title: "借同一版，面对新的条件", description: "B 在自己的电脑先搜索摘要，再取得准确 ID 与版本。对照新任务的输入、环境和限制，形成这一次的使用计划。", owner: "B · 在自己的电脑按需使用", input: "固定 v1，以及 B 的新任务、变化条件与通过标准。", output: "本机适配计划：哪些步骤保留，哪些假设需要重新确认。", condition: "作者离线仍可借用；下载不等于执行，附带脚本不默认运行，复杂任务可选本机 Kernel。" },
    { title: "让判断对应可检查的证据", description: "B 对新任务实际使用的步骤进行检查。结论需要对应本次输入与结果，成功、失败、不适用和未执行都分别记录。", owner: "B 检查 · 用户控制执行边界", input: "本次适配计划、允许执行的范围与预先约定的检查标准。", output: "可核对的检查记录：输入、条件、结果、偏差和限制。", condition: "没有对应证据就保留为待验证；一个任务通过，不表示方法适用于所有任务。" },
    { title: "反馈是一项独立的选择", description: "B 可以只保留本地结果。决定分享时，反馈说明用了哪一版、怎样使用、得到什么结果，经独立审阅后关联到原方法。", owner: "B 选择是否反馈 · 用户审阅内容与范围", input: "固定版本引用、使用方式、检查结果与允许公开的部分。", output: "关联原 v1 的反馈；若不选择分享，云端不增加反馈记录。", condition: "反馈需要单独的内容确认，不能沿用分享方法时的批准；不把 A 描述成在线参与者。" },
    { title: "把候选改进留给下一版", description: "根据反馈提出更清楚的适用边界或修改步骤，比较候选与旧版的依据。用户批准候选内容和公开范围后，另存 v2，并保留原 v1。", owner: "方法维护者整理候选 · 用户决定发布", input: "原 v1、关联反馈、候选改动及其检查依据。", output: "批准后形成新的固定版本，保留与旧版和反馈的来路。", condition: "反馈不会自动覆盖旧版；候选不等于已发布，也不自动获得更多工具权限。" }
  ];
  var dimensions = {
    scope: { v1Heading: "原适用条件", v1Content: "6 人、室内、60 分钟；每人先写目标与可提供的帮助，再确认分工和一个可检查的交付物。", v1Items: ["可用固定桌面与共享白板", "为每人预留完整讨论时间", "人数、场地或时长改变时需重新判断"], v2Heading: "新的适用边界", v2Content: "12 人、户外、30 分钟；候选做法是先分成小组、缩小交付目标，并预留场地与天气的人工确认。", v2Items: ["把人数、场地和时长列成检查清单", "场地未确认时，保留停止或改期选项", "是否有效仍需要对应任务的检查证据"], note: "条件变化是改进线索；不能据此断言 v2 在所有任务上优于 v1。" },
    evidence: { v1Heading: "旧版需要保留什么", v1Content: "保留 A 对原任务的检查方式、观察到的结果与限制。这里说明应记录的证据类别，不声称活动已实际举办。", v1Items: ["原输入、原环境与检查标准", "哪些步骤有依据，哪些尚未验证", "让借用者能核对结论来自哪次任务"], v2Heading: "候选还需要补充什么", v2Content: "B 需要检查分组后的参与情况、30 分钟内的交付边界及户外条件。尚未取得的证据保留为待验证。", v2Items: ["变化条件与原假设的逐项对照", "对应本次任务的结果、偏差和失败情况", "用户审阅前，候选状态保持不变"], note: "可检查的反馈帮助反思；材料更完整也不等于检查已经通过。" },
    source: { v1Heading: "原文与分享者分别署名", v1Content: "获准知乎资料保留原作者、原文链接和使用范围；A 是方法整理与分享者，两种身份不混为一谈。", v1Items: ["注明取得全文还是摘要，不补造原文", "只引用必要且获准分享的部分", "固定 ID 与版本保留原方法的引用位置"], v2Heading: "新增贡献沿原版本关联", v2Content: "B 的反馈注明所用 v1 与本次适配贡献；候选 v2 继续保留原资料归属，并增加反馈和修改的来路。", v2Items: ["原作者、A 的方法、B 的反馈分开记录", "候选改写仍需复核来源许可与公开范围", "新版本另存，旧引用继续指向 v1"], note: "本页活动案例用于解释版本关系，没有借用真实知乎作者的身份或编造原文链接。" }
  };
  function text(selector, value) { root.querySelector(selector).textContent = value; }
  var currentStep = 0;
  var stepButtons = Array.from(root.querySelectorAll("[data-step]"));
  var labels = ["经验", "方法", "适配", "检查", "反馈", "新版本"];
  function selectStep(index) {
    currentStep = index;
    stepButtons.forEach(function (b, i) { b.setAttribute("aria-selected", String(i === index)); b.tabIndex = i === index ? 0 : -1; });
    root.querySelector("#ev-step-panel").setAttribute("aria-labelledby", "ev-step-" + index);
    text("[data-step-number]", String(index + 1).padStart(2, "0"));
    ["title", "description", "owner", "input", "output", "condition"].forEach(function (key) { text("[data-step-" + key + "]", steps[index][key]); });
    text("[data-next-step]", index === 5 ? "回看第一步：经验 →" : "查看下一步：" + labels[index + 1] + " →");
  }
  function tabs(buttons, activate) {
    buttons.forEach(function (button, index) {
      button.addEventListener("click", function () { activate(index); });
      button.addEventListener("keydown", function (event) {
        var next;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % buttons.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + buttons.length - 1) % buttons.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = buttons.length - 1;
        else return;
        event.preventDefault(); activate(next); buttons[next].focus();
      });
    });
  }
  tabs(stepButtons, selectStep);
  root.querySelector("[data-next-step]").addEventListener("click", function () { selectStep((currentStep + 1) % steps.length); stepButtons[currentStep].focus(); });
  var dimensionButtons = Array.from(root.querySelectorAll("[data-dimension]"));
  tabs(dimensionButtons, function (index) {
    var key = dimensionButtons[index].getAttribute("data-dimension"), data = dimensions[key];
    dimensionButtons.forEach(function (b, i) { b.setAttribute("aria-selected", String(index === i)); b.tabIndex = index === i ? 0 : -1; });
    root.querySelector("#ev-comparison").setAttribute("aria-labelledby", dimensionButtons[index].id);
    ["v1", "v2"].forEach(function (version) {
      text("[data-" + version + "-heading]", data[version + "Heading"]);
      text("[data-" + version + "-content]", data[version + "Content"]);
      var list = root.querySelector("[data-" + version + "-items]"); list.replaceChildren();
      data[version + "Items"].forEach(function (item) { var li = document.createElement("li"); li.textContent = item; list.appendChild(li); });
    });
    text("[data-comparison-note]", "↳ " + data.note);
  });
  var menu = root.querySelector(".ev-menu-button"), navigation = root.querySelector("#ev-mobile-nav");
  function closeMenu() { navigation.hidden = true; menu.setAttribute("aria-expanded", "false"); }
  menu.addEventListener("click", function () { navigation.hidden = !navigation.hidden; menu.setAttribute("aria-expanded", String(!navigation.hidden)); });
  navigation.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeMenu(); menu.focus(); } });
  navigation.addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(); });
  // Preserve the caller's selected mode only in navigation; no demo/runtime code is initialized here.
  if (new URLSearchParams(location.search).get("demo") === "atlas") {
    root.querySelectorAll('a[href^="/zh/"], a[href="/community/zh/evolution/index.html"]').forEach(function (a) { var url = new URL(a.href); url.searchParams.set("demo", "atlas"); a.href = url.pathname + url.search + url.hash; });
  }
})();
