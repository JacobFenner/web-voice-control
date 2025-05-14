// background/background.js

// Import dependencies
import * as aiService from '../ai/ai-service.js';
import { log, logError } from '../utils/logger.js';
import { commandPatterns, processCommand } from '../commands/command-patterns.js';
import { findTargetTab } from '../utils/tab-utils.js';

// Global state
let recognitionWindowId = null;
let isActive = false;

// Log initialization of service worker
log('background', 'Background service worker initialized');

// When the extension is installed or updated
chrome.runtime.onInstalled.addListener((details) => {
    log('background', 'Extension installed or updated:', details.reason);

    // Initialize storage with default values
    chrome.storage.local.set({
        isActive: false,
        lastCommand: null
    });
});

// Listen for messages from other parts of the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('background', 'Received message:', request, 'from:', sender);

    try {
        // Handle different message types
        if (request.type === 'log') {
            // Just log the message, no response needed
            console.log(`[${request.component || 'unknown'}]`, request.message, request.data || '');
        }
        else if (request.type === 'error') {
            console.error(`[${request.component || 'unknown'}]`, request.message, request.error || '');
        }
        else if (request.type === 'action') {
            handleActionRequest(request, sendResponse);
            return true; // Keep the message channel open for async response
        }
        else if (request.type === 'voiceCommand') {
            handleVoiceCommand(request.command, request.confidence || 0.5, sendResponse);
            return true; // Keep the message channel open for async response
        }
        // Add other message types as needed
    } catch (error) {
        logError('background', 'Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }

    return true; // Keep the message channel open
});

// Track window closures to detect when the recognition window is closed
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === recognitionWindowId) {
        log('background', 'Recognition window was closed');
        recognitionWindowId = null;
        isActive = false;
        chrome.storage.local.set({ isActive: false });
    }
});

async function ensureContentScriptLoaded(tabId) {
    log('background', `Ensuring content script is loaded in tab ${tabId}`);

    // First, try to ping the content script
    try {
        await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, { action: 'ping' }, response => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                if (response && response.status === 'ok') {
                    resolve(true);
                } else {
                    reject(new Error('Invalid response from content script'));
                }
            });
        });

        // Content script responded, all good
        log('background', 'Content script is already loaded');
        return true;
    } catch (error) {
        // Content script didn't respond, need to inject it
        log('background', 'Content script not detected, injecting...');

        try {
            // Inject CSS first
            await chrome.scripting.insertCSS({
                target: { tabId },
                files: ['content/content.css']
            });

            // Then inject JS
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/content.js']
            });

            log('background', 'Content script injected successfully');

            // Give it a moment to initialize
            await new Promise(resolve => setTimeout(resolve, 300));
            return true;
        } catch (injectError) {
            logError('background', 'Failed to inject content script:', injectError);
            return false;
        }
    }
}

// Handle action requests (start/stop)
async function handleActionRequest(request, sendResponse) {
    log('background', 'Handling action request:', request);

    switch (request.action) {
        case 'start':
            try {
                await startRecognition();
                sendResponse({ success: true, action: 'start' });
            } catch (error) {
                logError('background', 'Error starting recognition:', error);
                sendResponse({ success: false, error: error.message });
            }
            break;

        case 'stop':
            try {
                await stopRecognition();
                sendResponse({ success: true, action: 'stop' });
            } catch (error) {
                logError('background', 'Error stopping recognition:', error);
                sendResponse({ success: false, error: error.message });
            }
            break;

        default:
            console.warn('Unknown action:', request.action);
            sendResponse({ success: false, error: 'Unknown action' });
    }
}

// Start the voice recognition
async function startRecognition() {
    log('background', 'Starting recognition');

    try {
        // If we already have a recognition window, focus it
        if (recognitionWindowId) {
            try {
                chrome.windows.update(recognitionWindowId, { focused: true });
                isActive = true;
                chrome.storage.local.set({ isActive: true });
                return;
            } catch (e) {
                // Window doesn't exist anymore
                recognitionWindowId = null;
            }
        }

        // Create recognition in its own window
        const recognitionUrl = chrome.runtime.getURL('recognition/recognition.html');
        log('background', 'Creating recognition window with URL:', recognitionUrl);

        // Create a popup window directly
        const window = await chrome.windows.create({
            url: recognitionUrl,
            type: 'popup',
            width: 400,
            height: 500,
            left: 20,
            top: 20,
            focused: true // Focus for initial setup (for microphone permission)
        });

        // Store the window ID
        recognitionWindowId = window.id;

        log('background', 'Created recognition window:', recognitionWindowId);

        isActive = true;
        chrome.storage.local.set({ isActive: true });
    } catch (error) {
        logError('background', 'Error starting recognition:', error);
        isActive = false;
        chrome.storage.local.set({ isActive: false });
        throw error;
    }
}

