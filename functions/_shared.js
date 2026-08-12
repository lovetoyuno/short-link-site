/**
 * Shared logic for Cloudflare Pages Functions.
 * Used by functions/api/[[path]].js (dashboard API) and functions/[code].js (short-code redirects).
 * No usage limits / plan quotas - links and features are unrestricted.
 */

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

export function json(data, init = {}) {
	return new Response(JSON.stringify(data), {
		status: init.status || 200,
		headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
	})
}

export function errorJson(message, status = 400) {
	return json({ error: message }, { status })
}

export function nowIso() {
	return new Date().toISOString()
}

export function generateId() {
	return crypto.randomUUID()
}

export function generateCode(len = 6) {
	const bytes = crypto.getRandomValues(new Uint8Array(len))
	let out = ""
	for (let i = 0; i < len; i++) out += BASE62[bytes[i] % BASE62.length]
	return out
}

function bufToHex(buf) {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function hexToBuf(hex) {
	const arr = new Uint8Array(hex.length / 2)
	for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16)
	return arr.buffer
}

export async function hashPassword(password) {
	const enc = new TextEncoder()
	const salt = crypto.getRandomValues(new Uint8Array(16))
	const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
		keyMaterial,
		256,
	)
	return { hash: bufToHex(bits), salt: bufToHex(salt.buffer) }
}

export async function verifyPassword(password, hashHex, saltHex) {
	const enc = new TextEncoder()
	const salt = hexToBuf(saltHex)
	const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
		keyMaterial,
		256,
	)
	return bufToHex(bits) === hashHex
}

export function isValidUrl(value) {
	try {
		const u = new URL(value)
		return u.protocol === "http:" || u.protocol === "https:"
	} catch {
		return false
	}
}

export function isValidCode(code) {
	return typeof code === "string" && /^[A-Za-z0-9_-]{3,32}$/.test(code)
}

export async function countActiveLinks(env) {
	const now = nowIso()
	const row = await env.DB.prepare(
		"SELECT COUNT(*) as c FROM links WHERE is_archived = 0 AND (expires_at IS NULL OR expires_at > ?)",
	)
		.bind(now)
		.first()
	return row ? row.c : 0
}

export function linkStatus(link, now) {
	if (link.is_archived) return "archived"
	if (link.expires_at && link.expires_at <= now) return "expired"
	if (link.starts_at && link.starts_at > now) return "scheduled"
	return "active"
}

export function baseUrlFromRequest(request, env) {
	if (env.BASE_SHORT_DOMAIN) return env.BASE_SHORT_DOMAIN.replace(/\/+$/, "")
	const u = new URL(request.url)
	return `${u.protocol}//${u.host}`
}

export async function serializeLink(env, request, link) {
	const now = nowIso()
	const clicksRow = await env.DB.prepare("SELECT COUNT(*) as c FROM clicks WHERE link_id = ?").bind(link.id).first()
	const qrRow = await env.DB.prepare("SELECT COUNT(*) as c FROM clicks WHERE link_id = ? AND is_qr = 1")
		.bind(link.id)
		.first()
	const base = baseUrlFromRequest(request, env)
	return {
		id: link.id,
		code: link.code,
		shortUrl: `${base}/${link.code}`,
		targetUrl: link.target_url,
		title: link.title || "",
		hasPassword: !!link.password_hash,
		isArchived: !!link.is_archived,
		isCustomCode: !!link.is_custom_code,
		startsAt: link.starts_at,
		expiresAt: link.expires_at,
		status: linkStatus(link, now),
		clicks: clicksRow ? clicksRow.c : 0,
		qrScans: qrRow ? qrRow.c : 0,
		targetEditCount: link.target_edit_count,
		createdAt: link.created_at,
		updatedAt: link.updated_at,
	}
}

// ---------- API handlers (no usage limits) ----------

