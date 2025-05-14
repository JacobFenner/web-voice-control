// recognition/recognition.js - Simplified version

import { log, logError } from '../utils/logger.js';

let recognition = null;
let isActive = false;
let retryCount = 0;
const MAX_RETRIES = 3;
let statusElement;

// Initialize DOM elements after the DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    log('recognition', 'Recognition page loaded');

    // Initialize UI elements
    statusElement = document.getElementById('status');

    // Set initial status
    updateStatus("Initializing...");

    // Request microphone permission
    updateStatus("Requesting microphone permission...");
    const hasPermission = await requestMicrophonePermission();

    if (hasPermission) {
        setupSpeechRecognition();
        startRecognition();
    }
});

/**
 * Starts speech recognition
 */
function startRecognition() {
    log('recognition', 'Starting speech recognition');

    if (!recognition) {
        setupSpeechRecognition();
    }

    isActive = true;
    try {
        recognition.start();
        updateStatus("Listening for commands...");
    } catch (error) {
        // If already running (InvalidStateError), ignore
        if (error.name !== 'InvalidStateError') {
            logError('recognition', 'Error starting recognition', error);
            updateStatus("Error starting recognition", true);
        }
    }
}

/**
 * Stops speech recognition
 */
function stopRecognition() {
    log('recognition', 'Stopping speech recognition');

    if (recognition) {
        recognition.stop();
        isActive = false;
        retryCount = 0;
        updateStatus("Recognition stopped");
    }
}

/**
 * Updates the status UI
 */
function updateStatus(message, isError = false) {
    log('recognition', message);

    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = isError ? 'inactive' : 'active';
    }
}

/**
 * Request microphone permission
 */
async function requestMicrophonePermission() {
    log('recognition', 'Requesting microphone permission');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        updateStatus("Microphone access granted");
        // Clean up the stream since we don't need it
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        logError('recognition', 'Microphone permission denied', error);
        updateStatus("Microphone access denied - Please grant permission", true);
        return false;
    }
}

/**
 * Sets up the speech recognition system
 */
function setupSpeechRecognition() {
    log('recognition', 'Setting up speech recognition');

    if (recognition) {
        log('recognition', 'Recognition already exists');
        return;
    }

    try {
        // Create recognition object with browser prefixes
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            throw new Error('Speech recognition not supported in this browser');
        }

        recognition = new SpeechRecognition();

        // Configure recognition
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US'; // Set language explicitly

        // Setup event handlers
        recognition.onstart = handleRecognitionStart;
        recognition.onend = handleRecognitionEnd;
        recognition.onerror = handleRecognitionError;
        recognition.onresult = handleRecognitionResult;

        log('recognition', 'Speech recognition set up successfully');
    } catch (error) {
        logError('recognition', 'Error setting up recognition', error);
        updateStatus("Error setting up recognition: " + error.message, true);
    }
}

/**
 * Handle recognition start event
 */
function handleRecognitionStart() {
    log('recognition', 'Recognition started');
    isActive = true;
    retryCount = 0;
    updateStatus("Listening for commands...");
}

/**
 * Handle recognition end event
 */
function handleRecognitionEnd() {
    log('recognition', 'Recognition ended');

    if (isActive) {
        // Try to restart, but with backoff if there are issues
        setTimeout(() => {
            if (isActive) {
                try {
                    recognition.start();
                    retryCount = 0;
                } catch (error) {
                    if (error.name !== 'InvalidStateError') {
                        retryCount++;
                        logError('recognition', `Error restarting recognition (attempt ${retryCount})`, error);

                        if (retryCount >= MAX_RETRIES) {
                            updateStatus("Failed to restart recognition", true);
                            isActive = false;
                        }
                    }
                }
            }
        }, 100 * Math.pow(2, retryCount)); // Exponential backoff
    }
}

/**
 * Handle recognition errors
 */
function handleRecognitionError(event) {
    logError('recognition', 'Recognition error', event.error);
    updateStatus(`Error: ${event.error}`, true);

    // Handle specific errors
    switch (event.error) {
        case 'no-speech':
            // This is normal, just waiting for speech
            updateStatus("No speech detected, still listening...");
            break;

        case 'aborted':
        case 'audio-capture':
        case 'network':
        case 'not-allowed':
            // More serious errors that might need user intervention
            retryCount++;
            break;
    }
}

/**
 * Process recognition results
 */
function handleRecognitionResult(event) {
    if (!isActive) return;

    const transcript = event.results[event.results.length - 1][0].transcript.trim();
    log('recognition', 'Voice command received:', transcript);

    const confidence = event.results[event.results.length - 1][0].confidence;
    updateStatus(`Command: "${transcript}" (${(confidence * 100).toFixed(1)}% confidence)`);

    // Send to background script for processing
    try {
        chrome.runtime.sendMessage({
            type: 'voiceCommand',
            command: transcript,
            confidence: confidence
        }, function(response) {
            if (chrome.runtime.lastError) {
                logError('recognition', 'Error sending command to background:', chrome.runtime.lastError);
                return;
            }
            log('recognition', 'Command sent to background, response:', response);
        });
    } catch (error) {
        logError('recognition', 'Error sending command to background:', error);
    }
}

// Notify when page is about to unload
window.addEventListener('beforeunload', () => {
    log('recognition', 'Recognition page unloading');
    if (recognition) {
        recognition.stop();
    }
});