// Stop the voice recognition
async function stopRecognition() {
    log('background', 'Stopping recognition');

    try {
        isActive = false;
        chrome.storage.local.set({ isActive: false });

        if (recognitionWindowId) {
            try {
                await chrome.windows.remove(recognitionWindowId);
                log('background', 'Recognition window closed');
            } catch (e) {
                // Window might already be closed
                logError('background', 'Error closing recognition window:', e);
            }
            recognitionWindowId = null;
        }
    } catch (error) {
        logError('background', 'Error stopping recognition:', error);
        throw error;
    }
}

// Handle a voice command
async function handleVoiceCommand(command, confidence, sendResponse) {
    log('background', 'Received voice command:', command, 'with confidence:', confidence);

    if (!isActive) {
        log('background', 'Recognition is not active, ignoring command');
        if (sendResponse) sendResponse({ success: false, error: 'Recognition is not active' });
        return;
    }

    // Save the last command
    chrome.storage.local.set({ lastCommand: command });

    // Acknowledge receipt of the command
    if (sendResponse) sendResponse({ success: true, action: 'commandReceived' });

    // Process the command
    try {
        // Check if the command matches any patterns
        const result = processCommand(command);
        log('background', 'Command processing result:', result);

        // For "navigateToUrl" action, handle it with AI
        if (result.matched && result.action === 'navigateToUrl') {
            log('background', 'URL navigation command detected, passing to AI');
            await processWithAI(command, result);
            return;
        }

        if (result.matched) {
            // If the command pattern explicitly says to use AI
            if (result.useAI) {
                log('background', 'Command matched pattern but needs AI for specific execution');
                await processWithAI(command, result);
            } else {
                // Standard execution for exact matches
                await executeCommand(result);
            }
        } else {
            // No direct pattern match - try AI processing to interpret the command
            log('background', 'No exact pattern match, using AI to interpret command');
            await processWithAI(command);
        }
    } catch (error) {
        logError('background', 'Error processing command:', error);
        // Fall back to simple processing if all else fails
        await processSimpleCommand(command);
    }
}

async function processWithAI(command, matchResult = null) {
    log('background', 'Processing command with AI:', command);

    try {
        // Get active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            log('background', 'No active tab found for AI processing');
            return;
        }

        const activeTab = tabs[0];

        // Get all tabs info for the AI service
        const allTabs = await chrome.tabs.query({});
        const tabsInfo = allTabs.map((tab, index) => ({
            index: index + 1,
            title: tab.title,
            url: tab.url
        }));

        // Try to get page elements for context
        let pageElements = null;
        try {
            pageElements = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(activeTab.id, { action: 'getPageElements' }, response => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(response);
                });
            });
        } catch (error) {
            logError('background', 'Error getting page elements:', error);
            // Try to inject content script if it's not available
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    files: ['content/content.js']
                });

                // Try once more after injection
                pageElements = await new Promise((resolve, reject) => {
                    setTimeout(() => {
                        chrome.tabs.sendMessage(activeTab.id, { action: 'getPageElements' }, response => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                                return;
                            }
                            resolve(response);
                        });
                    }, 500); // Give it a moment to initialize
                });
            } catch (injectError) {
                logError('background', 'Failed to inject content script:', injectError);
                // Continue without page context
            }
        }

        console.log(pageElements);
        // Process with AI using the function from ai-service.js
        const aiResult = await aiService.processWithAI(command, tabsInfo, pageElements);

        if (aiResult && aiResult.action) {
            log('background', 'AI processing suggested action:', aiResult);

            // Map AI result to the expected format for executeAIAction
            const mappedResult = mapAIResultToAction(aiResult);

            // Execute the action
            await executeAIAction(activeTab.id, mappedResult);
        } else {
            log('background', 'AI processing did not suggest a specific action');

            // If we have no AI action but have a match result, try executing that
            if (matchResult && matchResult.category && matchResult.action) {
                log('background', 'Falling back to matched pattern execution');
                await executeCommand(matchResult);
            } else {
                // Last resort - try simple command processing
                await processSimpleCommand(command);
            }
        }
    } catch (error) {
        logError('background', 'Error in AI processing:', error);

        // If AI processing fails but we have a match result, execute that
        if (matchResult && matchResult.category && matchResult.action) {
            await executeCommand(matchResult);
        } else {
            // Fall back to simple command as last resort
            await processSimpleCommand(command);
        }
    }
}

