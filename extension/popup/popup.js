// popup.js - Remove importScripts and use standard module imports
// This should be a module because popup.html has <script type="module">

document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('status');
    const commandList = document.getElementById('commandList');

    // Initialize UI based on storage
    initializeUI();

    // Load and display command examples
    loadCommandExamples();

    // Set up event listeners
    setupEventListeners();

    /**
     * Initialize the UI based on stored state
     */
    function initializeUI() {
        chrome.storage.local.get(['isActive'], function(result) {
            const isActive = result.isActive === true;
            updateStatusDisplay(isActive);
        });
    }

    /**
     * Updates the status display
     */
    function updateStatusDisplay(isActive) {
        status.textContent = isActive ? 'Active' : 'Inactive';
        status.className = 'status ' + (isActive ? 'active' : 'inactive');

        // Update button states
        startBtn.disabled = isActive;
        stopBtn.disabled = !isActive;
    }

    /**
     * Load command examples from command patterns
     */
    function loadCommandExamples() {
        // Use dynamic import since we're in a module
        import('../commands/command-patterns.js')
            .then(module => {
                displayCommands(module.commandPatterns);
            })
            .catch(error => {
                console.error('Error loading command patterns:', error);
                commandList.innerHTML = '<p class="error">Failed to load commands</p>';
            });
    }

    /**
     * Display formatted commands in the UI
     */
    function displayCommands(patterns) {
        const commandsByCategory = {
            navigation: {
                title: "Navigation",
                examples: {
                    "new tab": "Opens a new tab",
                    "close tab": "Closes current tab",
                    "switch to tab 2": "Switches to specific tab",
                    "go back": "Navigate to the previous page",
                    "go forward": "Navigate to the next page",
                    "open youtube.com": "Open a website in the current tab"
                }
            },
            scrolling: {
                title: "Scrolling",
                examples: {
                    "scroll up": "Scrolls page up",
                    "scroll down": "Scrolls page down",
                    "top": "Scrolls to page top",
                    "bottom": "Scrolls to page bottom"
                }
            },
            clicking: {
                title: "Clicking",
                examples: {
                    "click": "Clicks at current mouse position",
                    "click login button": "Finds and clicks the login button"
                }
            },
            system: {
                title: "System Controls",
                examples: {
                    "stop listening": "Stops voice recognition",
                    "quit": "Stops voice recognition"
                }
            }
        };

        commandList.innerHTML = Object.entries(commandsByCategory)
            .map(([category, info]) => `
                <div class="command-category">${info.title}</div>
                <ul class="command-list">
                    ${Object.entries(info.examples)
                .map(([command, description]) =>
                    `<li><span class="command">"${command}"</span> - ${description}</li>`)
                .join('')}
                </ul>
            `).join('');
    }

    /**
     * Set up event listeners for buttons
     */
    function setupEventListeners() {
        startBtn.addEventListener('click', function() {
            console.log('Starting voice recognition');

            chrome.runtime.sendMessage({type: "action", action: "start"}, function(response) {
                console.log('Start response received:', response);

                // Check if we got a response at all
                if (chrome.runtime.lastError) {
                    console.error('Error sending message:', chrome.runtime.lastError);
                    status.textContent = 'Error: Service worker inactive';
                    status.className = 'status error';
                    return;
                }

                if (response && response.success) {
                    updateStatusDisplay(true);
                    chrome.storage.local.set({isActive: true});
                } else {
                    // Handle error
                    const errorMessage = response ? response.error : 'Unknown error';
                    console.error('Error starting recognition:', errorMessage);
                    status.textContent = 'Error: ' + errorMessage;
                    status.className = 'status error';
                }
            });
        });

        stopBtn.addEventListener('click', function() {
            console.log('Stopping voice recognition');

            chrome.runtime.sendMessage({type: "action", action: "stop"}, function(response) {
                console.log('Stop response received:', response);

                if (chrome.runtime.lastError) {
                    console.error('Error sending message:', chrome.runtime.lastError);
                    return;
                }

                updateStatusDisplay(false);
                chrome.storage.local.set({isActive: false});
            });
        });

        // Listen for status updates from background
        chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
            if (request.type === 'statusUpdate') {
                updateStatusDisplay(request.isActive);
            }
        });
    }
});