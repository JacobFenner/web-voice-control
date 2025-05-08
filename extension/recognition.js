log("Recognition script loaded");
let recognition = null;
let isActive = false;
const statusElement = document.getElementById('status');

function log(message, data = null) {
    chrome.runtime.sendMessage({
        type: 'log',
        message,
        data
    });
}

function startRecognition() {
    if (!recognition) {
        setupSpeechRecognition();
    }

    isActive = true;
    try {
        recognition.start();
        log("Recognition started");
    } catch (error) {
        log("Error starting recognition:", error);
        // If recognition is already started, just continue
        if (error.name !== 'InvalidStateError') {
            updateStatus("Error starting recognition", true);
        }
    }
}

function stopRecognition() {
    log("Stopping recognition");
    if (recognition) {
        recognition.stop();
        isActive = false;
        updateStatus("Recognition stopped");
    }
}

function updateStatus(message, isError = false) {
    log(message);
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = isError ? 'inactive' : 'active';
    }
}

async function requestMicrophonePermission() {
    log("Requesting microphone permission");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        log("Microphone permission granted");
        updateStatus("Microphone access granted");
        stream.getTracks().forEach(track => track.stop()); // Stop the stream as we don't need it
        return true;
    } catch (error) {
        console.error("Microphone permission denied:", error);
        updateStatus("Microphone access denied - Please grant permission", true);
        return false;
    }
}

function setupSpeechRecognition() {
    log("Setting up speech recognition");
    if (recognition) {
        log("Recognition already exists");
        return;
    }

    try {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.onstart = function() {
            isActive = true;
            updateStatus("Listening for commands...");
        };

        recognition.onend = function() {
            log("Recognition ended");
            if (isActive) {
                // Restart after a short delay to prevent rapid restarts
                setTimeout(() => {
                    if (isActive) {
                        try {
                            recognition.start();
                        } catch (error) {
                            if (error.name !== 'InvalidStateError') {
                                log("Error restarting recognition:", error);
                            }
                        }
                    }
                }, 100);
            }
        };

        recognition.onerror = function(event) {
            console.error("Recognition error:", event.error);
            updateStatus(`Error: ${event.error}`, true);
        };

        recognition.onresult = function(event) {
            if (!isActive) return;

            const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
            log('Voice command received:', transcript);
            updateStatus(`Command received: ${transcript}`);

            // Send to background script for processing
            chrome.runtime.sendMessage({
                type: 'voiceCommand',
                command: transcript
            });
        };



    } catch (error) {
        console.error("Error setting up recognition:", error);
        updateStatus("Error setting up recognition", true);
    }
}

// Start recognition when the page loads
document.addEventListener('DOMContentLoaded', async function() {
    log("Recognition page loaded");
    updateStatus("Requesting microphone permission...");

    const hasPermission = await requestMicrophonePermission();
    if (hasPermission) {
        setupSpeechRecognition();
        startRecognition();

        try {
            recognition.start();
            log("Recognition started automatically");
        } catch (error) {
            console.error("Error starting recognition:", error);
            updateStatus("Error starting recognition", true);
        }
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'stopRecognition') {
        stopRecognition();
    } else if (request.type === 'startRecognition') {
        startRecognition();
    }
});