function mapAIResultToAction(aiResult) {
    // Create a mapped result object for executeAIAction
    const mappedResult = {
        action: null,
        selector: null,
        direction: null,
        value: null,
        navigationAction: null,
        scrollType: null,
        percent: null,
        pages: null,
        commandMatch: null
    };

    // Map based on the action from AI service
    switch (aiResult.action) {
        case 'click':
            mappedResult.action = 'click';

            // Handle different selector formats
            if (aiResult.target) {
                if (typeof aiResult.target === 'string') {
                    let targetSelector = aiResult.target;

                    // If it's already an ID selector, use it directly
                    if (targetSelector.startsWith('#')) {
                        mappedResult.selector = targetSelector;
                    }
                    // Handle [text='value'] format - use it directly
                    else if (targetSelector.startsWith('[text=')) {
                        mappedResult.selector = targetSelector;
                    }
                    // Handle text= format from Playwright - convert to :has-text()
                    else if (targetSelector.startsWith('text=')) {
                        const text = targetSelector.substring(5).trim();
                        mappedResult.selector = `button:has-text('${text}')`;
                    }
                    // Handle plain text - assume it's a text to search for
                    else if (!targetSelector.includes(':') && !targetSelector.startsWith('[') && !targetSelector.startsWith('//')) {
                        mappedResult.selector = `[text='${targetSelector}']`;
                    }
                    // If it's already a CSS or XPath selector, use it directly
                    else {
                        mappedResult.selector = targetSelector;
                    }
                } else {
                    // For complex targets, prefer id if available
                    if (aiResult.target.id) {
                        mappedResult.selector = `#${aiResult.target.id}`;
                    } else {
                        // Otherwise use other available selectors
                        mappedResult.selector = aiResult.target.selector ||
                            aiResult.target.xpath ||
                            `[text='${aiResult.target.text || aiResult.target}']`;
                    }
                }
            } else {
                mappedResult.selector = 'currentPosition';
            }

            mappedResult.selector = fixMalformedSelectors(mappedResult.selector);
            break;
        case 'input':
            mappedResult.action = 'input';
            mappedResult.selector = aiResult.target || '[text="' + aiResult.target + '"]';
            mappedResult.value = aiResult.value || '';
            break;

        case 'scroll':
            mappedResult.action = 'scroll';
            mappedResult.direction = aiResult.target || 'down';
            break;

        case 'advanced_scroll':
            mappedResult.action = 'advancedScroll';
            if (aiResult.details) {
                mappedResult.scrollType = aiResult.details.scrollType || 'byPages';
                mappedResult.percent = aiResult.details.percent || 0;
                mappedResult.pages = aiResult.details.pages || 1;
            }
            break;

        case 'go_back':
            mappedResult.action = 'navigation';
            mappedResult.navigationAction = 'back';
            break;

        case 'go_forward':
            mappedResult.action = 'navigation';
            mappedResult.navigationAction = 'forward';
            break;

        case 'new_tab':
            mappedResult.action = 'navigation';
            mappedResult.navigationAction = 'newTab';
            break;

        case 'close_tab':
            mappedResult.action = 'navigation';
            mappedResult.navigationAction = 'closeTab';
            break;

        case 'switch_tab':
            mappedResult.action = 'navigation';
            mappedResult.navigationAction = 'switchTab';

            // Ensure the target is properly passed through
            if (aiResult.target !== undefined && aiResult.target !== null) {
                // If it's a number (tab index), keep it as is
                if (typeof aiResult.target === 'number' || !isNaN(parseInt(aiResult.target))) {
                    mappedResult.target = parseInt(aiResult.target);
                }
                // If it's a string (tab title search), keep it as a string
                else {
                    mappedResult.target = aiResult.target;
                }
            } else {
                console.warn('No target specified for switch_tab action');
                mappedResult.target = null;
            }

            break;

        default:
            // For unknown actions, pass through the original result
            Object.assign(mappedResult, aiResult);
    }

    return mappedResult;
}

