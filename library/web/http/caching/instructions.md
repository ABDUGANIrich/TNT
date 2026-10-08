# Trace a stale HTTP response

Identify one URL, request method, user/auth context, expected representation, and observed stale value. Record which layer returned it: service worker, browser cache, proxy/CDN, or origin. Inspect request/response headers and a known fresh origin response where authorized.

Separate freshness from validation. Follow Cache-Control, Vary, ETag/If-None-Match, and Last-Modified behavior actually used by the application. Check that representation variants do not share an incorrect cache key, especially across authenticated users.

Propose an explicit freshness lifetime and invalidation event for the affected representation. Consider versioned asset URLs separately from mutable API data. Avoid disabling caching globally to fix a single incorrect key.

Verify cold fetch, fresh cache hit, stale revalidation, and a mutation followed by read. Record expected status and content for each. If changing shared-cache behavior, include a check that one user's response cannot appear in another user's session. Deliver the header or key change and evidence from those requests.
