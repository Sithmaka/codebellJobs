// ---------- Firebase (Firestore) ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, serverTimestamp,
  orderBy, query, doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---- Your Firebase config (as provided) ----
const firebaseConfig = {
  apiKey: "AIzaSyAH-1mTgjdjhaXqxNOhCpHRLNQ7QblGZbQ",
  authDomain: "codebelljobportal.firebaseapp.com",
  projectId: "codebelljobportal",
  storageBucket: "codebelljobportal.appspot.com",
  messagingSenderId: "516533965908",
  appId: "1:516533965908:web:8919af19029a1ab11289c1",
  measurementId: "G-61HE815QSX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const recCol = collection(db, "recoveries");

// ---------- Notify.lk (sender_id=CodeBell) ----------
// Base URL you gave; we’ll append &to= and &message=
const NOTIFY_BASE_URL = "https://app.notify.lk/api/v1/send?user_id=29952&api_key=wEzQqcv2MhB7Da6rzMWq&sender_id=CodeBell";

// ---------- Helpers ----------
const LKR = (n) => "LKR " + Number(n || 0).toLocaleString("en-LK", { maximumFractionDigits: 2 });
const parseNum = (v) => (isNaN(Number(v)) ? 0 : Number(v));
const daysBetween = (a, b) => Math.round(((new Date(a)).setHours(0,0,0,0) - (new Date(b)).setHours(0,0,0,0)) / 86400000);
const formatDate = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d) ? "-" : d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
};
const escapeHTML = (s) => (s ?? "").toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// Phone normalizer: "07XXXXXXXX" -> "947XXXXXXXX"
function normalizeToSriLanka(mobile) {
  const raw = (mobile || "").replace(/\D/g, "");
  if (raw.startsWith("07") && raw.length === 10) return "94" + raw.slice(1);
  if (raw.startsWith("94") && raw.length === 11) return raw;
  if (raw.startsWith("+94") && raw.length === 12) return raw.slice(1);
  return raw; // best-effort
}

function getStatus(dueDateStr) {
  const today = new Date();
  const d = new Date(dueDateStr);
  const diff = daysBetween(d, today);
  if (isNaN(d)) return { label: "N/A", cls: "badge-ok" };
  if (d < new Date(today.toDateString())) return { label: "Overdue", cls: "badge-overdue" };
  if (diff <= 7) return { label: "Due Soon", cls: "badge-soon" };
  return { label: "OK", cls: "badge-ok" };
}

// Compose legal reminder SMS
function buildSmsMessage(rec) {
  const total = LKR(rec.totalAmount).replace("LKR ", "");
  const bal = LKR(rec.balanceAmount).replace("LKR ", "");
  const due = formatDate(rec.dueDate);
  return `Dear ${rec.clientName}, Invoice ${rec.invoiceNo} - Total: LKR ${total}, Balance: LKR ${bal}, Due: ${due}. Please complete the balance payment within 5 working days. If not, we will take legal action. - CodeBell PVT LTD`;
}

// Send via Notify.lk (GET)
async function sendSmsNotify(rec) {
  const to = normalizeToSriLanka(rec.clientPhone);
  if (!/^(94\d{9})$/.test(to)) throw new Error("Invalid Sri Lanka mobile number.");

  const url = `${NOTIFY_BASE_URL}&to=${encodeURIComponent(to)}&message=${encodeURIComponent(buildSmsMessage(rec))}`;
  const res = await fetch(url, { method: "GET" });

  let body;
  try { body = await res.json(); } catch { body = await res.text(); }

  if (!res.ok) throw new Error(typeof body === "string" ? body : JSON.stringify(body));
  if (typeof body === "object" && body !== null && body.status && body.status !== "success") {
    throw new Error(JSON.stringify(body));
  }
  return body;
}

// ---------- DOM ----------
const form = document.getElementById("recoveryForm");
const tbody = document.getElementById("recoveryTbody");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const exportBtn = document.getElementById("exportCSV");
const statTotalOutstanding = document.getElementById("statTotalOutstanding");
const statOverdue = document.getElementById("statOverdue");
const statThisWeek = document.getElementById("statThisWeek");