function fixMalformedSelectors(selector) {
    if (!selector) return selector;

    // Fix issues with mixed quote types in has-text
    if (selector.includes(':has-text(')) {
        // Extract the parts
        const match = selector.match(/(.+):has-text\((.+)\)/);
        if (match) {
            // Get the tag and text content
            const [_, tag, textPart] = match;

            // Clean up the text part - remove any mismatched quotes
            let cleanText = textPart.trim();

            // Remove any outer quotes
            if ((cleanText.startsWith("'") && cleanText.endsWith("'")) ||
                (cleanText.startsWith('"') && cleanText.endsWith('"'))) {
                cleanText = cleanText.substring(1, cleanText.length - 1);
            } else if (cleanText.startsWith("'") || cleanText.endsWith("'") ||
                cleanText.startsWith('"') || cleanText.endsWith('"')) {
                // Remove any partial quotes
                cleanText = cleanText.replace(/['"]/g, '');
            }

            // Rebuild with consistent quotes
            return `${tag}:has-text('${cleanText}')`;
        }
    }

    // Fix issues with [text=value] format
    if (selector.includes("[text=")) {
        // Extract the text value
        const match = selector.match(/\[text=['"]?([^'"\]]+)['"]?\]/);
        if (match) {
            const textValue = match[1];
            // Rebuild with consistent format
            return `[text='${textValue}']`;
        }
    }

    // If no fixes needed, return original
    return selector;
}

async function executeAIAction(tabId, aiResult) {
    log('background', 'Executing AI action:', aiResult);

    try {
        console.log("AI action:", aiResult.action);
        switch (aiResult.action) {
            case 'click':
                const message = {
                    action: 'interactWithElement',
                    selector: aiResult.selector,
                    interactionType: 'click'
                };

                console.log("Sending message to content script:", message);

                // Proper promise handling for chrome.tabs.sendMessage
                return new Promise((resolve) => {
                    chrome.tabs.sendMessage(tabId, message, response => {
                        console.log("message sent to content script: ", response);
                        if (chrome.runtime.lastError) {
                            console.error("Error sending message:", chrome.runtime.lastError);
                            resolve({ success: false, error: chrome.runtime.lastError.message });
                        } else {
                            resolve(response || { success: true });
                        }
                    });
                });
                break;

            case 'input':
                await sendMessageToContentScript(tabId, {
                    action: 'interactWithElement',
                    selector: aiResult.selector,
                    interactionType: 'input',
                    value: aiResult.value || ''
                });
                break;

            case 'navigate_to_url':
                log('background', 'Navigating to URL:', aiResult.target);

                try {
                    // Ensure URL has a protocol
                    let url;
                    let inNewTab = false;

                    // Format 1: URL in target field
                    if (aiResult.target) {
                        url = aiResult.target;
                    }
                    // Format 2: URL in details.url field
                    else if (aiResult.details && aiResult.details.url) {
                        url = aiResult.details.url;
                        inNewTab = aiResult.details.newTab === true;
                    }
                    else {
                        throw new Error('No URL provided for navigation');
                    }

                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        url = 'https://' + url;
                    }

                    log('background', `Navigating to ${url} ${inNewTab ? 'in new tab' : 'in current tab'}`);

                    if (inNewTab) {
                        // Open URL in new tab
                        const newTab = await chrome.tabs.create({ url: url });
                        return { success: true, action: 'navigated', url, tabId: newTab.id };
                    } else {
                        // Navigate current tab
                        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        await chrome.tabs.update(currentTab.id, { url: url });
                        return { success: true, action: 'navigated', url };
                    }
                } catch (error) {
                    logError('background', 'Error navigating to URL:', error);
                    return { success: false, error: error.message };
                }
                break;

            case 'scroll':
                await sendMessageToContentScript(tabId, {
                    action: 'scroll',
                    direction: aiResult.direction || 'down'
                });
                break;

            case 'advancedScroll':
                let direction = 1; // default down

                // First try to get direction from AI response details
                if (aiResult.details && aiResult.details.direction) {
                    direction = aiResult.details.direction === 'up' ? -1 : 1;
                    console.log('direction: ', direction)
                }
                // Then check direct aiResult properties
                else if (aiResult.direction) {
                    direction = aiResult.direction === 'up' ? -1 : 1;
                    console.log('direction: ', direction)
                }

                await sendMessageToContentScript(tabId, {
                    action: 'advancedScroll',
                    scrollType: aiResult.scrollType || 'byPages',
                    percent: aiResult.percent || 0,
                    pages: aiResult.pages || 1,
                    direction: direction
                });
                break;

            // Map to standard commands
            case 'navigation':
                if (aiResult.navigationAction === 'back') {
                    chrome.tabs.goBack(tabId);
                } else if (aiResult.navigationAction === 'forward') {
                    chrome.tabs.goForward(tabId);
                } else if (aiResult.navigationAction === 'newTab') {
                    chrome.tabs.create({});
                } else if (aiResult.navigationAction === 'closeTab') {
                    chrome.tabs.remove(tabId);
                } else if (aiResult.navigationAction === 'switchTab') {
                    try {
                        // Get all tabs
                        const tabs = await chrome.tabs.query({});
                        console.log('Available tabs:', tabs.map(t => `${t.index+1}: ${t.title}`));

                        // Use tab-utils to find the target tab
                        const targetTab = findTargetTab(tabs, aiResult.target);

                        if (targetTab) {
                            console.log('Switching to tab:', targetTab.title);

                            // Update the tab to make it active
                            await chrome.tabs.update(targetTab.id, { active: true });

                            // Make sure the window containing the tab is also focused
                            await chrome.windows.update(targetTab.windowId, { focused: true });

                            return { success: true, action: 'switch_tab', target: aiResult.target };
                        } else {
                            console.error('Tab not found for target:', aiResult.target);
                            return { success: false, error: `Tab not found for: ${aiResult.target}` };
                        }
                    } catch (error) {
                        console.error('Error during tab switching:', error);
                        return { success: false, error: error.message };
                    }
                }
                break;

            case 'executeCommand':
                // Direct execution of a matched command
                if (aiResult.commandMatch && aiResult.commandMatch.category && aiResult.commandMatch.action) {
                    await executeCommand(aiResult.commandMatch);
                }
                break;

            default:
                log('background', 'Unknown AI action type:', aiResult.action);
        }
    } catch (error) {
        logError('background', 'Error executing AI action:', error);
    }
}

async function checkForAISupport() {
    try {
        const module = await import('../commands/command-patterns.js');
        return typeof module.processCommand === 'function';
    } catch (error) {
        logError('background', 'Error checking for AI support:', error);
        return false;
    }
}

// Execute a matched command
async function executeCommand(commandResult) {
    const { category, action, params } = commandResult;

    log('background', 'Executing command:', category, action, params);

    switch (category) {
        case 'scrolling':
            await executeScrollCommand(action);
            break;

        case 'clicking':
            await executeClickCommand(action, params);
            break;

        case 'navigation':
            await executeNavigationCommand(action, params);
            break;

        case 'system':
            if (action === 'stop') {
                await stopRecognition();
            }
            break;
    }
}

// Execute scrolling commands
async function executeScrollCommand(action) {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            log('background', 'No active tab found');
            return;
        }

        const activeTab = tabs[0];

        // Ensure content script is loaded before sending command
        const contentScriptReady = await ensureContentScriptLoaded(activeTab.id);
        if (!contentScriptReady) {
            logError('background', 'Could not ensure content script is loaded');
            return;
        }

        // Now send the command
        let message;
        switch (action) {
            case 'up':
                message = { action: 'scroll', direction: 'up' };
                break;

            case 'down':
                message = { action: 'scroll', direction: 'down' };
                break;

            case 'top':
                message = { action: 'advancedScroll', scrollType: 'toPercent', percent: 0 };
                break;

            case 'bottom':
                message = { action: 'advancedScroll', scrollType: 'toPercent', percent: 100 };
                break;

            default:
                return;
        }

        chrome.tabs.sendMessage(activeTab.id, message, response => {
            if (chrome.runtime.lastError) {
                logError('background', 'Error sending scroll command:', chrome.runtime.lastError);
            } else {
                log('background', 'Scroll command executed successfully');
            }
        });
    } catch (error) {
        logError('background', 'Error executing scroll command:', error);
    }
}

