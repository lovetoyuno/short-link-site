import { handleRedirect } from "./_shared.js"

// Matches any single top-level path segment, e.g. /abc123
// Static files in the public/ folder always take priority over this function,
// so this only runs for paths that are not real files (i.e. short codes).
export async function onRequest(context) {
	const { request, env, params, next } = context
	const url = new URL(request.url)
	const code = params.code
	if (!code) return next()

	// Defensive: never let a bug here (e.g. a missing D1 binding) crash the
	// whole request with an "Error 1101" page. If anything goes wrong, fall
	// through to the normal static-asset / 404 handling instead.
	try {
		if (!env.DB) return next()
		const response = await handleRedirect(request, env, url, code)
		if (response) return response
	} catch (err) {
		return next()
	}

	// No matching short link - fall through to the default 404 page.
	return next()
}
