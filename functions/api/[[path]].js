import { handleApiRequest } from "../_shared.js"

export async function onRequest(context) {
	const { request, env, params } = context
	const url = new URL(request.url)
	const pathParts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : []
	if (!env.DB) {
		return new Response(
			JSON.stringify({ error: "数据库未绑定：请在 Cloudflare Pages 项目的 Settings → Functions → D1 database bindings 中添加变量名为 DB 的绑定，然后重新部署一次。" }),
			{ status: 500, headers: { "content-type": "application/json; charset=utf-8" } },
		)
	}
	try {
		return await handleApiRequest(pathParts, request, env, url)
	} catch (err) {
		return new Response(JSON.stringify({ error: "服务器内部错误: " + (err && err.message ? err.message : String(err)) }), {
			status: 500,
			headers: { "content-type": "application/json; charset=utf-8" },
		})
	}
}
