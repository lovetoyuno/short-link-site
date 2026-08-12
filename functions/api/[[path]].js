import { handleApiRequest } from "../_shared.js"

export async function onRequest(context) {
	const { request, env, params } = context
	const url = new URL(request.url)
	const pathParts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : []
	return handleApiRequest(pathParts, request, env, url)
}