async function apiCreateLink(request, env) {
	const body = await request.json().catch(() => null)
	if (!body || !isValidUrl(body.targetUrl)) return errorJson("请提供有效的目标地址(需以 http/https 开头)")

	let code = body.customCode ? String(body.customCode).trim() : ""
	const isCustom = !!code
	if (isCustom) {
		if (!isValidCode(code)) return errorJson("自定义短码需为 3-32 位字母、数字、- 或 _")
		const existing = await env.DB.prepare("SELECT id FROM links WHERE code = ?").bind(code).first()
		if (existing) return errorJson("该短码已被占用,请更换一个")
	} else {
		for (let i = 0; i < 5; i++) {
			const candidate = generateCode(6)
			const existing = await env.DB.prepare("SELECT id FROM links WHERE code = ?").bind(candidate).first()
			if (!existing) {
				code = candidate
				break
			}
		}
		if (!code) return errorJson("生成短码失败,请重试", 500)
	}

	let passwordHash = null
	let passwordSalt = null
	if (body.password) {
		const { hash, salt } = await hashPassword(String(body.password))
		passwordHash = hash
		passwordSalt = salt
	}

	const id = generateId()
	const now = nowIso()
	await env.DB.prepare(
		`INSERT INTO links (id, code, domain, target_url, title, password_hash, password_salt, is_custom_code, is_archived, starts_at, expires_at, target_edit_count, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)`,
	)
		.bind(
			id,
			code,
			body.domain || null,
			body.targetUrl,
			body.title || null,
			passwordHash,
			passwordSalt,
			isCustom ? 1 : 0,
			body.startsAt || null,
			body.expiresAt || null,
			now,
			now,
		)
		.run()

	const link = await env.DB.prepare("SELECT * FROM links WHERE id = ?").bind(id).first()
	return json({ link: await serializeLink(env, request, link) }, { status: 201 })
}

async function apiBatchCreate(request, env) {
	const body = await request.json().catch(() => null)
	if (!body || !Array.isArray(body.items) || body.items.length === 0) {
		return errorJson("请提供批量创建的链接列表")
	}
	// Technical safety cap per request (not a plan limit) to keep a single request fast.
	if (body.items.length > 200) return errorJson("单次批量创建最多 200 条")

	const results = []
	for (const item of body.items) {
		if (!item || !isValidUrl(item.targetUrl)) {
			results.push({ ok: false, targetUrl: item && item.targetUrl, error: "目标地址无效" })
			continue
		}
		let code = item.customCode ? String(item.customCode).trim() : ""
		const isCustom = !!code
		if (isCustom) {
			if (!isValidCode(code)) {
				results.push({ ok: false, targetUrl: item.targetUrl, error: "自定义短码格式无效" })
				continue
			}
			const existing = await env.DB.prepare("SELECT id FROM links WHERE code = ?").bind(code).first()
			if (existing) {
				results.push({ ok: false, targetUrl: item.targetUrl, error: "短码已被占用" })
				continue
			}
		} else {
			for (let i = 0; i < 5; i++) {
				const candidate = generateCode(6)
				const existing = await env.DB.prepare("SELECT id FROM links WHERE code = ?").bind(candidate).first()
				if (!existing) {
					code = candidate
					break
				}
			}
			if (!code) {
				results.push({ ok: false, targetUrl: item.targetUrl, error: "生成短码失败" })
				continue
			}
		}

		const id = generateId()
		const now = nowIso()
		await env.DB.prepare(
			`INSERT INTO links (id, code, domain, target_url, title, is_custom_code, is_archived, target_edit_count, created_at, updated_at)
			 VALUES (?, ?, NULL, ?, ?, ?, 0, 0, ?, ?)`,
		)
			.bind(id, code, item.targetUrl, item.title || null, isCustom ? 1 : 0, now, now)
			.run()

		const link = await env.DB.prepare("SELECT * FROM links WHERE id = ?").bind(id).first()
		results.push({ ok: true, link: await serializeLink(env, request, link) })
	}

	return json({ results })
}

