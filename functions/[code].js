import { handleRedirect } from "./_shared.js"

// Matches any single top-level path segment, e.g. /abc123
// Static files in the public/ folder always take priority over this function,
// so this only runs for paths that are not real files (i.e. short codes).
export async function onRequest(context) {
	const { request, env, params, next } = context
	const url = new URL(request.url)
	const code = params.code
	if (!code) return next()

	const response = await handleRedirect(request, env, url, code)
	if (response) return response

	// No matching short link - fall through to the default 404 page.
	return next()
}
