document.addEventListener("DOMContentLoaded", () => {
    const videoList = document.getElementById("videoList");
    const status = document.getElementById("status");
    const searchInput = document.getElementById("searchInput");
    const clearBtn = document.getElementById("clearBtn");
    const stats = document.getElementById("stats");

    let allVideos = [];
    let currentResults = [];

    // Initialize the extension
    init();

    function init() {
        setupEventListeners();
        loadVideos();
    }

    function setupEventListeners() {
        // Search functionality
        searchInput.addEventListener("input", handleSearch);
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
            }
        });

        // Clear button
        clearBtn.addEventListener("click", clearSearch);

        // Show/hide clear button
        searchInput.addEventListener("input", () => {
            clearBtn.style.display = searchInput.value ? "block" : "none";
        });
    }

    function loadVideos() {
        status.textContent = "Fetching videos...";
        stats.textContent = "";

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];

            if (!activeTab) {
                showError("No active tab found.");
                return;
            }

            // Check if it's a YouTube page
            if (!activeTab.url.includes("youtube.com")) {
                showError("Please navigate to a YouTube page first.");
                return;
            }

            // Inject content script if needed
            chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                files: ["content.js"]
            }, () => {
                // Send message to content script
                chrome.tabs.sendMessage(activeTab.id, { action: "getVideos" }, (response) => {
                    if (chrome.runtime.lastError) {
                        showError("Failed to load content script. Please refresh the page and try again.");
                        return;
                    }

                    handleVideosResponse(response, activeTab);
                });
            });
        });
    }

    function handleVideosResponse(response, activeTab) {
        if (!response || response.error) {
            showError(response?.error || "Failed to fetch videos.");
            return;
        }

        allVideos = response.videos || [];
        
        if (allVideos.length === 0) {
            showNoVideos();
            return;
        }

        currentResults = [...allVideos];
        displayVideos(currentResults);
        updateStats(currentResults.length, allVideos.length);
        
        status.textContent = "";
        searchInput.focus();
    }

    function handleSearch() {
        const query = searchInput.value.trim().toLowerCase();
        
        if (!query) {
            currentResults = [...allVideos];
        } else {
            currentResults = allVideos.filter(video => 
                video.title.toLowerCase().includes(query)
            );
        }
        
        displayVideos(currentResults, query);
        updateStats(currentResults.length, allVideos.length, query);
    }

    function displayVideos(videos, searchQuery = "") {
        videoList.innerHTML = "";
        
        if (videos.length === 0) {
            showNoResults(searchQuery);
            return;
        }

        videos.forEach((video, index) => {
            const li = document.createElement("li");
            li.className = "video-item";

            const link = document.createElement("a");
            link.className = "video-link";
            link.href = video.url;
            link.target = "_blank";

            // Highlight search terms
            const title = highlightText(video.title, searchQuery);
            
            link.innerHTML = `
                <div class="video-title">${title}</div>
                <div class="video-meta">
                    <span>Video ${index + 1}</span>
                    <span class="video-type">${getVideoTypeLabel(video.type)}</span>
                </div>
            `;

            // Handle click for YouTube videos
            link.addEventListener("click", (e) => {
                if (video.type.includes("youtube")) {
                    e.preventDefault();
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        const activeTab = tabs[0];
                        chrome.tabs.sendMessage(activeTab.id, { 
                            action: "navigateToVideo", 
                            videoUrl: video.url 
                        });
                        window.close();
                    });
                }
            });

            li.appendChild(link);
            videoList.appendChild(li);
        });
    }

    function highlightText(text, query) {
        if (!query) return escapeHtml(text);
        
        const escapedText = escapeHtml(text);
        const escapedQuery = escapeHtml(query);
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        
        return escapedText.replace(regex, '<span class="highlight">$1</span>');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getVideoTypeLabel(type) {
        switch (type) {
            case "youtube-playlist": return "Playlist";
            case "youtube-home": return "YouTube";
            case "html5": return "Video";
            case "embedded": return "Embedded";
            default: return "Video";
        }
    }

    function updateStats(showing, total, query = "") {
        if (query) {
            stats.textContent = `Showing ${showing} of ${total} videos matching "${query}"`;
        } else {
            stats.textContent = `Found ${total} videos on this page`;
        }
    }

    function clearSearch() {
        searchInput.value = "";
        clearBtn.style.display = "none";
        handleSearch();
        searchInput.focus();
    }

    function showError(message) {
        status.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">⚠️</div>
                <div>${message}</div>
            </div>
        `;
        stats.textContent = "";
    }

    function showNoVideos() {
        status.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">📺</div>
                <div>No videos found on this page</div>
                <small>Try navigating to a YouTube playlist or video page</small>
            </div>
        `;
        stats.textContent = "";
    }

    function showNoResults(query) {
        videoList.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">🔍</div>
                <div>No videos found matching "${query}"</div>
                <small>Try a different search term</small>
            </div>
        `;
    }
});