// Execute click commands
async function executeClickCommand(action, params) {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            log('background', 'No active tab found');
            return;
        }

        const activeTab = tabs[0];

        // Ensure content script is loaded before sending command
        const contentScriptReady = await ensureContentScriptLoaded(activeTab.id);
        if (!contentScriptReady) {
            logError('background', 'Could not ensure content script is loaded');
            return;
        }

        // Now send the command
        let message;
        switch (action) {
            case 'simpleClick':
                message = {
                    action: 'interactWithElement',
                    selector: 'currentPosition',
                    interactionType: 'click'
                };
                break;

            case 'elementClick':
                if (params && params.length > 0) {
                    const targetText = params[0];
                    message = {
                        action: 'interactWithElement',
                        selector: `[text="${targetText}"]`,
                        interactionType: 'click'
                    };
                }
                break;

            default:
                return;
        }

        if (message) {
            chrome.tabs.sendMessage(activeTab.id, message, response => {
                if (chrome.runtime.lastError) {
                    logError('background', 'Error sending click command:', chrome.runtime.lastError);
                } else {
                    log('background', 'Click command executed successfully');
                }
            });
        }
    } catch (error) {
        logError('background', 'Error executing click command:', error);
    }
}

// Execute navigation commands
async function executeNavigationCommand(action, params) {
    switch (action) {
        case 'newTab':
            await chrome.tabs.create({});
            break;

        case 'closeTab':
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                await chrome.tabs.remove(tabs[0].id);
            }
            break;

        case 'switchTab':
            if (params && params.length > 0) {
                let tabIndex = -1;

                // Handle numeric or textual tab indices
                if (/^\d+$/.test(params[0])) {
                    tabIndex = parseInt(params[0]) - 1; // Convert to 0-based index
                } else {
                    switch (params[0].toLowerCase()) {
                        case 'first': tabIndex = 0; break;
                        case 'second': tabIndex = 1; break;
                        case 'third': tabIndex = 2; break;
                        case 'fourth': tabIndex = 3; break;
                        case 'fifth': tabIndex = 4; break;
                        case 'last': tabIndex = -1; break;
                    }
                }

                const allTabs = await chrome.tabs.query({ currentWindow: true });

                if (tabIndex === -1) {
                    // Last tab
                    tabIndex = allTabs.length - 1;
                }

                if (tabIndex >= 0 && tabIndex < allTabs.length) {
                    await chrome.tabs.update(allTabs[tabIndex].id, { active: true });
                }
            }
            break;

        case 'goBack':
            chrome.tabs.goBack();
            break;

        case 'goForward':
            chrome.tabs.goForward();
            break;
    }
}

