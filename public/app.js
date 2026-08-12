(function () {
  let baseUrl = ""
  let currentLinks = []

  const el = (id) => document.getElementById(id)

  function showToast(message) {
    const t = el("toast")
    t.textContent = message
    t.hidden = false
    clearTimeout(showToast._timer)
    showToast._timer = setTimeout(() => { t.hidden = true }, 2600)
  }

  function openModal(modalId) {
    el("modal-overlay").hidden = false
    ;["modal-create", "modal-batch", "modal-domains", "modal-qr"].forEach((id) => {
      el(id).hidden = id !== modalId
    })
  }

  function closeModal() {
    el("modal-overlay").hidden = true
  }

  async function api(path, options) {
    const res = await fetch("/api" + path, {
      method: (options && options.method) || "GET",
      headers: options && options.body ? { "content-type": "application/json" } : undefined,
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || "请求失败")
    return data
  }

  function statusLabel(status) {
    return { active: "有效", expired: "已过期", scheduled: "未生效", archived: "已归档" }[status] || status
  }

  function renderLinks(links) {
    currentLinks = links
    const table = el("links-table")
    const tbody = el("links-tbody")
    const empty = el("empty-state")
    if (!links.length) {
      table.hidden = true
      empty.hidden = false
      return
    }
    table.hidden = false
    empty.hidden = true
    tbody.innerHTML = links
      .map((link) => {
        return (
          '<tr data-id="' + link.id + '">' +
          '<td><a class="code-cell" href="' + link.shortUrl + '" target="_blank" rel="noopener">' +
          link.shortUrl.replace(/^https?:\/\//, "") + "</a>" +
          (link.title ? '<span class="code-sub">' + escapeHtml(link.title) + "</span>" : "") +
          (link.hasPassword ? '<span class="code-sub">\uD83D\uDD11 \u5BC6\u7801\u4FDD\u62A4</span>' : "") +
          "</td>" +
          '<td class="target-cell" title="' + escapeHtml(link.targetUrl) + '">' + escapeHtml(link.targetUrl) + "</td>" +
          '<td><span class="status-pill status-' + link.status + '">' + statusLabel(link.status) + "</span></td>" +
          "<td>" + link.clicks + "</td>" +
          "<td>" + link.qrScans + "</td>" +
          '<td><div class="row-actions">' +
          '<button class="icon-btn" data-action="copy" title="复制">\uD83D\uDCCB</button>' +
          '<button class="icon-btn" data-action="qr" title="二维码">\u25A6</button>' +
          '<button class="icon-btn" data-action="edit" title="编辑">\u270F\uFE0F</button>' +
          '<button class="icon-btn" data-action="archive" title="' + (link.isArchived ? "取消归档" : "归档") + '">' + (link.isArchived ? "\u267B\uFE0F" : "\uD83D\uDDC3\uFE0F") + "</button>" +
          '<button class="icon-btn" data-action="delete" title="删除">\uD83D\uDDD1\uFE0F</button>' +
          "</div></td></tr>"
        )
      })
      .join("")
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  }

  async function loadStats() {
    const s = await api("/stats/summary")
    el("stat-active").textContent = s.activeLinks
    el("stat-clicks").textContent = s.totalClicks
    el("stat-qr").textContent = s.qrScans
    el("stat-password").textContent = s.passwordProtected
    el("usage-links").textContent = s.totalLinks
    el("usage-active").textContent = s.activeLinks
    el("usage-custom").textContent = s.customCodes
  }

  async function loadLinks() {
    const q = el("search-input").value.trim()
    const status = el("status-select").value
    const archivedOnly = el("archived-toggle").checked ? "1" : "0"
    const params = new URLSearchParams({ q, status, archivedOnly })
    const data = await api("/links?" + params.toString())
    renderLinks(data.links)
  }

  async function refreshAll() {
    await Promise.all([loadStats(), loadLinks()])
  }

  async function loadConfig() {
    const c = await api("/config")
    baseUrl = c.baseUrl
  }

  // ---- Create link ----
  function resetCreateForm() {
    el("f-target").value = ""
    el("f-title").value = ""
    el("f-code").value = ""
    el("f-password").value = ""
    el("f-starts").value = ""
    el("f-expires").value = ""
    el("create-error").textContent = ""
  }

  async function submitCreate() {
    const targetUrl = el("f-target").value.trim()
    const title = el("f-title").value.trim()
    const customCode = el("f-code").value.trim()
    const password = el("f-password").value
    const startsAt = el("f-starts").value ? new Date(el("f-starts").value).toISOString() : null
    const expiresAt = el("f-expires").value ? new Date(el("f-expires").value).toISOString() : null
    el("create-error").textContent = ""
    try {
      await api("/links", { method: "POST", body: { targetUrl, title, customCode, password, startsAt, expiresAt } })
      closeModal()
      resetCreateForm()
      showToast("链接已创建")
      await refreshAll()
    } catch (e) {
      el("create-error").textContent = e.message
    }
  }

  // ---- Batch create ----
  async function submitBatch() {
    const raw = el("f-batch").value.trim()
    el("batch-error").textContent = ""
    el("batch-results").innerHTML = ""
    if (!raw) {
      el("batch-error").textContent = "请至少输入一个目标地址"
      return
    }
    const items = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [target, code] = line.split(",").map((s) => s.trim())
        return code ? { targetUrl: target, customCode: code } : { targetUrl: target }
      })
    try {
      const data = await api("/links/batch", { method: "POST", body: { items } })
      el("batch-results").innerHTML = data.results
        .map((r) => {
          if (r.ok) return '<div class="batch-ok">\u2713 ' + escapeHtml(r.link.shortUrl) + "</div>"
          return '<div class="batch-fail">\u2717 ' + escapeHtml(r.targetUrl || "") + " \u2014 " + escapeHtml(r.error) + "</div>"
        })
        .join("")
      await refreshAll()
    } catch (e) {
      el("batch-error").textContent = e.message
    }
  }

  // ---- Domains ----
  async function loadDomains() {
    const data = await api("/domains")
    el("domains-tbody").innerHTML = data.domains
      .map((d) => {
        return (
          "<tr><td>" + escapeHtml(d.domain) + '</td><td><span class="status-pill ' +
          (d.status === "active" ? "status-active" : "status-scheduled") + '">' +
          (d.status === "active" ? "已生效" : "待验证") + "</span></td>" +
          '<td class="row-actions">' +
          (d.status !== "active"
            ? '<button class="btn btn-secondary btn-small" data-action="verify-domain" data-id="' + d.id + '">标记为已生效</button>'
            : "") +
          '<button class="btn btn-danger btn-small" data-action="delete-domain" data-id="' + d.id + '">删除</button>' +
          "</td></tr>"
        )
      })
      .join("")
  }

  async function addDomain() {
    const domain = el("f-domain").value.trim()
    el("domain-error").textContent = ""
    try {
      await api("/domains", { method: "POST", body: { domain } })
      el("f-domain").value = ""
      await loadDomains()
    } catch (e) {
      el("domain-error").textContent = e.message
    }
  }

  // ---- Row actions ----
  async function handleRowAction(action, id) {
    const link = currentLinks.find((l) => l.id === id)
    if (!link) return
    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(link.shortUrl)
        showToast("已复制到剪贴板")
      } catch {
        showToast(link.shortUrl)
      }
    } else if (action === "qr") {
      const data = await api("/links/" + id + "/qrcode")
      el("qr-image").src = data.qrImageUrl
      el("qr-url").textContent = data.encodedUrl
      openModal("modal-qr")
    } else if (action === "edit") {
      const newTarget = prompt("修改目标地址（本月修改次数有上限）：", link.targetUrl)
      if (newTarget === null || newTarget.trim() === link.targetUrl) return
      try {
        await api("/links/" + id, { method: "PATCH", body: { targetUrl: newTarget.trim() } })
        showToast("已更新")
        await refreshAll()
      } catch (e) {
        showToast(e.message)
      }
    } else if (action === "archive") {
      try {
        await api("/links/" + id, { method: "PATCH", body: { isArchived: !link.isArchived } })
        showToast(link.isArchived ? "已取消归档" : "已归档")
        await refreshAll()
      } catch (e) {
        showToast(e.message)
      }
    } else if (action === "delete") {
      if (!confirm("确定删除该短链接吗？此操作无法撤销。")) return
      try {
        await api("/links/" + id, { method: "DELETE" })
        showToast("已删除")
        await refreshAll()
      } catch (e) {
        showToast(e.message)
      }
    }
  }

  async function handleDomainAction(action, id) {
    if (action === "verify-domain") {
      await api("/domains/" + id, { method: "PATCH", body: { status: "active" } })
      await loadDomains()
    } else if (action === "delete-domain") {
      if (!confirm("删除该域名？")) return
      await api("/domains/" + id, { method: "DELETE" })
      await loadDomains()
    }
  }

  function bindEvents() {
    el("btn-create").addEventListener("click", () => { resetCreateForm(); openModal("modal-create") })
    el("btn-create-empty").addEventListener("click", () => { resetCreateForm(); openModal("modal-create") })
    el("btn-submit-create").addEventListener("click", submitCreate)

    el("btn-batch").addEventListener("click", () => {
      el("f-batch").value = ""
      el("batch-error").textContent = ""
      el("batch-results").innerHTML = ""
      openModal("modal-batch")
    })
    el("btn-submit-batch").addEventListener("click", submitBatch)

    el("btn-domains").addEventListener("click", async () => {
      await loadDomains()
      openModal("modal-domains")
    })
    el("nav-domains").addEventListener("click", async (e) => {
      e.preventDefault()
      await loadDomains()
      openModal("modal-domains")
    })
    el("btn-add-domain").addEventListener("click", addDomain)

    document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", closeModal))
    el("modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") closeModal()
    })

    el("search-input").addEventListener("input", debounce(loadLinks, 300))
    el("status-select").addEventListener("change", loadLinks)
    el("archived-toggle").addEventListener("change", loadLinks)

    el("links-tbody").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]")
      if (!btn) return
      const row = e.target.closest("tr[data-id]")
      handleRowAction(btn.dataset.action, row.dataset.id)
    })

    el("domains-tbody").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]")
      if (!btn) return
      handleDomainAction(btn.dataset.action, btn.dataset.id)
    })
  }

  function debounce(fn, wait) {
    let t
    return (...args) => {
      clearTimeout(t)
      t = setTimeout(() => fn(...args), wait)
    }
  }

  async function init() {
    bindEvents()
    await loadConfig()
    await refreshAll()
  }

  init().catch((e) => showToast(e.message))
})()