async function apiListLinks(request, env, url) {
	const q = (url.searchParams.get("q") || "").trim()
	const status = url.searchParams.get("status") || "all"
	const archivedOnly = url.searchParams.get("archivedOnly") === "1"

	let sql = "SELECT * FROM links WHERE 1=1"
	const params = []
	if (q) {
		sql += " AND (code LIKE ? OR title LIKE ? OR target_url LIKE ?)"
		const like = `%${q}%`
		params.push(like, like, like)
	}
	if (archivedOnly) {
		sql += " AND is_archived = 1"
	} else if (status === "active") {
		sql += " AND is_archived = 0 AND (expires_at IS NULL OR expires_at > ?)"
		params.push(nowIso())
	} else if (status === "expired") {
		sql += " AND is_archived = 0 AND expires_at IS NOT NULL AND expires_at <= ?"
		params.push(nowIso())
	} else if (status === "archived") {
		sql += " AND is_archived = 1"
	}
	sql += " ORDER BY created_at DESC LIMIT 200"

	const { results } = await env.DB.prepare(sql).bind(...params).all()
	const links = []
	for (const row of results) links.push(await serializeLink(env, request, row))
	return json({ links })
}

async function apiGetLink(request, env, id) {
	const link = await env.DB.prepare("SELECT * FROM links WHERE id = ?").bind(id).first()
	if (!link) return errorJson("链接不存在", 404)
	return json({ link: await serializeLink(env, request, link) })
}

async function apiUpdateLink(request, env, id) {
	const body = await request.json().catch(() => null)
	if (!body) return errorJson("请求体无效")
	const link = await env.DB.prepare("SELECT * FROM links WHERE id = ?").bind(id).first()
	if (!link) return errorJson("链接不存在", 404)

	const updates = []
	const values = []

	if (typeof body.targetUrl === "string" && body.targetUrl !== link.target_url) {
		if (!isValidUrl(body.targetUrl)) return errorJson("目标地址无效")
		updates.push("target_url = ?")
		values.push(body.targetUrl)
		updates.push("target_edit_count = target_edit_count + 1")
	}
	if (typeof body.title === "string") {
		updates.push("title = ?")
		values.push(body.title || null)
	}
	if (typeof body.code === "string" && body.code.trim() !== link.code) {
		const newCode = body.code.trim()
		if (!isValidCode(newCode)) return errorJson("短码需为 3-32 位字母、数字、- 或 _")
		const existing = await env.DB.prepare("SELECT id FROM links WHERE code = ? AND id != ?").bind(newCode, id).first()
		if (existing) return errorJson("该短码已被占用,请更换一个")
		updates.push("code = ?")
		values.push(newCode)
		updates.push("is_custom_code = 1")
	}
	if (body.password !== undefined) {
		if (body.password) {
			const { hash, salt } = await hashPassword(String(body.password))
			updates.push("password_hash = ?", "password_salt = ?")
			values.push(hash, salt)
		} else {
			updates.push("password_hash = NULL", "password_salt = NULL")
		}
	}
	if (typeof body.isArchived === "boolean") {
		updates.push("is_archived = ?")
		values.push(body.isArchived ? 1 : 0)
	}
	if (body.startsAt !== undefined) {
		updates.push("starts_at = ?")
		values.push(body.startsAt || null)
	}
	if (body.expiresAt !== undefined) {
		updates.push("expires_at = ?")
		values.push(body.expiresAt || null)
	}

	if (updates.length === 0) return json({ link: await serializeLink(env, request, link) })

	updates.push("updated_at = ?")
	values.push(nowIso())
	await env.DB.prepare(`UPDATE links SET ${updates.join(", ")} WHERE id = ?`)
		.bind(...values, id)
		.run()

	const updated = await env.DB.prepare("SELECT * FROM links WHERE id = ?").bind(id).first()
	return json({ link: await serializeLink(env, request, updated) })
}

async function apiDeleteLink(env, id) {
	await env.DB.prepare("DELETE FROM clicks WHERE link_id = ?").bind(id).run()
	await env.DB.prepare("DELETE FROM links WHERE id = ?").bind(id).run()
	return json({ deleted: true })
}

