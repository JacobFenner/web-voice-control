// background.js
console.log("Background service worker initializing...");

let recognitionWindow = null;

importScripts('command-patterns.js');
importScripts('tab-utils.js');
importScripts('ai-service.js');

function ensureContentScriptInjected(tabId, forceReinjection = false) {
    console.log(`Ensuring content script in tab ${tabId} (force: ${forceReinjection})`);

    return new Promise((resolve) => {
        try {
            // First check if we can inject scripts at all (avoiding restricted pages)
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => true
            })
                .then(() => {
                    // If forcing reinjection, skip the check
                    if (forceReinjection) {
                        injectScript();
                        return;
                    }

                    // Try pinging the content script with a timeout
                    const pingTimeout = setTimeout(() => {
                        console.log("Ping timed out, injecting script");
                        injectScript();
                    }, 1000);

                    chrome.tabs.sendMessage(tabId, { action: "ping" }, response => {
                        clearTimeout(pingTimeout);

                        if (chrome.runtime.lastError) {
                            console.log("Content script not found:", chrome.runtime.lastError.message);
                            injectScript();
                        } else if (response && response.status === "ok") {
                            console.log("Content script already present");
                            resolve(true);
                        } else {
                            console.log("Invalid ping response, injecting script");
                            injectScript();
                        }
                    });
                })
                .catch(error => {
                    console.error("Cannot inject scripts on this page:", error);
                    resolve(false);
                });

            function injectScript() {
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ["content/content.js"]
                })
                    .then(() => {
                        console.log("Content script injected");

                        // Give the script time to initialize
                        setTimeout(() => {
                            resolve(true);
                        }, 500);
                    })
                    .catch(error => {
                        console.error("Failed to inject content script:", error);
                        resolve(false);
                    });
            }
        } catch (error) {
            console.error("Error in content script injection:", error);
            resolve(false);
        }
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received in background:", request);

    if (request.type === "action") {
        if (request.action === "start") {
            console.log("Start action received");
            openRecognitionWindow();
        }
        else if (request.action === "stop") {
            console.log("Stop action received");
            if (recognitionWindow) {
                chrome.windows.remove(recognitionWindow.id, () => {
                    console.log("Recognition window closed");
                    recognitionWindow = null;
                });
            }
        }
    }
    else if (request.type === "voiceCommand") {
        const result = processCommand(request.command)
        console.log("Command processed:", result);
        executeCommand(result);
    }

    return true;
});

chrome.windows.onRemoved.addListener((windowId) => {
    if (recognitionWindow && recognitionWindow.id === windowId) {
        console.log("Recognition window was closed");
        recognitionWindow = null;
    }
});


async function openRecognitionWindow() {
    console.log("Opening recognition window");

    try {
        const url = chrome.runtime.getURL('recognition.html');
        console.log("Creating window with URL:", url);

        recognitionWindow = await chrome.windows.create({
            url: url,
            type: 'popup',
            width: 400,
            height: 300,
            focused: false
        });

        console.log("Recognition window created:", recognitionWindow.id);

        await chrome.windows.update(recognitionWindow.id, {
            state: 'minimized'
        });
    } catch (error) {
        console.error("Error creating recognition window:", error);
    }
}

function closeRecognitionWindow() {
    if (recognitionWindow) {
        chrome.windows.remove(recognitionWindow.id, () => {
            console.log("Recognition window closed");
            recognitionWindow = null;
            chrome.storage.local.set({isActive: false});
        });
    }
}


