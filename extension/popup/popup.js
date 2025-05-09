const port = chrome.runtime.connect({name: "popup"});

document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('status');
    const commandList = document.getElementById('commandList');

    // Get command patterns and display them
    import('../command-patterns.js').then(module => {
        const { commandPatterns } = module;
        displayCommands(commandPatterns);
    }).catch(error => {
        console.error('Error loading command patterns:', error);
    });

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
                    "click": "Clicks at current eye position"
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

        const html = Object.entries(commandsByCategory)
            .map(([category, info]) => `
                <div class="command-category">${info.title}</div>
                <ul class="command-list">
                    ${Object.entries(info.examples)
                .map(([command, description]) =>
                    `<li>"${command}" - ${description}</li>`)
                .join('')}
                </ul>
            `).join('');

        commandList.innerHTML = html;
    }

    // Existing event listeners
    chrome.storage.local.get(['isActive'], function(result) {
        status.textContent = result.isActive ? 'Active' : 'Inactive';
        status.className = 'status ' + (result.isActive ? 'active' : 'inactive');
    });

    startBtn.addEventListener('click', function() {
        console.log('Starting...');
        chrome.runtime.sendMessage({type: "action", action: "start"}, function(response) {
            console.log('Response received:', response);
        });
        status.textContent = 'Active';
        status.className = 'status active';
        chrome.storage.local.set({isActive: true});
    });

    stopBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({type: "action", action: "stop"});
        status.textContent = 'Inactive';
        status.className = 'status inactive';
        chrome.storage.local.set({isActive: false});
    });
});