// Simple command processor for backward compatibility
async function processSimpleCommand(command) {
    log('background', 'Processing command with simple processor:', command);

    const lowerCommand = command.toLowerCase();

    try {
        // Get the active tab first
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            log('background', 'No active tab found');
            return;
        }

        const activeTab = tabs[0];

        // Ensure content script is loaded
        const contentScriptReady = await ensureContentScriptLoaded(activeTab.id);
        if (!contentScriptReady) {
            logError('background', 'Could not ensure content script is loaded');
            return;
        }

        // Basic command processing
        if (lowerCommand.includes('scroll')) {
            const direction = lowerCommand.includes('up') ? 'up' : 'down';
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'scroll',
                direction: direction
            });
        }
        else if (lowerCommand.includes('click')) {
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'interactWithElement',
                selector: 'currentPosition',
                interactionType: 'click'
            });
        }
        else if (lowerCommand.includes('stop') || lowerCommand.includes('quit')) {
            // Stop the recognition
            await stopRecognition();
        }
    } catch (error) {
        logError('background', 'Error in processSimpleCommand:', error);
    }
}

function sendMessageToContentScript(tabId, message) {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabs.sendMessage(tabId, message, response => {
                if (chrome.runtime.lastError) {
                    console.log('Error sending message to content script 1: ', error)
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                console.log('message sent to content script: ', response)
                resolve(response);
            });
        } catch (error) {
            console.log('Error sending message to content script 2: ', error)
            reject(error);
        }
    });
}

async function injectContentScriptIfNeeded(tabId) {
    log('background', `Attempting to inject content script into tab ${tabId}`);

    try {
        // Check if we can ping the content script
        try {
            await sendMessageToContentScript(tabId, { action: 'ping' });
            log('background', 'Content script is already running in the tab');
            return; // Content script is already there
        } catch (error) {
            // Content script is not running, need to inject
        }

        // Inject CSS first
        await chrome.scripting.insertCSS({
            target: { tabId },
            files: ['content/content.css']
        });

        // Then inject the script
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content/content.js']
        });

        log('background', 'Content script injected successfully');

        // Allow a brief moment for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
        logError('background', 'Error injecting content script:', error);
        throw error;
    }
}

// Export functions for testing
export {
    startRecognition,
    stopRecognition,
    handleVoiceCommand
};