async function executeCommand(result) {
    console.log("Executing command:", result);

    if (result.matched) {
        await executeMatchedCommand(result);
    } else if (result.useAI) {
        const tabs = await chrome.tabs.query({currentWindow: true});
        const tabsInfo = tabs.map((tab, index) => ({
            index: index + 1,
            title: tab.title,
            url: tab.url
        }));

        try {
            // Get active tab for potential page element interactions
            const activeTab = await chrome.tabs.query({active: true, currentWindow: true});
            if (!activeTab || !activeTab[0]) {
                console.error("No active tab found");
                return { success: false, error: "No active tab found" };
            }

            // Get page elements first if the command appears to be an element interaction
            let pageElements = null;
            if (result.command.match(/click|press|tap|select|choose|type|enter|input|write|fill/i)) {
                // Ensure content script is injected
                await ensureContentScriptInjected(activeTab[0].id);

                try {
                    pageElements = await new Promise((resolve, reject) => {
                        chrome.tabs.sendMessage(activeTab[0].id, { action: "getPageElements" }, response => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                resolve(response);
                            }
                        });
                    });
                    console.log(`Extracted ${pageElements?.elements?.length || 0} elements from page`);
                } catch (error) {
                    console.log("Could not extract page elements:", error);
                    // Continue anyway - the AI can still handle other commands
                }
            }

            // Process the command with AI (using page elements if available)
            const aiResult = await processWithAI(result.command, tabsInfo, pageElements);
            console.log("AI processed result:", aiResult);

            // Handle the AI response based on the action
            switch (aiResult.action) {
                case 'switch_tab':
                    const targetTab = findTargetTab(tabs, aiResult.target);
                    if (targetTab) {
                        console.log("Switching to tab:", targetTab.title);
                        chrome.tabs.update(targetTab.id, {active: true});
                    } else {
                        console.log("Tab not found:", aiResult.target);
                    }
                    break;

                case 'new_tab':
                    chrome.tabs.create({});
                    break;

                case 'close_tab':
                    if (activeTab[0]) {
                        chrome.tabs.remove(activeTab[0].id);
                    }
                    break;

                case 'go_back':
                    const backTab = await chrome.tabs.query({active: true, currentWindow: true});
                    if (backTab[0]) {
                        console.log("AI command: Navigate back in tab history");
                        chrome.tabs.goBack(backTab[0].id);
                    }
                    break;

                case 'go_forward':
                    const forwardTab = await chrome.tabs.query({active: true, currentWindow: true});
                    if (forwardTab[0]) {
                        console.log("AI command: Navigate forward in tab history");
                        chrome.tabs.goForward(forwardTab[0].id);
                    }
                    break;

                case 'scroll':
                    if (activeTab[0]) {
                        console.log("Scrolling tab:", activeTab[0].id);
                        chrome.tabs.sendMessage(
                            activeTab[0].id,
                            {
                                action: aiResult.target === "top" || aiResult.target === "bottom"
                                    ? "processCommand"
                                    : "scroll",
                                command: aiResult.target === "top"
                                    ? "scroll_top"
                                    : aiResult.target === "bottom"
                                        ? "scroll_bottom"
                                        : undefined,
                                direction: aiResult.target?.includes("up") ? "up" : "down"
                            },
                            (response) => {
                                if (chrome.runtime.lastError) {
                                    console.error("Error:", chrome.runtime.lastError);
                                } else {
                                    console.log("Message sent successfully", response);
                                }
                            }
                        );
                    }
                    break;
                case 'advanced_scroll':
                    const scrollTab = await chrome.tabs.query({active: true, currentWindow: true});
                    if (scrollTab[0]) {
                        await ensureContentScriptInjected(scrollTab[0].id);

                        const scrollDetails = {
                            action: "advancedScroll",
                            scrollType: aiResult.details?.scrollType || "toPercent",
                        };

                        // Add appropriate parameters based on the scroll type
                        if (scrollDetails.scrollType === "toPercent") {
                            // Handle percentage scrolling (to middle, 25%, etc.)
                            let percent = 0;

                            // Parse the target into a percentage if possible
                            if (aiResult.target === "middle" || aiResult.target === "halfway") {
                                percent = 50;
                            } else if (aiResult.details?.percent) {
                                percent = aiResult.details.percent;
                            } else if (typeof aiResult.target === 'string' && aiResult.target.includes('%')) {
                                percent = parseInt(aiResult.target);
                            }

                            scrollDetails.percent = percent;
                        } else if (scrollDetails.scrollType === "byPages") {
                            // Handle page-based scrolling
                            let pages = 1; // Default to 1 page

                            if (aiResult.details?.pages) {
                                pages = aiResult.details.pages;
                            } else if (!isNaN(parseFloat(aiResult.target))) {
                                pages = parseFloat(aiResult.target);
                            }

                            // Handle direction (negative for up)
                            if (aiResult.details?.direction === "up" ||
                                (typeof aiResult.target === 'string' && aiResult.target.includes('up'))) {
                                pages = -Math.abs(pages);
                            }

                            scrollDetails.pages = pages;
                        }

                        // Send the scroll command to the content script
                        chrome.tabs.sendMessage(scrollTab[0].id, scrollDetails, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error("Error sending scroll command:", chrome.runtime.lastError);
                            } else {
                                console.log("Scroll command executed:", response);
                            }
                        });
                    }
                    break;

                case 'click':
                case 'input':
                case 'select':
                    // Handle element interactions
                    if (activeTab[0] && aiResult.target) {
                        console.log(`Performing ${aiResult.action} on element:`, aiResult.target);

                        chrome.tabs.sendMessage(activeTab[0].id, {
                            action: "interactWithElement",
                            selector: aiResult.target,
                            interactionType: aiResult.action,
                            value: aiResult.value || null
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error("Error:", chrome.runtime.lastError);
                            } else {
                                console.log("Element interaction result:", response);
                            }
                        });
                    }
                    break;

                case 'element_interaction':
                    // Generic element interaction handling
                    if (activeTab[0] && aiResult.target) {
                        console.log("Element interaction:", aiResult);

                        const interactionType = aiResult.details?.type || "click";

                        chrome.tabs.sendMessage(activeTab[0].id, {
                            action: "interactWithElement",
                            selector: aiResult.target,
                            interactionType: interactionType,
                            value: aiResult.details?.value || null
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error("Error:", chrome.runtime.lastError);
                            } else {
                                console.log("Element interaction result:", response);
                            }
                        });
                    }
                    break;

                default:
                    console.log("Unknown action or no action specified:", aiResult.action);
                    break;
            }

        } catch (error) {
            console.error("Error processing with AI:", error);
        }
    }
}

