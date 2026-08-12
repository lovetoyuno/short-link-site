(function () {
  let baseUrl = ""
  let currentLinks = []
  let editingId = null

  const el = (id) => document.getElementById(id)

  // ---- Theme ----
  const THEME_MODES = ["light", "dark", "midnight", "sepia", "forest"]

  function initTheme() {
    let savedTheme = localStorage.getItem("sl-theme") || "light"
    if (THEME_MODES.indexOf(savedTheme) === -1) savedTheme = "light"
    const savedAccent = localStorage.getItem("sl-accent") || "blue"
    document.documentElement.setAttribute("data-theme", savedTheme)
    document.documentElement.setAttribute("data-accent", savedAccent)
    document.querySelectorAll(".accent-swatch").forEach((sw) => {
      sw.classList.toggle("active", sw.dataset.accent === savedAccent)
    })
    document.querySelectorAll(".mode-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === savedTheme)
    })
  }

  function setMode(mode) {
    if (THEME_MODES.indexOf(mode) === -1) mode = "light"
    document.documentElement.setAttribute("data-theme", mode)
    localStorage.setItem("sl-theme", mode)
    document.querySelectorAll(".mode-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode)
    })
  }

  function setAccent(accent) {
    document.documentElement.setAttribute("data-accent", accent)
    localStorage.setItem("sl-accent", accent)
    document.querySelectorAll(".accent-swatch").forEach((sw) => {
      sw.classList.toggle("active", sw.dataset.accent === accent)
    })
  }

  // ---- Effects (particles + toggles) ----
  const FX_DEFAULTS = {
    particles: true,
    blobs: true,
    glow: true,
    cards: true,
    cursor: true,
    tilt: true,
    ripple: true,
    counter: true,
    beam: true,
    grid: true,
    rainbow: true,
  }
  const fxState = {}
  const pointer = { x: null, y: null, active: false }
  let particleAnim = { raf: null, ctx: null, canvas: null, points: [], running: false, resizeBound: false }

  function fxAccentColor() {
    const c = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()
    return c || "#2783DE"
  }

  function hexToRgb(hex) {
    const m = hex.replace("#", "")
    const bigint = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
  }

  function setupParticleCanvas() {
    const canvas = el("fx-particles")
    if (!canvas) return
    particleAnim.canvas = canvas
    particleAnim.ctx = canvas.getContext("2d")
    resizeParticleCanvas()
    const count = Math.max(30, Math.min(70, Math.round((window.innerWidth * window.innerHeight) / 22000)))
    particleAnim.points = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
    }))
    if (!particleAnim.resizeBound) {
      window.addEventListener("resize", debounce(resizeParticleCanvas, 200))
      particleAnim.resizeBound = true
    }
  }

  function resizeParticleCanvas() {
    const canvas = particleAnim.canvas
    if (!canvas) return
    canvas.width = window.innerWidth * window.devicePixelRatio
    canvas.height = window.innerHeight * window.devicePixelRatio
    canvas.style.width = window.innerWidth + "px"
    canvas.style.height = window.innerHeight + "px"
  }

  function stepParticles() {
    const { ctx, canvas, points } = particleAnim
    if (!ctx || !canvas) return
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const rgb = hexToRgb(fxAccentColor())
    const linkDist = 130 * dpr
    for (const p of points) {
      p.x += p.vx * dpr
      p.y += p.vy * dpr
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1
      p.x = Math.max(0, Math.min(canvas.width, p.x))
      p.y = Math.max(0, Math.min(canvas.height, p.y))
    }
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]
        const b = points[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < linkDist) {
          const opacity = (1 - dist / linkDist) * 0.35
          ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + opacity.toFixed(3) + ")"
          ctx.lineWidth = 1 * dpr
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
    }
    if (pointer.active && pointer.x !== null) {
      const px = pointer.x * dpr
      const py = pointer.y * dpr
      const mouseDist = 180 * dpr
      for (const p of points) {
        const dx = p.x - px
        const dy = p.y - py
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < mouseDist) {
          const opacity = (1 - dist / mouseDist) * 0.6
          ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + opacity.toFixed(3) + ")"
          ctx.lineWidth = 1.2 * dpr
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(px, py)
          ctx.stroke()
          p.x -= (dx / (dist || 1)) * 0.25 * dpr
          p.y -= (dy / (dist || 1)) * 0.25 * dpr
        }
      }
    }
    ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.55)"
    for (const p of points) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 1.8 * dpr, 0, Math.PI * 2)
      ctx.fill()
    }
    particleAnim.raf = requestAnimationFrame(stepParticles)
  }

  function startParticles() {
    if (particleAnim.running) return
    if (!particleAnim.canvas) setupParticleCanvas()
    particleAnim.running = true
    particleAnim.raf = requestAnimationFrame(stepParticles)
  }

  function stopParticles() {
    particleAnim.running = false
    if (particleAnim.raf) cancelAnimationFrame(particleAnim.raf)
    particleAnim.raf = null
    if (particleAnim.ctx && particleAnim.canvas) {
      particleAnim.ctx.clearRect(0, 0, particleAnim.canvas.width, particleAnim.canvas.height)
    }
  }

  function applyFxState() {
    Object.keys(FX_DEFAULTS).forEach((key) => {
      document.documentElement.setAttribute("data-fx-" + key, fxState[key] ? "on" : "off")
      const btn = el("fx-" + key + "-switch")
      if (btn) btn.classList.toggle("on", !!fxState[key])
    })
    if (fxState.particles && !document.hidden) startParticles()
    else stopParticles()
  }

  function initFx() {
    Object.keys(FX_DEFAULTS).forEach((key) => {
      const saved = localStorage.getItem("sl-fx-" + key)
      fxState[key] = saved === null ? FX_DEFAULTS[key] : saved === "1"
    })
    applyFxState()
    initPointerFx()
    initTilt()
    initRipple()
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopParticles()
      else if (fxState.particles) startParticles()
    })
  }

  function toggleFx(key) {
    fxState[key] = !fxState[key]
    localStorage.setItem("sl-fx-" + key, fxState[key] ? "1" : "0")
    applyFxState()
  }

  function resetFx() {
    Object.keys(FX_DEFAULTS).forEach((key) => {
      fxState[key] = FX_DEFAULTS[key]
      localStorage.setItem("sl-fx-" + key, FX_DEFAULTS[key] ? "1" : "0")
    })
    applyFxState()
    showToast("\u5df2\u6062\u590d\u9ed8\u8ba4\u7279\u6548")
  }

  // 鼠标光晕 + 粒子跟随
  function initPointerFx() {
    const glow = el("cursor-glow")
    let raf = null
    window.addEventListener("mousemove", (e) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.active = true
      if (glow && fxState.cursor) {
        if (raf) cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
          glow.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"
          glow.classList.add("visible")
        })
      }
    })
    window.addEventListener("mouseleave", () => {
      pointer.active = false
      if (glow) glow.classList.remove("visible")
    })
  }

  // 卡片 3D 倾斜 + 聚光
  function initTilt() {
    document.querySelectorAll("[data-tilt]").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect()
        const px = (e.clientX - rect.left) / rect.width
        const py = (e.clientY - rect.top) / rect.height
        card.style.setProperty("--mx", (px * 100).toFixed(1) + "%")
        card.style.setProperty("--my", (py * 100).toFixed(1) + "%")
        if (!fxState.tilt) return
        const rx = (0.5 - py) * 10
        const ry = (px - 0.5) * 12
        card.style.transform =
          "perspective(900px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg) translateY(-4px) scale(1.015)"
      })
      card.addEventListener("mouseleave", () => {
        card.style.transform = ""
      })
    })
  }

  // 点击涟漪
  function initRipple() {
    document.addEventListener("click", (e) => {
      if (!fxState.ripple) return
      const target = e.target.closest(".btn, .icon-btn, .accent-swatch, .mode-btn")
      if (!target) return
      const rect = target.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height)
      const dot = document.createElement("span")
      dot.className = "ripple-dot"
      dot.style.width = size + "px"
      dot.style.height = size + "px"
      dot.style.left = e.clientX - rect.left - size / 2 + "px"
      dot.style.top = e.clientY - rect.top - size / 2 + "px"
      target.appendChild(dot)
      setTimeout(() => dot.remove(), 640)
    })
  }

  // 数字滚动
  function setStat(id, value) {
    const node = el(id)
    if (!node) return
    const target = Number(value) || 0
    if (!fxState.counter) {
      node.textContent = target
      return
    }
    const from = Number(String(node.textContent).replace(/[^0-9.-]/g, "")) || 0
    if (from === target) {
      node.textContent = target
      return
    }
    const duration = 700
    const startTime = performance.now()
    function frame(now) {
      const t = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      node.textContent = Math.round(from + (target - from) * eased)
      if (t < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  function showToast(message) {
    const t = el("toast")
    t.textContent = message
    t.hidden = false
    clearTimeout(showToast._timer)
    showToast._timer = setTimeout(() => { t.hidden = true }, 2600)
  }

  function openModal(modalId) {
    el("modal-overlay").hidden = false
    ;["modal-create", "modal-edit", "modal-batch", "modal-domains", "modal-qr"].forEach((id) => {
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
    setStat("stat-active", s.activeLinks)
    setStat("stat-clicks", s.totalClicks)
    setStat("stat-qr", s.qrScans)
    setStat("stat-password", s.passwordProtected)
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
      el("batch-error").textContent = "请至少��入一个目标地址"
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
      openEditModal(link)
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

  // ---- Edit link (all fields) ----
  function toLocalInput(iso) {
    if (!iso) return ""
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ""
    const pad = (n) => String(n).padStart(2, "0")
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes())
    )
  }

  function openEditModal(link) {
    editingId = link.id
    el("e-target").value = link.targetUrl || ""
    el("e-title").value = link.title || ""
    el("e-code").value = link.code || ""
    el("e-password").value = ""
    el("e-password").placeholder = link.hasPassword ? "留空则保持原密码不变" : "留空则不设密码"
    el("e-remove-password").checked = false
    el("e-starts").value = toLocalInput(link.startsAt)
    el("e-expires").value = toLocalInput(link.expiresAt)
    el("edit-error").textContent = ""
    openModal("modal-edit")
  }

  async function submitEdit() {
    if (!editingId) return
    const link = currentLinks.find((l) => l.id === editingId)
    const targetUrl = el("e-target").value.trim()
    const title = el("e-title").value.trim()
    const code = el("e-code").value.trim()
    const passwordInput = el("e-password").value
    const removePassword = el("e-remove-password").checked
    const startsAt = el("e-starts").value ? new Date(el("e-starts").value).toISOString() : null
    const expiresAt = el("e-expires").value ? new Date(el("e-expires").value).toISOString() : null
    el("edit-error").textContent = ""
    if (!targetUrl) {
      el("edit-error").textContent = "目标地址不能为空"
      return
    }
    const body = { targetUrl, title, code, startsAt, expiresAt }
    if (removePassword) {
      body.password = ""
    } else if (passwordInput) {
      body.password = passwordInput
    }
    try {
      await api("/links/" + editingId, { method: "PATCH", body })
      closeModal()
      editingId = null
      showToast("已保存修改")
      await refreshAll()
    } catch (e) {
      el("edit-error").textContent = e.message
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
    el("btn-submit-edit").addEventListener("click", submitEdit)

    document.querySelectorAll(".mode-btn").forEach((b) => {
      b.addEventListener("click", () => setMode(b.dataset.mode))
    })
    document.querySelectorAll(".accent-swatch").forEach((sw) => {
      sw.addEventListener("click", () => setAccent(sw.dataset.accent))
    })

    Object.keys(FX_DEFAULTS).forEach((key) => {
      const btn = el("fx-" + key + "-switch")
      if (btn) btn.addEventListener("click", () => toggleFx(key))
    })
    const fxResetBtn = el("btn-fx-reset")
    if (fxResetBtn) fxResetBtn.addEventListener("click", resetFx)

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
    initTheme()
    bindEvents()
    initFx()
    await loadConfig()
    await refreshAll()
  }

  init().catch((e) => showToast(e.message))
})()
