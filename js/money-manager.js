/* Money Manager — localStorage-backed bill/subscription and payday tracker */

(() => {
  "use strict";

  // ─── Utilities ─────────────────────────────────────────────────────────────

  const escHtml = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

  // ─── Storage ───────────────────────────────────────────────────────────────

  const STORAGE_KEY_BILLS = "mm_bills";
  const STORAGE_KEY_PAYDAYS = "mm_paydays";

  const loadBills = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_BILLS) || "[]");
    } catch {
      return [];
    }
  };

  const saveBills = (bills) => {
    localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(bills));
  };

  const loadPaydays = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_PAYDAYS) || "[]");
    } catch {
      return [];
    }
  };

  const savePaydays = (paydays) => {
    localStorage.setItem(STORAGE_KEY_PAYDAYS, JSON.stringify(paydays));
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const fmt = (amount) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const CATEGORY_ICONS = {
    subscription: "📱",
    utilities: "💡",
    housing: "🏠",
    insurance: "🛡️",
    transport: "🚗",
    food: "🍔",
    health: "❤️",
    entertainment: "🎬",
    other: "📋",
  };

  const FREQUENCY_LABELS = {
    monthly: "Monthly",
    biweekly: "Bi-weekly",
    weekly: "Weekly",
  };

  /**
   * Given a payday record, return the next occurrence on or after today.
   * @param {object} payday
   * @returns {Date}
   */
  const nextPaydayDate = (payday) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let candidate = new Date(payday.nextDate + "T00:00:00");
    if (isNaN(candidate)) return null;

    const DAYS = { weekly: 7, biweekly: 14, monthly: null };

    while (candidate < today) {
      if (payday.frequency === "monthly") {
        candidate.setMonth(candidate.getMonth() + 1);
      } else {
        const days = DAYS[payday.frequency] || 14;
        candidate.setDate(candidate.getDate() + days);
      }
    }

    return candidate;
  };

  /**
   * Format a Date as a readable string, e.g. "Apr 15".
   */
  const fmtDate = (date) => {
    if (!date || isNaN(date)) return "—";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  /**
   * Return the ordinal suffix for a day number (1st, 2nd, 3rd, etc.).
   */
  const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  /**
   * Compute the next due date for a bill in the current or next month.
   */
  const nextBillDate = (dueDay) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    const month = today.getMonth();
    let candidate = new Date(year, month, dueDay);
    if (candidate < today) {
      candidate = new Date(year, month + 1, dueDay);
    }
    return candidate;
  };

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  const renderDashboard = () => {
    const bills = loadBills();
    const paydays = loadPaydays();

    // Monthly bills total
    const monthlyBills = bills.reduce((sum, b) => sum + Number(b.amount), 0);
    document.getElementById("stat-monthly-bills").textContent = fmt(monthlyBills);

    // Monthly income (convert weekly/biweekly to monthly equivalent)
    const monthlyIncome = paydays.reduce((sum, p) => {
      const amt = Number(p.amount);
      if (p.frequency === "weekly") return sum + amt * 4.33;
      if (p.frequency === "biweekly") return sum + amt * 2.165;
      return sum + amt;
    }, 0);
    document.getElementById("stat-monthly-income").textContent = fmt(monthlyIncome);

    // Net monthly
    const net = monthlyIncome - monthlyBills;
    const netEl = document.getElementById("stat-net-monthly");
    netEl.textContent = fmt(net);
    netEl.style.color = net >= 0 ? "#1a8c4e" : "#c0392b";

    // Next payday
    const nextPaydayEl = document.getElementById("stat-next-payday");
    if (paydays.length === 0) {
      nextPaydayEl.textContent = "—";
    } else {
      const upcoming = paydays
        .map((p) => ({ p, date: nextPaydayDate(p) }))
        .filter((x) => x.date !== null)
        .sort((a, b) => a.date - b.date);
      if (upcoming.length > 0) {
        const { p, date } = upcoming[0];
        nextPaydayEl.textContent = `${fmtDate(date)} (${p.name})`;
      } else {
        nextPaydayEl.textContent = "—";
      }
    }

    // Upcoming this month list
    const list = document.getElementById("upcoming-list");
    const items = [];

    // Bills due this month
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    bills.forEach((b) => {
      const date = nextBillDate(b.dueDay);
      if (date <= endOfMonth) {
        const daysUntil = Math.round((date - today) / 86400000);
        items.push({ type: "bill", name: b.name, amount: b.amount, date, daysUntil, category: b.category });
      }
    });

    // Paydays this month
    paydays.forEach((p) => {
      let candidate = new Date(p.nextDate + "T00:00:00");
      if (isNaN(candidate)) return;
      const DAYS = { weekly: 7, biweekly: 14 };
      while (candidate < today) {
        if (p.frequency === "monthly") {
          candidate.setMonth(candidate.getMonth() + 1);
        } else {
          candidate.setDate(candidate.getDate() + (DAYS[p.frequency] || 14));
        }
      }
      // Collect all occurrences this month
      while (candidate <= endOfMonth) {
        const daysUntil = Math.round((candidate - today) / 86400000);
        items.push({ type: "payday", name: p.name, amount: p.amount, date: new Date(candidate), daysUntil });
        if (p.frequency === "monthly") break;
        candidate.setDate(candidate.getDate() + (DAYS[p.frequency] || 14));
      }
    });

    items.sort((a, b) => a.date - b.date);

    if (items.length === 0) {
      list.innerHTML = '<li class="mm-empty-state">No upcoming items this month.</li>';
      return;
    }

    list.innerHTML = items
      .map((item) => {
        const dueSoon = item.type === "bill" && item.daysUntil <= 7;
        const classes = [
          "mm-upcoming-item",
          item.type === "payday" ? "mm-upcoming-payday" : dueSoon ? "mm-upcoming-due-soon" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const amountClass =
          item.type === "payday" ? "mm-upcoming-amount mm-upcoming-amount--income" : "mm-upcoming-amount";

        const prefix = item.type === "payday" ? "+" : "-";
        const dueMeta =
          item.daysUntil === 0
            ? "Today"
            : item.daysUntil === 1
            ? "Tomorrow"
            : `In ${item.daysUntil} days`;

        return `<li class="${classes}">
          <span class="mm-upcoming-name">${escHtml(item.name)}</span>
          <span class="mm-upcoming-meta">${fmtDate(item.date)} &bull; ${dueMeta}</span>
          <span class="${amountClass}">${prefix}${fmt(item.amount)}</span>
        </li>`;
      })
      .join("");
  };

  // ─── Bills List ────────────────────────────────────────────────────────────

  const renderBills = () => {
    const bills = loadBills();
    const container = document.getElementById("bills-list");
    const empty = document.getElementById("bills-empty");

    if (bills.length === 0) {
      empty.hidden = false;
      // Remove any entries; keep the empty state node
      [...container.querySelectorAll(".mm-entry")].forEach((el) => el.remove());
      return;
    }

    empty.hidden = true;
    container.innerHTML = "";
    container.appendChild(empty);

    bills.forEach((bill) => {
      const entry = buildBillEntry(bill);
      container.appendChild(entry);
    });
  };

  const buildBillEntry = (bill) => {
    const icon = CATEGORY_ICONS[bill.category] || "📋";
    const nextDate = nextBillDate(bill.dueDay);

    const el = document.createElement("div");
    el.className = "mm-entry";
    el.dataset.id = bill.id;
    el.innerHTML = `
      <div class="mm-entry-icon">${icon}</div>
      <div class="mm-entry-body">
        <div class="mm-entry-name">${escHtml(bill.name)}</div>
        <div class="mm-entry-meta">
          <span>Due ${ordinal(bill.dueDay)} of each month</span>
          <span>Next: ${fmtDate(nextDate)}</span>
          <span class="mm-chip mm-chip--${bill.category}">${escHtml(capitalize(bill.category))}</span>
          ${bill.notes ? `<span>${escHtml(bill.notes)}</span>` : ""}
        </div>
      </div>
      <div class="mm-entry-right">
        <span class="mm-entry-amount">-${fmt(bill.amount)}/mo</span>
        <div class="mm-entry-actions">
          <button class="mm-btn-icon mm-btn-icon--edit" title="Edit" aria-label="Edit ${escHtml(bill.name)}">✏️</button>
          <button class="mm-btn-icon mm-btn-icon--delete" title="Delete" aria-label="Delete ${escHtml(bill.name)}">🗑️</button>
        </div>
      </div>`;

    el.querySelector(".mm-btn-icon--edit").addEventListener("click", () => openEditBill(bill));
    el.querySelector(".mm-btn-icon--delete").addEventListener("click", () => deleteBill(bill.id));

    return el;
  };

  const deleteBill = (id) => {
    if (!confirm("Delete this bill/subscription?")) return;
    const bills = loadBills().filter((b) => b.id !== id);
    saveBills(bills);
    renderBills();
    renderDashboard();
  };

  // ─── Paydays List ──────────────────────────────────────────────────────────

  const renderPaydays = () => {
    const paydays = loadPaydays();
    const container = document.getElementById("paydays-list");
    const empty = document.getElementById("paydays-empty");

    if (paydays.length === 0) {
      empty.hidden = false;
      [...container.querySelectorAll(".mm-entry")].forEach((el) => el.remove());
      return;
    }

    empty.hidden = true;
    container.innerHTML = "";
    container.appendChild(empty);

    paydays.forEach((payday) => {
      const entry = buildPaydayEntry(payday);
      container.appendChild(entry);
    });
  };

  const buildPaydayEntry = (payday) => {
    const next = nextPaydayDate(payday);

    const el = document.createElement("div");
    el.className = "mm-entry";
    el.dataset.id = payday.id;
    el.innerHTML = `
      <div class="mm-entry-icon">💰</div>
      <div class="mm-entry-body">
        <div class="mm-entry-name">${escHtml(payday.name)}</div>
        <div class="mm-entry-meta">
          <span class="mm-chip mm-chip--${payday.frequency}">${FREQUENCY_LABELS[payday.frequency] || payday.frequency}</span>
          <span>Next: ${fmtDate(next)}</span>
        </div>
      </div>
      <div class="mm-entry-right">
        <span class="mm-entry-amount mm-entry-amount--income">+${fmt(payday.amount)}</span>
        <div class="mm-entry-actions">
          <button class="mm-btn-icon mm-btn-icon--edit" title="Edit" aria-label="Edit ${escHtml(payday.name)}">✏️</button>
          <button class="mm-btn-icon mm-btn-icon--delete" title="Delete" aria-label="Delete ${escHtml(payday.name)}">🗑️</button>
        </div>
      </div>`;

    el.querySelector(".mm-btn-icon--edit").addEventListener("click", () => openEditPayday(payday));
    el.querySelector(".mm-btn-icon--delete").addEventListener("click", () => deletePayday(payday.id));

    return el;
  };

  const deletePayday = (id) => {
    if (!confirm("Delete this payday?")) return;
    const paydays = loadPaydays().filter((p) => p.id !== id);
    savePaydays(paydays);
    renderPaydays();
    renderDashboard();
  };

  // ─── Bill Form ─────────────────────────────────────────────────────────────

  const billFormEl = document.getElementById("form-bill");
  const billFormTitleEl = document.getElementById("form-bill-title");
  const billEditIdEl = document.getElementById("bill-edit-id");
  const billNameEl = document.getElementById("bill-name");
  const billAmountEl = document.getElementById("bill-amount");
  const billDueDayEl = document.getElementById("bill-due-day");
  const billCategoryEl = document.getElementById("bill-category");
  const billNotesEl = document.getElementById("bill-notes");
  const billErrorEl = document.getElementById("bill-error");

  const resetBillForm = () => {
    billEditIdEl.value = "";
    billNameEl.value = "";
    billAmountEl.value = "";
    billDueDayEl.value = "";
    billCategoryEl.value = "subscription";
    billNotesEl.value = "";
    billErrorEl.hidden = true;
    billErrorEl.textContent = "";
    [billNameEl, billAmountEl, billDueDayEl].forEach((el) => el.classList.remove("mm-input-error"));
    billFormTitleEl.textContent = "Add Bill / Subscription";
    document.getElementById("btn-add-bill").textContent = "+ Add Bill";
  };

  const openAddBill = () => {
    resetBillForm();
    billFormEl.hidden = false;
    billNameEl.focus();
  };

  const openEditBill = (bill) => {
    billEditIdEl.value = bill.id;
    billNameEl.value = bill.name;
    billAmountEl.value = bill.amount;
    billDueDayEl.value = bill.dueDay;
    billCategoryEl.value = bill.category;
    billNotesEl.value = bill.notes || "";
    billFormTitleEl.textContent = "Edit Bill / Subscription";
    billErrorEl.hidden = true;
    [billNameEl, billAmountEl, billDueDayEl].forEach((el) => el.classList.remove("mm-input-error"));
    document.getElementById("btn-add-bill").textContent = "Edit Bill";
    billFormEl.hidden = false;
    billFormEl.scrollIntoView({ behavior: "smooth", block: "start" });
    billNameEl.focus();
  };

  document.getElementById("btn-add-bill").addEventListener("click", openAddBill);
  document.getElementById("btn-cancel-bill").addEventListener("click", () => {
    billFormEl.hidden = true;
    resetBillForm();
  });

  document.getElementById("bill-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const name = billNameEl.value.trim();
    const amount = parseFloat(billAmountEl.value);
    const dueDay = parseInt(billDueDayEl.value, 10);
    const category = billCategoryEl.value;
    const notes = billNotesEl.value.trim();

    let valid = true;
    [billNameEl, billAmountEl, billDueDayEl].forEach((el) => el.classList.remove("mm-input-error"));

    if (!name) { billNameEl.classList.add("mm-input-error"); valid = false; }
    if (isNaN(amount) || amount < 0) { billAmountEl.classList.add("mm-input-error"); valid = false; }
    if (isNaN(dueDay) || dueDay < 1 || dueDay > 31) { billDueDayEl.classList.add("mm-input-error"); valid = false; }

    if (!valid) {
      billErrorEl.textContent = "Please fill in all required fields correctly.";
      billErrorEl.hidden = false;
      return;
    }

    billErrorEl.hidden = true;
    const bills = loadBills();
    const editId = billEditIdEl.value;

    if (editId) {
      const idx = bills.findIndex((b) => b.id === editId);
      if (idx !== -1) {
        bills[idx] = { ...bills[idx], name, amount, dueDay, category, notes };
      }
    } else {
      bills.push({ id: uid(), name, amount, dueDay, category, notes });
    }

    saveBills(bills);
    resetBillForm();
    billFormEl.hidden = true;
    renderBills();
    renderDashboard();
  });

  // ─── Payday Form ───────────────────────────────────────────────────────────

  const paydayFormEl = document.getElementById("form-payday");
  const paydayFormTitleEl = document.getElementById("form-payday-title");
  const paydayEditIdEl = document.getElementById("payday-edit-id");
  const paydayNameEl = document.getElementById("payday-name");
  const paydayAmountEl = document.getElementById("payday-amount");
  const paydayFrequencyEl = document.getElementById("payday-frequency");
  const paydayNextDateEl = document.getElementById("payday-next-date");
  const paydayErrorEl = document.getElementById("payday-error");

  const resetPaydayForm = () => {
    paydayEditIdEl.value = "";
    paydayNameEl.value = "";
    paydayAmountEl.value = "";
    paydayFrequencyEl.value = "monthly";
    paydayNextDateEl.value = "";
    paydayErrorEl.hidden = true;
    paydayErrorEl.textContent = "";
    [paydayNameEl, paydayAmountEl, paydayNextDateEl].forEach((el) => el.classList.remove("mm-input-error"));
    paydayFormTitleEl.textContent = "Add Payday";
    document.getElementById("btn-add-payday").textContent = "+ Add Payday";
  };

  const openAddPayday = () => {
    resetPaydayForm();
    paydayFormEl.hidden = false;
    paydayNameEl.focus();
  };

  const openEditPayday = (payday) => {
    paydayEditIdEl.value = payday.id;
    paydayNameEl.value = payday.name;
    paydayAmountEl.value = payday.amount;
    paydayFrequencyEl.value = payday.frequency;
    paydayNextDateEl.value = payday.nextDate;
    paydayFormTitleEl.textContent = "Edit Payday";
    paydayErrorEl.hidden = true;
    [paydayNameEl, paydayAmountEl, paydayNextDateEl].forEach((el) => el.classList.remove("mm-input-error"));
    document.getElementById("btn-add-payday").textContent = "Edit Payday";
    paydayFormEl.hidden = false;
    paydayFormEl.scrollIntoView({ behavior: "smooth", block: "start" });
    paydayNameEl.focus();
  };

  document.getElementById("btn-add-payday").addEventListener("click", openAddPayday);
  document.getElementById("btn-cancel-payday").addEventListener("click", () => {
    paydayFormEl.hidden = true;
    resetPaydayForm();
  });

  document.getElementById("payday-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const name = paydayNameEl.value.trim();
    const amount = parseFloat(paydayAmountEl.value);
    const frequency = paydayFrequencyEl.value;
    const nextDate = paydayNextDateEl.value;

    let valid = true;
    [paydayNameEl, paydayAmountEl, paydayNextDateEl].forEach((el) => el.classList.remove("mm-input-error"));

    if (!name) { paydayNameEl.classList.add("mm-input-error"); valid = false; }
    if (isNaN(amount) || amount < 0) { paydayAmountEl.classList.add("mm-input-error"); valid = false; }
    if (!nextDate) { paydayNextDateEl.classList.add("mm-input-error"); valid = false; }

    if (!valid) {
      paydayErrorEl.textContent = "Please fill in all required fields correctly.";
      paydayErrorEl.hidden = false;
      return;
    }

    paydayErrorEl.hidden = true;
    const paydays = loadPaydays();
    const editId = paydayEditIdEl.value;

    if (editId) {
      const idx = paydays.findIndex((p) => p.id === editId);
      if (idx !== -1) {
        paydays[idx] = { ...paydays[idx], name, amount, frequency, nextDate };
      }
    } else {
      paydays.push({ id: uid(), name, amount, frequency, nextDate });
    }

    savePaydays(paydays);
    resetPaydayForm();
    paydayFormEl.hidden = true;
    renderPaydays();
    renderDashboard();
  });

  // ─── Tabs ──────────────────────────────────────────────────────────────────

  const tabs = document.querySelectorAll(".mm-tab");
  const panels = document.querySelectorAll(".mm-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("mm-tab--active");
        t.setAttribute("aria-selected", "false");
      });
      panels.forEach((p) => {
        p.hidden = true;
      });

      tab.classList.add("mm-tab--active");
      tab.setAttribute("aria-selected", "true");
      const panelId = tab.getAttribute("aria-controls");
      document.getElementById(panelId).hidden = false;
    });
  });

  // ─── Clear All ─────────────────────────────────────────────────────────────

  document.getElementById("btn-clear-all").addEventListener("click", () => {
    if (!confirm("This will delete ALL bills, subscriptions, and paydays. Are you sure?")) return;
    localStorage.removeItem(STORAGE_KEY_BILLS);
    localStorage.removeItem(STORAGE_KEY_PAYDAYS);
    renderBills();
    renderPaydays();
    renderDashboard();
  });

  // ─── Init ──────────────────────────────────────────────────────────────────

  renderBills();
  renderPaydays();
  renderDashboard();
})();