async function executeMatchedCommand(result) {
    const { command, category, action, params, useAI } = result;
    console.log({result})

    if (category === 'system') {
        if (result.action === 'stop') {
            closeRecognitionWindow();
            return;
        }
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log("Tabs:", tabs);
    if (!tabs || tabs.length === 0) {
        console.error("No active tab found");
        return { success: false, error: "No active tab found" };
    }

    const activeTab = tabs[0];
    console.log("Active tab:", activeTab);

    // Make sure the content script is injected
    console.log("Performing Content script injection");
    await ensureContentScriptInjected(activeTab.id);
    console.log("Content script injected");

    switch (category) {
        case 'navigation':
            console.log('navigation')
            const currentTab = await chrome.tabs.query({active: true, currentWindow: true});
            switch (result.action) {
                case 'newTab':
                    chrome.tabs.create({});
                    break;
                case 'closeTab':
                    if (currentTab[0]) {
                        chrome.tabs.remove(currentTab[0].id);
                    }
                    break;
                case 'switchTab':
                    let tabIndex = result.params[2];
                    if (tabIndex) {
                        const tabs = await chrome.tabs.query({currentWindow: true});
                        const targetIndex = parseInt(tabIndex) - 1;
                        if (tabs[targetIndex]) {
                            chrome.tabs.update(tabs[targetIndex].id, {active: true});
                        }
                    }
                    break;
                case 'goBack':
                    if (currentTab[0]) {
                        console.log("Navigating back in tab history");
                        chrome.tabs.goBack(currentTab[0].id);
                    }
                    break;

                case 'goForward':
                    if (currentTab[0]) {
                        console.log("Navigating forward in tab history");
                        chrome.tabs.goForward(currentTab[0].id);
                    }
                    break;
            }
            break;

        case 'scrolling':
            console.log('scrolling on ', activeTab)
            if (!tabs || tabs.length === 0 || !activeTab) {
                console.error("No active tab found");
                return { success: false, error: "No active tab found" };
            }
            if (activeTab) {
                let code = '';
                switch (action) {
                    case 'up':
                        chrome.tabs.sendMessage(activeTab.id, { action: "scroll", direction: "up" });
                        return { success: true };

                    case 'down':
                        chrome.tabs.sendMessage(activeTab.id, { action: "scroll", direction: "down" });
                        return { success: true };

                    case 'top':
                        chrome.tabs.sendMessage(activeTab.id, { action: "processCommand", command: "scroll_top" });
                        return { success: true };

                    case 'bottom':
                        chrome.tabs.sendMessage(activeTab.id, { action: "processCommand", command: "scroll_bottom" });
                        return { success: true };
                }
                return { success: true };
            }
            break;

        case 'clicking':
            console.log('clicking');
            const tab = await chrome.tabs.query({active: true, currentWindow: true});

            if (!tab || tab.length === 0 || !tab[0].url || !tab[0].url.startsWith('http')) {
                console.error("Cannot click on invalid tab or non-http page");
                return;
            }

            console.log('Processing click on tab:', tab[0].url);

            try {
                // Make sure content script is properly injected
                const isInjected = await ensureContentScriptInjected(tab[0].id);
                if (!isInjected) {
                    console.error("Could not inject content script");
                    return;
                }

                // Try simple click first with a safe timeout
                let simpleClickResult = false;
                try {
                    simpleClickResult = await Promise.race([
                        new Promise((resolve) => {
                            chrome.tabs.sendMessage(tab[0].id, {
                                action: 'interactWithElement',
                                selector: result.params.join(' '),
                                interactionType: 'click'
                            }, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.warn("Error in simple click:", chrome.runtime.lastError.message);
                                    resolve(false);
                                } else if (response && response.success === true) {
                                    console.log("Simple click succeeded:", response);
                                    resolve(true);
                                } else {
                                    console.log("Simple click failed:", response);
                                    resolve(false);
                                }
                            });
                        }),
                        new Promise(resolve => setTimeout(() => {
                            console.log("Simple click timed out");
                            resolve(false);
                        }, 2000))
                    ]);
                } catch (error) {
                    console.error("Error during simple click attempt:", error);
                    simpleClickResult = false;
                }

                // If simple click worked, we're done
                if (simpleClickResult) {
                    return;
                }

                console.log("Simple click failed, trying AI-assisted approach");

                // Get page elements with proper error handling
                let pageElements = null;
                try {
                    pageElements = await Promise.race([
                        new Promise((resolve, reject) => {
                            chrome.tabs.sendMessage(tab[0].id, { action: "getPageElements" }, response => {
                                if (chrome.runtime.lastError) {
                                    console.warn("Error getting page elements:", chrome.runtime.lastError.message);
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else if (!response || !response.elements) {
                                    reject(new Error("Invalid response format"));
                                } else {
                                    resolve(response);
                                }
                            });
                        }),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error("Timeout getting page elements")), 3000)
                        )
                    ]);
                } catch (error) {
                    console.log("Failed to get page elements, trying again with fresh injection:", error);

                    // Try again with forced re-injection
                    await ensureContentScriptInjected(tab[0].id, true);

                    try {
                        pageElements = await Promise.race([
                            new Promise((resolve, reject) => {
                                chrome.tabs.sendMessage(tab[0].id, { action: "getPageElements" }, response => {
                                    if (chrome.runtime.lastError) {
                                        reject(new Error(chrome.runtime.lastError.message));
                                    } else if (!response || !response.elements) {
                                        reject(new Error("Invalid response format"));
                                    } else {
                                        resolve(response);
                                    }
                                });
                            }),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error("Second timeout")), 3000)
                            )
                        ]);
                    } catch (secondError) {
                        console.error("Failed to get page elements after retry:", secondError);
                        return; // Give up
                    }
                }

                if (!pageElements || !pageElements.elements || pageElements.elements.length === 0) {
                    console.error("No usable page elements found");
                    return;
                }

                // Filter to visible elements
                const visibleElements = pageElements.elements.filter(element =>
                    element.isInViewport === true &&
                    (element.text || element.ariaLabel || element.placeholder || element.id)
                );

                if (visibleElements.length === 0) {
                    console.log("No visible elements found");
                    return;
                }

                // Extract keywords from command
                const commandLower = result.params.join(' ').toLowerCase();
                const keywords = commandLower
                    .replace(/click|tap|press|on|the/gi, '')
                    .trim()
                    .split(/\s+/)
                    .filter(word => word.length > 2);

                console.log("Looking for keywords:", keywords);

                // Filter by relevance if we have keywords
                let filteredElements = visibleElements;
                if (keywords.length > 0) {
                    const relevantElements = visibleElements.filter(element => {
                        const elementText = [
                            element.text,
                            element.ariaLabel,
                            element.placeholder,
                            element.id
                        ].filter(Boolean).join(' ').toLowerCase();

                        return keywords.some(keyword => elementText.includes(keyword));
                    });

                    if (relevantElements.length > 0) {
                        filteredElements = relevantElements;
                        console.log(`Found ${relevantElements.length} elements matching keywords`);
                    }
                }

                // Limit elements to reduce token count
                pageElements.elements = filteredElements.slice(0, 10);

                // Get tab info for AI context
                const allTabs = await chrome.tabs.query({currentWindow: true});
                const tabsInfo = allTabs.map((tab, index) => ({
                    index: index + 1,
                    title: tab.title,
                    url: tab.url
                }));

                // Process with AI
                try {
                    const fullCommand = `click ${result.params.join(' ')}`;
                    console.log("Sending to AI:", fullCommand);

                    const aiResult = await processWithAI(fullCommand, tabsInfo, pageElements);
                    console.log("AI result:", aiResult);

                    if (aiResult && aiResult.target) {
                        // Make a safe final attempt with the AI result
                        try {
                            await Promise.race([
                                new Promise((resolve) => {
                                    chrome.tabs.sendMessage(tab[0].id, {
                                        action: "interactWithElement",
                                        selector: aiResult.target,
                                        interactionType: "click"
                                    }, (aiResponse) => {
                                        if (chrome.runtime.lastError) {
                                            console.warn("AI click runtime error:", chrome.runtime.lastError.message);
                                        } else {
                                            console.log("AI click result:", aiResponse);
                                        }
                                        resolve();
                                    });
                                }),
                                new Promise(resolve => setTimeout(resolve, 2000))
                            ]);
                        } catch (clickError) {
                            console.error("Error during AI click attempt:", clickError);
                        }
                    } else {
                        console.log("AI couldn't find a suitable element");
                    }
                } catch (aiError) {
                    console.error("Error during AI processing:", aiError);
                }
            } catch (error) {
                console.error("Error in clicking implementation:", error);
            }
            break;

        case 'input':
            const inputTab = await chrome.tabs.query({active: true, currentWindow: true});
            if (inputTab[0]) {
                chrome.tabs.sendMessage(inputTab[0].id, {
                    type: 'performInput',
                    action: result.action,
                    params: result.params
                });
            }
            break;
    }
}