async function apiStatsSummary(env) {
	const now = nowIso()
	const active = await env.DB.prepare(
		"SELECT COUNT(*) as c FROM links WHERE is_archived = 0 AND (expires_at IS NULL OR expires_at > ?)",
	)
		.bind(now)
		.first()
	const totalClicks = await env.DB.prepare("SELECT COUNT(*) as c FROM clicks").first()
	const qrScans = await env.DB.prepare("SELECT COUNT(*) as c FROM clicks WHERE is_qr = 1").first()
	const passwordProtected = await env.DB.prepare(
		"SELECT COUNT(*) as c FROM links WHERE password_hash IS NOT NULL AND is_archived = 0",
	).first()
	const totalLinks = await env.DB.prepare("SELECT COUNT(*) as c FROM links").first()
	const customCodes = await env.DB.prepare("SELECT COUNT(*) as c FROM links WHERE is_custom_code = 1").first()
	return json({
		activeLinks: active.c,
		totalClicks: totalClicks.c,
		qrScans: qrScans.c,
		passwordProtected: passwordProtected.c,
		totalLinks: totalLinks.c,
		customCodes: customCodes.c,
	})
}

async function apiListDomains(env) {
	const { results } = await env.DB.prepare("SELECT * FROM domains ORDER BY created_at DESC").all()
	return json({
		domains: results.map((d) => ({ id: d.id, domain: d.domain, status: d.status, createdAt: d.created_at })),
	})
}

async function apiCreateDomain(request, env) {
	const body = await request.json().catch(() => null)
	if (!body || !body.domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(body.domain.trim())) {
		return errorJson("请输入有效的域名,例如 s.example.com")
	}
	const domain = body.domain.trim().toLowerCase()
	const existing = await env.DB.prepare("SELECT id FROM domains WHERE domain = ?").bind(domain).first()
	if (existing) return errorJson("该域名已添加")
	const id = generateId()
	await env.DB.prepare("INSERT INTO domains (id, domain, status, created_at) VALUES (?, ?, 'pending', ?)")
		.bind(id, domain, nowIso())
		.run()
	return json({ domain: { id, domain, status: "pending", createdAt: nowIso() } }, { status: 201 })
}

async function apiUpdateDomain(request, env, id) {
	const body = await request.json().catch(() => null)
	if (!body || !body.status) return errorJson("缺少状态")
	await env.DB.prepare("UPDATE domains SET status = ? WHERE id = ?").bind(body.status, id).run()
	return json({ ok: true })
}

async function apiDeleteDomain(env, id) {
	await env.DB.prepare("DELETE FROM domains WHERE id = ?").bind(id).run()
	return json({ deleted: true })
}

/**
 * Handles /api/* requests. `pathParts` is the path AFTER "/api/", e.g.
 * ["links"], ["links", "123"], ["links", "123", "qrcode"], ["domains"], etc.
 */
export async function handleApiRequest(pathParts, request, env, url) {
	const method = request.method

	if (pathParts[0] === "config" && method === "GET") {
		return json({ baseUrl: baseUrlFromRequest(request, env) })
	}
	if (pathParts[0] === "links" && pathParts.length === 1) {
		if (method === "GET") return apiListLinks(request, env, url)
		if (method === "POST") return apiCreateLink(request, env)
	}
	if (pathParts[0] === "links" && pathParts[1] === "batch" && method === "POST") {
		return apiBatchCreate(request, env)
	}
	if (pathParts[0] === "links" && pathParts.length === 2) {
		const id = pathParts[1]
		if (method === "GET") return apiGetLink(request, env, id)
		if (method === "PATCH") return apiUpdateLink(request, env, id)
		if (method === "DELETE") return apiDeleteLink(env, id)
	}
	if (pathParts[0] === "links" && pathParts[2] === "qrcode" && method === "GET") {
		const id = pathParts[1]
		const link = await env.DB.prepare("SELECT * FROM links WHERE id = ?").bind(id).first()
		if (!link) return errorJson("链接不存在", 404)
		const base = baseUrlFromRequest(request, env)
		const target = `${base}/${link.code}?src=qr`
		const qrImageUrl = "https:" + "//api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=" + encodeURIComponent(target)
		return json({ qrImageUrl, encodedUrl: target })
	}
	if (pathParts[0] === "stats" && pathParts[1] === "summary" && method === "GET") {
		return apiStatsSummary(env)
	}
	if (pathParts[0] === "domains" && pathParts.length === 1) {
		if (method === "GET") return apiListDomains(env)
		if (method === "POST") return apiCreateDomain(request, env)
	}
	if (pathParts[0] === "domains" && pathParts.length === 2) {
		const id = pathParts[1]
		if (method === "PATCH") return apiUpdateDomain(request, env, id)
		if (method === "DELETE") return apiDeleteDomain(env, id)
	}
	return errorJson("未找到该接口", 404)
}

