// proofs.js - loaded AFTER features.js
// Payment proof (photo or PDF) for an entry.
//  - the file is shrunk on the phone and kept in a separate offline store (IndexedDB "proofs_<userId>")
//  - when online it is uploaded through /api/proof to Cloudflare R2; the entry only keeps the file key (entry.proof)
//  - uploads are retried automatically (sync, back online, app start)

const pendingProofIds = new Set();      // entry ids whose file is still waiting for upload
let proofDbPromise = null;
let proofDbName = null;
let proofUploading = false;

// ==================== OFFLINE STORE ====================
function openProofDb() {
    const uid = getCurrentUserId();
    if (!uid) return Promise.reject(new Error("No user logged in"));
    const name = `proofs_${uid}`;
    if (proofDbPromise && proofDbName === name) return proofDbPromise;
    proofDbName = name;
    proofDbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => req.result.createObjectStore("proofs", { keyPath: "entryId" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return proofDbPromise;
}

async function proofTx(mode, action) {
    const db = await openProofDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("proofs", mode);
        const store = tx.objectStore("proofs");
        let result;
        const req = action(store);
        if (req) req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

async function proofPut(rec) { await proofTx("readwrite", s => s.put(rec)); pendingProofIds.add(rec.entryId); }
async function proofGet(id) { return proofTx("readonly", s => s.get(id)); }
async function proofDelete(id) { await proofTx("readwrite", s => s.delete(id)); pendingProofIds.delete(id); }
async function proofAll() { return proofTx("readonly", s => s.getAll()); }

async function refreshPendingProofs() {
    try {
        const all = await proofAll();
        pendingProofIds.clear();
        all.forEach(r => pendingProofIds.add(r.entryId));
    } catch (e) { /* no user yet */ }
}

window.clearProofStore = function (userId) {
    try {
        if (proofDbPromise) proofDbPromise.then(db => db.close()).catch(() => {});
        indexedDB.deleteDatabase(`proofs_${userId}`);
        localStorage.removeItem(`proof_del_${userId}`);
    } catch (e) { /* ignore */ }
    pendingProofIds.clear();
    proofDbPromise = null;
};

// ==================== FILE PREPARATION ====================
const PROOF_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

function makeProofKey(entryId, type) {
    const rand = Math.random().toString(36).slice(2, 6);
    return `proofs/${getCurrentUserId()}/${entryId}-${rand}.${PROOF_EXT[type] || "jpg"}`;
}

function formatBytes(n) {
    return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not read the image"));
        img.src = URL.createObjectURL(file);
    });
}

// photos: max 1600 px, JPEG ~70%  (a phone photo of 4 MB becomes ~300 KB); PDF: up to 2.5 MB as is
async function prepareProofFile(file) {
    if (file.type === "application/pdf") {
        if (file.size > 2.5 * 1024 * 1024) throw new Error("PDF is larger than 2.5 MB. Please send a smaller file or take a photo.");
        return { file, type: "application/pdf", name: file.name || "proof.pdf", size: file.size };
    }
    if (!file.type.startsWith("image/")) throw new Error("Please choose a photo or a PDF file.");
    
    const bmp = await loadBitmap(file);
    const w = bmp.width, h = bmp.height;
    const scale = Math.min(1, 1600 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.72));
    if (!blob) throw new Error("Could not process the image");
    return { file: blob, type: "image/jpeg", name: "proof.jpg", size: blob.size };
}

// ==================== FORM STATE (Add / Edit entry page) ====================
let proofState = null;   // { file, type, name, size, thumb, existingKey, entryId, remove }

function revokeThumb() {
    if (proofState && proofState.thumb) URL.revokeObjectURL(proofState.thumb);
}

function clearProofState() {
    revokeThumb();
    proofState = null;
    renderProofPreview();
}

function renderProofPreview() {
    const box = document.getElementById("proofPreview");
    if (!box) return;
    const p = proofState;
    if (!p) { box.innerHTML = ""; return; }
    
    if (p.file) {
        const thumb = p.type === "application/pdf"
            ? '<div class="proof-pdf">📄</div>'
            : `<img class="proof-thumb" src="${p.thumb}" alt="proof">`;
        box.innerHTML = `
            <div class="proof-card">${thumb}
                <div class="proof-meta"><strong>${escHtml(p.name)}</strong><span>${formatBytes(p.size)} · ready</span></div>
                <button type="button" class="small-btn danger-btn" onclick="removeNewProof()">✖</button>
            </div>`;
    } else if (p.existingKey && !p.remove) {
        box.innerHTML = `
            <div class="proof-card">
                <div class="proof-pdf">📎</div>
                <div class="proof-meta"><strong>Proof attached</strong><span>Pick a new file to replace it</span></div>
                <button type="button" class="small-btn" onclick="viewProof('${p.entryId}')">👁️</button>
                <button type="button" class="small-btn danger-btn" onclick="markProofRemoved()">🗑️</button>
            </div>`;
    } else if (p.remove) {
        box.innerHTML = `
            <div class="proof-card">
                <div class="proof-pdf">🗑️</div>
                <div class="proof-meta"><strong>Proof will be removed</strong><span>when you press Update</span></div>
                <button type="button" class="small-btn" onclick="undoProofRemove()">↩️</button>
            </div>`;
    } else {
        box.innerHTML = "";
    }
}

