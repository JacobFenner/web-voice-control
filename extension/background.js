// background.js
console.log("Background service worker initializing...");

let recognitionWindow = null;

importScripts('command-patterns.js');
importScripts('tab-utils.js');
importScripts('ai-service.js');

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
            const aiResult = await processWithAI(result.command, tabsInfo);
            console.log("AI processed result:", aiResult);

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
                    const currentTab = await chrome.tabs.query({active: true, currentWindow: true});
                    if (currentTab[0]) {
                        chrome.tabs.remove(currentTab[0].id);
                    }
                    break;

                case 'scroll':
                    const activeTab = await chrome.tabs.query({active: true, currentWindow: true});
                    if (activeTab[0]) {
                        let code = '';
                        switch (aiResult.target) {
                            case 'up':
                                code = 'window.scrollBy(0, -300);';
                                break;
                            case 'down':
                                code = 'window.scrollBy(0, 300);';
                                break;
                            case 'top':
                                code = 'window.scrollTo(0, 0);';
                                break;
                            case 'bottom':
                                code = 'window.scrollTo(0, document.body.scrollHeight);';
                                break;
                        }
                        if (code) {
                            chrome.scripting.executeScript({
                                target: {tabId: activeTab[0].id},
                                code: code
                            });
                        }
                    }
                    break;

                case 'click':
                    const tab = await chrome.tabs.query({active: true, currentWindow: true});
                    if (tab[0]) {
                        chrome.tabs.sendMessage(tab[0].id, {
                            type: 'performClick',
                            target: aiResult.target,
                            details: aiResult.details
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error("Error processing with AI:", error);
        }
    }
}

async function executeMatchedCommand(result) {
    switch (result.category) {
        case 'system':
            if (result.action === 'stop') {
                closeRecognitionWindow();
            }
            break;

        case 'navigation':
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
            }
            break;

        case 'scrolling':
            const activeTab = await chrome.tabs.query({active: true, currentWindow: true});
            if (activeTab[0]) {
                let code = '';
                switch (result.action) {
                    case 'up':
                        code = 'window.scrollBy(0, -300);';
                        break;
                    case 'down':
                        code = 'window.scrollBy(0, 300);';
                        break;
                    case 'top':
                        code = 'window.scrollTo(0, 0);';
                        break;
                    case 'bottom':
                        code = 'window.scrollTo(0, document.body.scrollHeight);';
                        break;
                }
                if (code) {
                    chrome.scripting.executeScript({
                        target: {tabId: activeTab[0].id},
                        code: code
                    });
                }
            }
            break;

        case 'clicking':
            const tab = await chrome.tabs.query({active: true, currentWindow: true});
            if (tab[0]) {
                chrome.tabs.sendMessage(tab[0].id, {
                    type: 'performClick',
                    action: result.action,
                    params: result.params
                });
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