// Edit modal
const editModalEl = document.getElementById("editModal");
const editModal = new bootstrap.Modal(editModalEl);
const editForm = document.getElementById("editForm");

const editId = document.getElementById("editId");
const editClientName = document.getElementById("editClientName");
const editInvoiceNo = document.getElementById("editInvoiceNo");
const editClientPhone = document.getElementById("editClientPhone");
const editTotalAmount = document.getElementById("editTotalAmount");
const editBalanceAmount = document.getElementById("editBalanceAmount");
const editDueDate = document.getElementById("editDueDate");

// Toast (optional UI feedback)
const toastEl = document.getElementById("toast");
const toastBody = document.getElementById("toastBody");
const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
const showToast = (msg, ok = true) => {
  if (!toastEl) return;
  toastEl.classList.remove("bg-danger", "bg-success", "bg-dark");
  toastEl.classList.add(ok ? "bg-success" : "bg-danger");
  toastBody.textContent = msg;
  toast.show();
};

// ---------- Add ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const clientName = document.getElementById("clientName").value.trim();
  const invoiceNo = document.getElementById("invoiceNo").value.trim();
  const clientPhone = document.getElementById("clientPhone").value.trim();
  const totalAmount = parseNum(document.getElementById("totalAmount").value);
  const balanceAmount = parseNum(document.getElementById("balanceAmount").value);
  const dueDate = document.getElementById("dueDate").value;

  if (!clientName || !invoiceNo || !clientPhone || totalAmount < 0 || balanceAmount < 0 || !dueDate) {
    alert("Please complete all fields correctly.");
    return;
  }
  if (balanceAmount > totalAmount) {
    alert("Balance cannot exceed Total Amount.");
    return;
  }

  await addDoc(recCol, {
    clientName, invoiceNo, clientPhone,
    totalAmount, balanceAmount, dueDate,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });

  form.reset();
  showToast("Record added.", true);
});

// ---------- Live list ----------
let cache = [];

const qList = query(recCol, orderBy("createdAt", "desc"));
onSnapshot(qList, (snap) => {
  cache = [];
  snap.forEach((d) => cache.push({ id: d.id, ...d.data() }));
  renderRows(cache);
  updateStats(cache);
});

function renderRows(list) {
  const search = (searchInput?.value || "").toLowerCase();
  const fStatus = statusFilter?.value;

  const rows = list
    .filter((r) => {
      const t = `${r.clientName} ${r.invoiceNo} ${r.clientPhone}`.toLowerCase();
      if (search && !t.includes(search)) return false;
      const s = getStatus(r.dueDate).label.toLowerCase().replace(" ", "");
      if (fStatus && !s.includes(fStatus)) return false;
      return true;
    })
    .map((r) => {
      const status = getStatus(r.dueDate);
      return `
      <tr>
        <td>${escapeHTML(r.clientName)}</td>
        <td>${escapeHTML(r.invoiceNo)}</td>
        <td>${escapeHTML(r.clientPhone || "")}</td>
        <td class="text-end">${LKR(r.totalAmount)}</td>
        <td class="text-end">${LKR(r.balanceAmount)}</td>
        <td>${formatDate(r.dueDate)}</td>
        <td><span class="badge badge-status ${status.cls}">${status.label}</span></td>
        <td class="text-end d-flex gap-1 justify-content-end">
          <button class="btn btn-sm btn-outline-primary action-btn" data-action="edit" data-id="${r.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger action-btn" data-action="delete" data-id="${r.id}">Delete</button>
          ${r.balanceAmount > 0
            ? `<button class="btn btn-sm btn-outline-success action-btn btn-sms" data-action="sms" data-id="${r.id}">Send SMS</button>`
            : ""}
          ${r.balanceAmount > 0
            ? `<button class="btn btn-sm btn-outline-secondary action-btn" data-action="markpaid" data-id="${r.id}">Mark Paid</button>`
            : ""}
        </td>
      </tr>`;
    })
    .join("");

  tbody.innerHTML = rows || `<tr><td colspan="8" class="text-center text-muted py-4">No records</td></tr>`;
}