window.onProofPicked = async function (input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    try {
        const prepared = await prepareProofFile(file);
        const keep = proofState || {};
        revokeThumb();
        proofState = {
            existingKey: keep.existingKey, entryId: keep.entryId, remove: false,
            ...prepared,
            thumb: prepared.type === "application/pdf" ? null : URL.createObjectURL(prepared.file)
        };
        renderProofPreview();
    } catch (e) {
        alert(e.message);
    }
};

window.removeNewProof = function () {
    const keep = proofState || {};
    revokeThumb();
    proofState = keep.existingKey ? { existingKey: keep.existingKey, entryId: keep.entryId, remove: false } : null;
    renderProofPreview();
};
window.markProofRemoved = function () { if (proofState) { proofState.remove = true; renderProofPreview(); } };
window.undoProofRemove = function () { if (proofState) { proofState.remove = false; renderProofPreview(); } };

// ----- hooks into the existing add / edit functions -----
const _addTemp = window.addTemp;
window.addTemp = function () {
    const before = tempEntries.length;
    _addTemp();
    if (tempEntries.length > before && proofState && proofState.file) {
        tempEntries[tempEntries.length - 1].proofBlob = { blob: proofState.file, type: proofState.type, name: proofState.name, size: proofState.size };
        clearProofState();
        renderTemp();
    }
};

const _renderTemp = window.renderTemp;
window.renderTemp = function () {
    _renderTemp();
    document.querySelectorAll("#tempList tbody tr").forEach((tr, i) => {
        if (tempEntries[i] && tempEntries[i].proofBlob && tr.children[3]) tr.children[3].insertAdjacentText("beforeend", " 📎");
    });
};

const _editTemp = window.editTemp;
window.editTemp = function (i) {
    const e = tempEntries[i];
    const p = e && e.proofBlob;
    _editTemp(i);
    if (p) {
        revokeThumb();
        proofState = { ...p, file: p.blob, thumb: p.type === "application/pdf" ? null : URL.createObjectURL(p.blob), remove: false };
        renderProofPreview();
    }
};

const _resetEntryForm = window.resetEntryForm;
window.resetEntryForm = function () { _resetEntryForm(); clearProofState(); };

const _editSavedEntry = window.editSavedEntry;
window.editSavedEntry = function (id) {
    _editSavedEntry(id);
    setTimeout(async () => {
        const entry = (await allEntriesP()).find(x => x.id === id);
        revokeThumb();
        proofState = entry && entry.proof ? { existingKey: entry.proof, entryId: id, remove: false } : { entryId: id };
        renderProofPreview();
    }, 300);
};

// called by saveAll() for every NEW entry (entry.id already exists). Returns a promise or null.
window.attachProofToEntry = function (e) {
    const p = e.proofBlob;
    delete e.proofBlob;                      // never store the file inside the entry itself
    if (!p || !p.blob) { if (!e.proof) e.proof = ""; return null; }
    const key = makeProofKey(e.id, p.type);
    e.proof = key;
    return proofPut({ entryId: e.id, key, type: p.type, blob: p.blob, name: p.name, size: p.size, created: Date.now() })
        .then(() => setTimeout(uploadPendingProofs, 800));
};

// called by saveAll() when an existing entry is EDITED
window.applyProofToEditedEntry = async function (edited, existing) {
    edited.proof = existing.proof || "";
    const p = proofState;
    if (p && p.file) {
        if (existing.proof) queueProofDeletion(existing.proof);
        const key = makeProofKey(edited.id, p.type);
        edited.proof = key;
        await proofPut({ entryId: edited.id, key, type: p.type, blob: p.file, name: p.name, size: p.size, created: Date.now() });
        setTimeout(uploadPendingProofs, 800);
    } else if (p && p.remove) {
        if (existing.proof) queueProofDeletion(existing.proof);
        edited.proof = "";
        try { await proofDelete(edited.id); } catch (e) { /* nothing stored */ }
    }
};

// ==================== UPLOAD / DELETE QUEUE ====================
function delQueueKey() { return `proof_del_${getCurrentUserId()}`; }
function readDelQueue() { try { return JSON.parse(localStorage.getItem(delQueueKey())) || []; } catch (e) { return []; } }