// ---------- Redirect + password gate ----------

function gatePageHtml(code, error) {
	return `<!doctype html><html lang="zh"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>需要密码</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#F9F8F7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#2C2C2B}
.card{background:#fff;border:1px solid #E6E5E3;border-radius:12px;padding:32px;width:320px;box-shadow:0 1px 2px rgba(0,0,0,.05),0 4px 12px rgba(0,0,0,.04)}
h1{font-size:18px;margin:0 0 8px}
p{color:#7D7A75;font-size:14px;margin:0 0 20px}
input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #E6E5E3;border-radius:8px;font-size:14px;margin-bottom:12px}
button{width:100%;padding:10px 12px;border:none;border-radius:8px;background:#2783DE;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.err{color:#E56458;font-size:13px;margin:-6px 0 12px}
</style></head><body>
<form class="card" method="POST">
<h1>🔒 此链接受密码保护</h1>
<p>请输入密码以继续访问</p>
${error ? `<div class="err">${error}</div>` : ""}
<input type="password" name="password" placeholder="请输入密码" autofocus required />
<button type="submit">继续</button>
</form></body></html>`
}

function messagePageHtml(title, message) {
	return `<!doctype html><html lang="zh"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#F9F8F7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#2C2C2B}
.card{background:#fff;border:1px solid #E6E5E3;border-radius:12px;padding:32px;width:320px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.05),0 4px 12px rgba(0,0,0,.04)}
h1{font-size:18px;margin:0 0 8px}p{color:#7D7A75;font-size:14px;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`
}

async function recordClick(env, linkId, request, isQr) {
	await env.DB.prepare(
		"INSERT INTO clicks (link_id, clicked_at, is_qr, referrer, country, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
	)
		.bind(
			linkId,
			nowIso(),
			isQr ? 1 : 0,
			request.headers.get("referer") || null,
			request.cf && request.cf.country ? request.cf.country : null,
			request.headers.get("user-agent") || null,
		)
		.run()
}

export async function handleRedirect(request, env, url, code) {
	const link = await env.DB.prepare("SELECT * FROM links WHERE code = ?").bind(code).first()
	if (!link) return null // caller should fall back to a 404 / static assets

	const now = nowIso()
	const status = linkStatus(link, now)
	const isQr = url.searchParams.get("src") === "qr"

	if (status === "archived") {
		return new Response(messagePageHtml("链接已归档", "该短链接已被归档,暂不可用。"), {
			status: 410,
			headers: { "content-type": "text/html; charset=utf-8" },
		})
	}
	if (status === "expired") {
		return new Response(messagePageHtml("链接已过期", "该短链接已超过有效期。"), {
			status: 410,
			headers: { "content-type": "text/html; charset=utf-8" },
		})
	}
	if (status === "scheduled") {
		return new Response(messagePageHtml("链接尚未生效", "该短链接还未到生效时间,请稍后再试。"), {
			status: 403,
			headers: { "content-type": "text/html; charset=utf-8" },
		})
	}

	if (link.password_hash) {
		if (request.method === "POST") {
			const form = await request.formData()
			const password = form.get("password") || ""
			const ok = await verifyPassword(String(password), link.password_hash, link.password_salt)
			if (!ok) {
				return new Response(gatePageHtml(code, "密码不正确,请重试"), {
					status: 401,
					headers: { "content-type": "text/html; charset=utf-8" },
				})
			}
			await recordClick(env, link.id, request, isQr)
			return Response.redirect(link.target_url, 302)
		}
		return new Response(gatePageHtml(code, null), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })
	}

	await recordClick(env, link.id, request, isQr)
	return Response.redirect(link.target_url, 302)
}