// ---------- Filters ----------
searchInput?.addEventListener("input", () => renderRows(cache));
statusFilter?.addEventListener("change", () => renderRows(cache));

// ---------- Table actions ----------
tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const rec = cache.find((x) => x.id === id);
  if (!rec) return;

  if (action === "edit") {
    editId.value = rec.id;
    editClientName.value = rec.clientName;
    editInvoiceNo.value = rec.invoiceNo;
    editClientPhone.value = rec.clientPhone || "";
    editTotalAmount.value = rec.totalAmount;
    editBalanceAmount.value = rec.balanceAmount;
    editDueDate.value = rec.dueDate || "";
    editModal.show();
  }

  if (action === "delete") {
    if (confirm("Delete this record?")) {
      await deleteDoc(doc(db, "recoveries", id));
      showToast("Record deleted.", true);
    }
  }

  if (action === "markpaid") {
    if (confirm("Set balance to 0 and mark as paid?")) {
      await updateDoc(doc(db, "recoveries", id), { balanceAmount: 0, updatedAt: serverTimestamp() });
      showToast("Marked as paid.", true);
    }
  }

  if (action === "sms") {
    try {
      await sendSmsNotify(rec);
      showToast("SMS sent successfully.", true);
      await updateDoc(doc(db, "recoveries", id), { lastSmsAt: serverTimestamp() });
    } catch (err) {
      console.error(err);
      showToast("SMS failed: " + (err?.message || "Unknown error"), false);
    }
  }
});

// ---------- Save edits ----------
editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = editId.value;
  const payload = {
    clientName: editClientName.value.trim(),
    invoiceNo: editInvoiceNo.value.trim(),
    clientPhone: editClientPhone.value.trim(),
    totalAmount: parseNum(editTotalAmount.value),
    balanceAmount: parseNum(editBalanceAmount.value),
    dueDate: editDueDate.value,
    updatedAt: serverTimestamp()
  };

  if (!payload.clientName || !payload.invoiceNo || !payload.clientPhone || payload.totalAmount < 0 || payload.balanceAmount < 0 || !payload.dueDate) {
    alert("Please complete all fields correctly.");
    return;
  }
  if (payload.balanceAmount > payload.totalAmount) {
    alert("Balance cannot exceed Total Amount.");
    return;
  }

  await updateDoc(doc(db, "recoveries", id), payload);
  editModal.hide();
  showToast("Record updated.", true);
});

// ---------- Stats ----------
function updateStats(list) {
  const today = new Date();
  const weekAhead = new Date(); weekAhead.setDate(today.getDate() + 7);

  const totalOutstanding = list.reduce((sum, r) => sum + parseNum(r.balanceAmount), 0);
  const overdue = list.filter((r) => {
    const d = new Date(r.dueDate);
    return !isNaN(d) && d < new Date(today.toDateString()) && parseNum(r.balanceAmount) > 0;
  }).length;
  const thisWeek = list.filter((r) => {
    const d = new Date(r.dueDate);
    return !isNaN(d) && d >= new Date(today.toDateString()) && d <= weekAhead && parseNum(r.balanceAmount) > 0;
  }).length;

  statTotalOutstanding.textContent = LKR(totalOutstanding);
  statOverdue.textContent = overdue;
  statThisWeek.textContent = thisWeek;
}

// ---------- Export CSV ----------
exportBtn.addEventListener("click", () => {
  const rows = [...tbody.querySelectorAll("tr")].map(tr => [...tr.children].map(td => td.innerText));
  if (!rows.length || rows[0].length < 8) {
    alert("No data to export.");
    return;
  }
  const header = ["Client","Invoice","Phone","Total (LKR)","Balance (LKR)","Due Date","Status"];
  const trimmed = rows.filter(r => r[0] !== "No records").map(r => r.slice(0,7));
  const data = [header, ...trimmed];
  const csv = data.map(row => row.map(v => `"${(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recoveries_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});