function queueProofDeletion(key) {
    const q = readDelQueue();
    if (!q.includes(key)) q.push(key);
    localStorage.setItem(delQueueKey(), JSON.stringify(q));
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

async function uploadPendingProofs() {
    if (proofUploading || !navigator.onLine) return;
    if (typeof authToken === "undefined" || !authToken) return;
    proofUploading = true;
    let uploaded = 0;
    
    try {
        const records = await proofAll();
        if (records.length > 0) {
            const existingIds = new Set((await allEntriesP()).map(e => e.id));
            for (const rec of records) {
                if (!existingIds.has(rec.entryId)) { await proofDelete(rec.entryId); continue; }   // entry was deleted
                try {
                    const res = await authFetch("/api/proof", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ key: rec.key, contentType: rec.type, data: await blobToBase64(rec.blob) })
                    });
                    const r = await res.json();
                    if (r.success) { await proofDelete(rec.entryId); uploaded++; }
                    else console.error("Proof upload refused:", r.message);
                } catch (e) {
                    if (e.message === "SESSION_EXPIRED") throw e;
                    console.error("Proof upload failed (will retry):", e);
                }
            }
        }
        
        // files that were replaced / removed on the phone
        const queue = readDelQueue();
        const remaining = [];
        for (const key of queue) {
            try {
                const res = await authFetch(`/api/proof?key=${encodeURIComponent(key)}`, { method: "DELETE" });
                const r = await res.json();
                if (!r.success) remaining.push(key);
            } catch (e) {
                if (e.message === "SESSION_EXPIRED") throw e;
                remaining.push(key);
            }
        }
        localStorage.setItem(delQueueKey(), JSON.stringify(remaining));
    } catch (e) {
        if (e.message !== "SESSION_EXPIRED") console.error("Proof upload error:", e);
    } finally {
        proofUploading = false;
        if (uploaded > 0) {
            showToast(`☁️ ${uploaded} payment proof${uploaded > 1 ? "s" : ""} uploaded`);
            if (typeof loadLedger === "function") loadLedger();
        }
    }
}
window.uploadPendingProofs = uploadPendingProofs;

// upload files first, then the entries that point to them
const _syncWithCloud = window.syncWithCloud;
window.syncWithCloud = async function (...args) {
    await uploadPendingProofs();
    return _syncWithCloud.apply(this, args);
};

window.addEventListener("online", () => setTimeout(uploadPendingProofs, 2500));
window.addEventListener("load", () => setTimeout(async () => {
    await refreshPendingProofs();
    if (pendingProofIds.size > 0 && typeof loadLedger === "function") loadLedger();   // show the ⏳ marks
    uploadPendingProofs();
}, 4000));

// ==================== LEDGER BUTTON + VIEWER ====================
window.proofButton = function (e) {
    if (!e.proof) return "";
    const waiting = pendingProofIds.has(e.id);
    return `<button onclick="viewProof('${e.id}')" class="small-btn proof-btn" title="${waiting ? "Waiting to upload" : "View payment proof"}">${waiting ? "⏳" : "📎"}</button>`;
};

window.closeProofViewer = function () {
    const m = document.getElementById("proofViewer");
    if (m) {
        if (m.dataset.blobUrl) URL.revokeObjectURL(m.dataset.blobUrl);
        m.remove();
    }
};

window.viewProof = async function (id) {
    const entry = (await allEntriesP()).find(x => x.id === id);
    if (!entry || !entry.proof) { showToast("No proof attached"); return; }
    
    let url = null, isPdf = entry.proof.endsWith(".pdf"), isLocal = false;
    const rec = await proofGet(id).catch(() => null);
    
    if (rec && rec.blob) {
        url = URL.createObjectURL(rec.blob);
        isPdf = rec.type === "application/pdf";
        isLocal = true;
    } else {
        if (!navigator.onLine) { showToast("Connect to the internet to view this proof"); return; }
        try {
            const res = await authFetch(`/api/proof?key=${encodeURIComponent(entry.proof)}`);
            const r = await res.json();
            if (!r.success) throw new Error(r.message || "Not available");
            url = r.url;
        } catch (e) {
            if (e.message !== "SESSION_EXPIRED") alert("Could not load the proof: " + e.message + "\n\nIt may still be uploading from the phone that created it.");
            return;
        }
    }
    
    closeProofViewer();
    const modal = document.createElement("div");
    modal.id = "proofViewer";
    modal.className = "app-modal";
    if (isLocal) modal.dataset.blobUrl = url;
    modal.innerHTML = `
        <div class="app-modal-box proof-viewer-box">
            <div class="proof-viewer-head">
                <strong>${escHtml(entry.desc)}</strong>
                <span>${escHtml(entry.date)} · ${entry.amount >= 0 ? "+" : "-"}PKR ${formatAmountPlain(Math.abs(entry.amount))}</span>
                ${isLocal ? '<span class="proof-local">⏳ Saved on this phone, waiting to upload</span>' : ""}
            </div>
            <div class="proof-viewer-body">
                ${isPdf ? `<iframe src="${url}" title="proof"></iframe>` : `<img src="${url}" alt="payment proof">`}
            </div>
            <div class="tr-buttons">
                <a class="primary-btn proof-open" href="${url}" target="_blank" rel="noopener">Open full size</a>
                <button class="secondary-btn" onclick="closeProofViewer()">Close</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
};

console.log("✅ proofs.js loaded");
