(() => {
    // Prevent multiple injections
    if (window.videoExtensionInjected) {
        return;
    }
    window.videoExtensionInjected = true;

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        try {
            if (request.action === "getVideos") {
                const videos = detectVideos();
                sendResponse({ videos });
                return true;
            }

            if (request.action === "navigateToVideo") {
                navigateToVideo(request.videoUrl);
                sendResponse({ success: true });
                return true;
            }

            if (request.action === "focusVideo") {
                focusVideoElement(request.videoIndex);
                sendResponse({ success: true });
                return true;
            }
        } catch (error) {
            console.error("Content script error:", error);
            sendResponse({ videos: [], error: error.message });
        }
        return true;
    });

    function detectVideos() {
        const videos = [];
        
        // YouTube Playlist Page
        if (isYouTubePlaylistPage()) {
            videos.push(...getPlaylistVideos());
        }
        
        // YouTube Home/Search/Channel Pages
        else if (isYouTubePage()) {
            videos.push(...getYouTubeHomeVideos());
        }
        
        // Generic video detection
        videos.push(...findGenericVideos());
        
        // Remove duplicates based on URL
        const uniqueVideos = videos.filter((video, index, self) => 
            index === self.findIndex(v => v.url === video.url)
        );
        
        return uniqueVideos;
    }

    function isYouTubePage() {
        return window.location.hostname.includes("youtube.com");
    }

    function isYouTubePlaylistPage() {
        return isYouTubePage() && 
               (window.location.search.includes("list=") || 
                window.location.pathname.includes("/playlist"));
    }

    function getPlaylistVideos() {
        const videos = [];
        
        // Try multiple selectors for different YouTube layouts
        const selectors = [
            'ytd-playlist-video-renderer #video-title',
            'ytd-playlist-video-list-renderer #video-title',
            'ytd-playlist-panel-video-renderer #video-title',
            '#contents ytd-playlist-video-renderer a#thumbnail + #meta #video-title'
        ];
        
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                elements.forEach((link, index) => {
                    const title = cleanTitle(link.textContent || link.getAttribute('title') || '');
                    if (title && link.href) {
                        videos.push({
                            title,
                            url: link.href,
                            type: "youtube-playlist",
                            index
                        });
                    }
                });
                break; // Use first successful selector
            }
        }
        
        return videos;
    }

    function getYouTubeHomeVideos() {
        const videos = [];
        
        // Selectors for different YouTube page types
        const selectors = [
            // Home page grid
            'ytd-rich-grid-media #video-title-link',
            'ytd-rich-grid-video #video-title-link',
            
            // Search results
            'ytd-video-renderer #video-title',
            
            // Channel videos
            'ytd-grid-video-renderer #video-title',
            
            // Sidebar recommendations
            'ytd-compact-video-renderer #video-title',
            
            // Watch page suggestions
            'ytd-compact-autoplay-renderer #video-title',
            
            // General fallback
            'a#video-title-link',
            'a#video-title'
        ];
        
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                elements.forEach((link, index) => {
                    const title = cleanTitle(
                        link.textContent || 
                        link.getAttribute('title') || 
                        link.getAttribute('aria-label') || 
                        ''
                    );
                    
                    if (title && link.href && link.href.includes('/watch')) {
                        videos.push({
                            title,
                            url: link.href,
                            type: "youtube-home",
                            index
                        });
                    }
                });
                
                if (videos.length > 0) break; // Use first successful selector
            }
        }
        
        // If still no videos, wait for dynamic content
        if (videos.length === 0) {
            return waitForYouTubeVideos();
        }
        
        return videos;
    }

    function waitForYouTubeVideos() {
        const videos = [];
        
        // Set up observer for dynamically loaded content
        const observer = new MutationObserver((mutations) => {
            let foundNew = false;
            
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    const newVideos = getYouTubeHomeVideos();
                    if (newVideos.length > videos.length) {
                        videos.splice(0, videos.length, ...newVideos);
                        foundNew = true;
                    }
                }
            });
            
            if (foundNew && videos.length > 0) {
                observer.disconnect();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Stop observing after 3 seconds
        setTimeout(() => observer.disconnect(), 3000);
        
        return videos;
    }

    function findGenericVideos() {
        const videos = [];
        
        // HTML5 video elements
        document.querySelectorAll("video").forEach((video, index) => {
            const title = getGenericVideoTitle(video, index);
            const url = getVideoUrl(video);
            
            if (title && url) {
                videos.push({
                    title,
                    url,
                    type: "html5",
                    element: video,
                    index
                });
            }
        });
        
        // Embedded iframes (YouTube, Vimeo, etc.)
        const iframeSelectors = [
            'iframe[src*="youtube.com"]',
            'iframe[src*="youtu.be"]',
            'iframe[src*="vimeo.com"]',
            'iframe[src*="dailymotion.com"]',
            'iframe[src*="twitch.tv"]'
        ];
        
        iframeSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((iframe, index) => {
                const title = getIframeTitle(iframe, index);
                
                if (title && iframe.src) {
                    videos.push({
                        title,
                        url: iframe.src,
                        type: "embedded",
                        index
                    });
                }
            });
        });
        
        return videos;
    }

    function cleanTitle(title) {
        return title
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200); // Limit title length
    }

    function getGenericVideoTitle(videoElement, index) {
        // Try multiple ways to get video title
        const title = videoElement.title ||
                     videoElement.getAttribute("aria-label") ||
                     videoElement.getAttribute("data-title") ||
                     videoElement.getAttribute("alt") ||
                     videoElement.closest("[data-title]")?.getAttribute("data-title") ||
                     videoElement.closest("article")?.querySelector("h1,h2,h3,h4,h5,h6")?.textContent ||
                     videoElement.closest("figure")?.querySelector("figcaption")?.textContent ||
                     document.title ||
                     `Video ${index + 1}`;
        
        return cleanTitle(title);
    }

    function getVideoUrl(videoElement) {
        return videoElement.currentSrc || videoElement.src || window.location.href;
    }

    function getIframeTitle(iframe, index) {
        const title = iframe.title ||
                     iframe.getAttribute("aria-label") ||
                     iframe.getAttribute("data-title") ||
                     iframe.closest("article")?.querySelector("h1,h2,h3,h4,h5,h6")?.textContent ||
                     iframe.closest("figure")?.querySelector("figcaption")?.textContent ||
                     `Embedded Video ${index + 1}`;
        
        return cleanTitle(title);
    }

    function navigateToVideo(videoUrl) {
        try {
            // If it's a YouTube URL, navigate within the same tab
            if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
                window.location.href = videoUrl;
            } else {
                // For other videos, open in new tab
                window.open(videoUrl, '_blank');
            }
        } catch (error) {
            console.error('Failed to navigate to video:', error);
        }
    }

    function focusVideoElement(videoIndex) {
        const videos = document.querySelectorAll("video");
        if (videos[videoIndex]) {
            videos[videoIndex].scrollIntoView({ 
                behavior: "smooth", 
                block: "center",
                inline: "center"
            });
            videos[videoIndex].focus();
        }
    }

    // Auto-detect videos when page loads completely
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                window.videoExtensionVideos = detectVideos();
            }, 1000);
        });
    } else {
        setTimeout(() => {
            window.videoExtensionVideos = detectVideos();
        }, 1000);
    }
})();