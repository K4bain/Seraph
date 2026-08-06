/**
 * @file streamUtils.ts
 * @description specialized utilities for detecting, transforming, and
 * proxying video streams to ensure cross-origin compatibility and
 * playback stability.
 * @module src/components/video
 */

/**
 * Returns true if the URL points to an HLS manifest (.m3u8).
 * @param {string} url - The URL to check.
 */
export function isHlsUrl(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith(".m3u8") || lower.includes(".m3u8?");
}

/**
 * Returns true if the URL belongs to a known embeddable video platform.
 * @param {string} url - The URL to check.
 */
export function isKnownVideoPlatform(url: string): boolean {
    if (!url) return false;

    const isKnownHost = (host: string): boolean => {
        const knownHosts = [
            "youtube.com",
            "youtu.be",
            "youtube-nocookie.com",
            "twitch.tv",
            "vimeo.com",
            "webcamera.pl",
            "ivideon.com",
            "rtsp.me",
            "bnu.tv",
        ];
        return knownHosts.some((domain) => host === domain || host.endsWith(`.${domain}`));
    };

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const pathAndQuery = `${parsed.pathname}${parsed.search}`.toLowerCase();

        return (
            isKnownHost(host)
            || host.includes("player.")
            || pathAndQuery.includes("/player/")
            || pathAndQuery.includes(".html")
        );
    } catch {
        const lower = url.toLowerCase();
        return lower.includes("/player/") || lower.includes(".html");
    }
}

/**
 * Convert a YouTube watch / short URL into an embeddable URL with autoplay.
 * @param {string} url - The raw YouTube URL.
 */
export function getYouTubeEmbedUrl(url: string): string {
    if (!url) return url;

    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        const allowedHosts = new Set([
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "youtube-nocookie.com",
            "www.youtube-nocookie.com",
            "youtu.be",
        ]);

        if (!allowedHosts.has(hostname)) return url;

        const u = new URL(
            hostname === "youtu.be"
                ? url.replace("youtu.be/", "youtube.com/embed/")
                : url,
        );

        if (u.pathname.startsWith("/watch")) {
            const videoId = u.searchParams.get("v");
            u.pathname = `/embed/${videoId}`;
            u.search = "";
        }

        if (!u.searchParams.has("autoplay")) u.searchParams.set("autoplay", "1");
        u.searchParams.set("enablejsapi", "1");

        return u.toString();
    } catch {
        return url;
    }
}

/**
 * Proxy stream URLs through our server-side proxy to avoid mixed-content blocks
 * and bypass restrictive CORS policies from camera providers.
 * @param {string} url - The raw stream URL.
 */
export function getProxiedStreamUrl(url: string): string {
    if (!url) return url;

    // Always proxy to bypass CORS restrictions from camera providers!
    return `/api/camera/proxy/stream?url=${encodeURIComponent(url)}`;
}

/**
 * Proxy iframe HTML to inject <base> tags and strip X-Frame-Options / CSP headers
 * that prevent embedding.
 * @param {string} url - The iframe source URL.
 */
export function getProxiedIframeUrl(url: string): string {
    if (!url) return url;
    return `/api/camera/proxy/iframe?url=${encodeURIComponent(url)}`;
}

/**
 * Return a user-friendly error message for a failed stream URL.
 * @param {string} streamUrl - The URL that failed.
 */
export function getStreamErrorMessage(streamUrl: string): string {
    if (
        streamUrl.startsWith("http://")
        && typeof window !== "undefined"
        && window.location.protocol === "https:"
    ) {
        return "Mixed Content Error: Connection blocked because the stream uses insecure HTTP on a secure HTTPS site.";
    }
    if (isHlsUrl(streamUrl)) {
        return "Unsupported Format: HLS streams (.m3u8) require a dedicated player and cannot be displayed directly as an image.";
    }
    return "Stream Failed: The stream might be offline, unreachable due to CORS restrictions, or restricted by the provider.";
}
