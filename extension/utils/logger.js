// utils/logger.js - Simple version that works in both modules and service workers
export function log(component, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}][${component}]`;

    if (data) {
        console.log(prefix, message, data);
    } else {
        console.log(prefix, message);
    }

    // Try to send to background script (except when we are the background)
    if (component !== 'background') {
        try {
            chrome.runtime.sendMessage({
                type: 'log',
                component,
                message,
                data,
                timestamp
            }).catch(() => {});
        } catch (e) {
            // Ignore errors from sending messages
        }
    }
}

export function logError(component, message, error) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}][${component}][ERROR]`;

    console.error(prefix, message, error);

    // Send to background script (except when we are the background)
    if (component !== 'background') {
        try {
            chrome.runtime.sendMessage({
                type: 'error',
                component,
                message,
                error: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : null,
                timestamp
            }).catch(() => {});
        } catch (e) {
            // Ignore errors from sending messages
        }
    }
}