(() => {
  // 这些纯函数不依赖页面，供网页本身和 test.html 共同使用。
  // 以“分”为单位相加，避免 0.1 + 12.5 这类浮点数精度误差。
  function calculateMonthlyTotal(records, month) {
    const cents = (records || [])
      .filter((record) => record && typeof record.date === "string" && record.date.startsWith(month))
      .reduce((sum, record) => sum + Math.round(Number(record.amount) * 100), 0);
    return cents / 100;
  }

  function isValidAmount(value) {
    if (value === "" || value === null || value === undefined) return false;
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0;
  }

  // 暴露给无需构建工具的浏览器测试页。
  window.LedgerApp = { calculateMonthlyTotal, isValidAmount };

  // test.html 只需要上面的纯函数，不加载记账页面的交互。
  if (!document.querySelector(".app-shell")) return;

  const STORAGE_KEY = "ledger-records-v1";
  const CATEGORY = { expense: ["餐饮", "交通", "购物", "居住", "娱乐", "医疗", "学习", "其他"], income: ["工资", "兼职", "红包", "其他"] };
  const PAYMENTS = ["现金", "微信", "支付宝", "银行卡", "其他"];
  const state = { month: monthKey(new Date()), trend: "expense", records: loadRecords(), deletingId: null };
  const $ = (selector) => document.querySelector(selector);
  const els = { title: $("#month-title"), expense: $("#total-expense"), income: $("#total-income"), balance: $("#total-balance"), chart: $("#chart-area"), list: $("#records-list"), count: $("#record-count"), dialog: $("#record-dialog"), form: $("#record-form"), id: $("#record-id"), amount: $("#amount"), date: $("#date"), category: $("#category"), payment: $("#payment-method"), note: $("#note"), error: $("#form-error"), deleteDialog: $("#delete-dialog") };

  function localDate(date = new Date()) { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); }
  function monthKey(date) { return localDate(date).slice(0, 7); }
  function formatMoney(value) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value); }
  function formatMonth(key) { const [year, month] = key.split("-"); const current = monthKey(new Date()); return key === current ? "本月" : `${year} 年 ${Number(month)} 月`; }
  function formatDate(date) { const [year, month, day] = date.split("-"); return `${Number(month)}月${Number(day)}日`; }
  function daysInMonth(key) { const [year, month] = key.split("-").map(Number); return new Date(year, month, 0).getDate(); }
  function shiftMonth(key, amount) { const [year, month] = key.split("-").map(Number); return `${new Date(year, month - 1 + amount, 1).getFullYear()}-${String(new Date(year, month - 1 + amount, 1).getMonth() + 1).padStart(2, "0")}`; }
  function loadRecords() { try { const data = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(data) ? data.filter(validRecord) : []; } catch { return []; } }
  function validRecord(record) { return record && typeof record.id === "string" && isValidAmount(record.amount) && ["income", "expense"].includes(record.type) && typeof record.date === "string"; }
  function saveRecords() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records)); }
  function currentRecords() { return state.records.filter((record) => record.date.startsWith(state.month)).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)); }
  function updateCategories(selected) { const type = document.querySelector('input[name="type"]:checked').value; els.category.innerHTML = CATEGORY[type].map((item) => `<option value="${item}" ${item === selected ? "selected" : ""}>${item}</option>`).join(""); }
  function setupPayments(selected) { els.payment.innerHTML = PAYMENTS.map((item) => `<option value="${item}" ${item === selected ? "selected" : ""}>${item}</option>`).join(""); }

  function render() { const records = currentRecords(); const expense = calculateMonthlyTotal(records.filter(r => r.type === "expense"), state.month); const income = calculateMonthlyTotal(records.filter(r => r.type === "income"), state.month); els.title.textContent = formatMonth(state.month); els.expense.textContent = formatMoney(expense); els.income.textContent = formatMoney(income); els.balance.textContent = formatMoney(income - expense); els.count.textContent = `${records.length} 笔`; document.querySelectorAll("[data-trend]").forEach(button => button.classList.toggle("active", button.dataset.trend === state.trend)); $("#trend-heading").textContent = `本月每日${state.trend === "expense" ? "支出" : "收入"}趋势`; renderChart(records); renderRecords(records); }
  function renderChart(records) { const data = Array.from({ length: daysInMonth(state.month) }, (_, index) => ({ day: index + 1, value: 0 })); records.filter(r => r.type === state.trend).forEach(r => { data[Number(r.date.slice(-2)) - 1].value += Number(r.amount); }); const total = data.reduce((sum, item) => sum + item.value, 0); if (!total) { els.chart.innerHTML = `<div class="chart-empty"><div><strong>还没有${state.trend === "expense" ? "支出" : "收入"}记录</strong><p>这个月还没有账目，记下第一笔吧。</p></div></div>`; return; }
    const w = 760, h = 230, pad = { l: 10, r: 10, t: 16, b: 30 }; const max = Math.max(...data.map(d => d.value), 1); const x = i => pad.l + i * ((w - pad.l - pad.r) / (data.length - 1 || 1)); const y = value => pad.t + (h - pad.t - pad.b) * (1 - value / max); const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" "); const labels = [...new Set([0, Math.floor((data.length - 1) / 3), Math.floor((data.length - 1) * 2 / 3), data.length - 1])]; const grid = [0, .5, 1].map(level => `<line class="gridline" x1="${pad.l}" x2="${w-pad.r}" y1="${y(max * level)}" y2="${y(max * level)}" />`).join(""); const xLabels = labels.map(i => `<text class="axis-label" x="${x(i)}" y="${h - 7}" text-anchor="middle">${data[i].day}日</text>`).join(""); const active = data.filter(d => d.value > 0).map((d, i) => { const index = data.indexOf(d); return `<circle class="point ${state.trend === "income" ? "income" : ""}" cx="${x(index)}" cy="${y(d.value)}" r="3.7"><title>${d.day}日：${formatMoney(d.value)}</title></circle>`; }).join(""); els.chart.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${formatMonth(state.month)}每日${state.trend === "expense" ? "支出" : "收入"}趋势图，最高${formatMoney(max)}">${grid}<text class="axis-label" x="${pad.l}" y="11">最高 ${formatMoney(max)}</text><polyline class="chart-line ${state.trend === "income" ? "income" : ""}" points="${points}" />${active}${xLabels}</svg>`; }
  function renderRecords(records) { if (!records.length) { els.list.innerHTML = `<div class="empty-state"><div><strong>这个月还没有账目</strong><p>从一笔日常消费开始，慢慢看清钱都花到了哪里。</p></div></div>`; return; } els.list.innerHTML = records.map(record => `<article class="record-item ${record.type}"><div class="record-icon" aria-hidden="true">${record.type === "income" ? "↓" : "↑"}</div><div class="record-main"><strong>${escapeHtml(record.category)} <span class="record-note">${record.note ? "· " + escapeHtml(record.note) : ""}</span></strong><div class="record-meta"><span>${record.type === "income" ? "收入" : "支出"}</span><span>${formatDate(record.date)}</span><span>${escapeHtml(record.paymentMethod)}</span></div></div><div class="record-right"><strong class="record-amount">${record.type === "income" ? "+" : "−"}${formatMoney(record.amount)}</strong><button class="edit-button" type="button" data-edit="${record.id}">编辑</button></div></article>`).join(""); }
  function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value || ""; return div.innerHTML; }
  function openForm(record) { els.form.reset(); els.error.textContent = ""; els.id.value = record?.id || ""; document.querySelector(`input[name="type"][value="${record?.type || "expense"}"]`).checked = true; updateCategories(record?.category); setupPayments(record?.paymentMethod); els.amount.value = record?.amount || ""; els.date.value = record?.date || localDate(); els.note.value = record?.note || ""; $("#dialog-title").textContent = record ? "编辑账目" : "新增记账"; $("#dialog-kicker").textContent = record ? "更新记录" : "记录一笔"; els.dialog.showModal(); setTimeout(() => els.amount.focus(), 50); }
  function closeForm() { els.dialog.close(); }
  function submitForm(event) { event.preventDefault(); const type = document.querySelector('input[name="type"]:checked').value; const amount = Number(els.amount.value); if (!isValidAmount(els.amount.value)) { els.error.textContent = "金额必须大于 0。"; els.amount.focus(); return; } if (!els.date.value || !els.category.value || !els.payment.value) { els.error.textContent = "请完整填写日期、分类和支付方式。"; return; } const now = new Date().toISOString(); const existing = state.records.find(r => r.id === els.id.value); const record = { id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), amount, type, category: els.category.value, date: els.date.value, paymentMethod: els.payment.value, note: els.note.value.trim(), createdAt: existing?.createdAt || now, updatedAt: now }; if (existing) Object.assign(existing, record); else state.records.push(record); saveRecords(); closeForm(); render(); }
  function requestDelete(id) { state.deletingId = id; els.deleteDialog.showModal(); }
  function deleteRecord() { state.records = state.records.filter(r => r.id !== state.deletingId); state.deletingId = null; saveRecords(); els.deleteDialog.close(); render(); }
  $("#open-add").addEventListener("click", () => openForm()); $("#open-add-float").addEventListener("click", () => openForm()); $("#previous-month").addEventListener("click", () => { state.month = shiftMonth(state.month, -1); render(); }); $("#next-month").addEventListener("click", () => { state.month = shiftMonth(state.month, 1); render(); }); document.querySelectorAll("[data-trend]").forEach(button => button.addEventListener("click", () => { state.trend = button.dataset.trend; render(); })); document.querySelectorAll('input[name="type"]').forEach(input => input.addEventListener("change", () => updateCategories())); els.form.addEventListener("submit", submitForm); $("#close-dialog").addEventListener("click", closeForm); $("#cancel-dialog").addEventListener("click", closeForm); els.list.addEventListener("click", event => { const id = event.target.dataset.edit; if (!id) return; const record = state.records.find(r => r.id === id); if (record) openForm(record); }); $("#cancel-delete").addEventListener("click", () => els.deleteDialog.close()); $("#confirm-delete").addEventListener("click", deleteRecord); els.dialog.addEventListener("click", event => { if (event.target === els.dialog) closeForm(); }); els.deleteDialog.addEventListener("click", event => { if (event.target === els.deleteDialog) els.deleteDialog.close(); });
  render();
})();
