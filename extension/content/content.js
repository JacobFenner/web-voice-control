// Track mouse position
let mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const EXTENSION_ID_PREFIX = 'vc-target-';
let elementIdCounter = 0;
let elementsWithAssignedIds = new Set();

// Update mouse position when the mouse moves
document.addEventListener('mousemove', (e) => {
    mousePosition.x = e.clientX;
    mousePosition.y = e.clientY;
});

// Initialize with center of viewport
document.addEventListener('DOMContentLoaded', () => {
    mousePosition = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    };
    console.log('Content script loaded, mouse position initialized');

    setTimeout(assignIdsToInteractiveElements, 500);
});

window.addEventListener('load', () => {
    assignIdsToInteractiveElements();
});

const observer = new MutationObserver((mutations) => {
    // Check if significant changes were made to the DOM
    let shouldReassign = false;

    for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
                // Only reassign if actual elements were added (not text nodes)
                if (node.nodeType === Node.ELEMENT_NODE) {
                    shouldReassign = true;
                    break;
                }
            }
        }

        if (shouldReassign) break;
    }

    if (shouldReassign) {
        assignIdsToInteractiveElements();
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
});

// Log function for content script (can't import in content scripts by default)
function log(component, message, data = null) {
    const prefix = `[${component}]`;

    if (data) {
        console.log(prefix, message, data);
    } else {
        console.log(prefix, message);
    }

    // Try to send to background script
    try {
        chrome.runtime.sendMessage({
            type: 'log',
            component,
            message,
            data
        }).catch(() => {});
    } catch (e) {
        // Ignore errors from sending messages
    }
}

function assignIdsToInteractiveElements() {
    console.log("Assigning IDs to interactive elements");

    // Common interactive elements selectors
    const interactiveSelectors = [
        'button',
        'a',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="switch"]',
        '[role="combobox"]',
        '[role="option"]',
        '[aria-haspopup="true"]',
        '[contenteditable="true"]',
        // Add more as needed
    ];

    // Query all interactive elements
    const elements = document.querySelectorAll(interactiveSelectors.join(', '));
    console.log(`Found ${elements.length} potential interactive elements`);

    let assignedCount = 0;

    // Assign IDs to elements that don't have one
    elements.forEach(element => {
        // Skip elements that already have our assigned ID or are hidden/invisible
        if (elementsWithAssignedIds.has(element) || !isElementVisible(element)) {
            return;
        }

        // If element doesn't have an ID, assign one
        if (!element.id) {
            // Generate an ID based on text content or tag type
            let idBase = '';

            // Try to use text content first
            const textContent = element.textContent?.trim();
            if (textContent && textContent.length > 0 && textContent.length < 20) {
                // Create a valid ID from text content (alphanumeric and hyphens only)
                idBase = textContent
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '');
            }

            // If no usable text content, use tag name
            if (!idBase) {
                idBase = element.tagName.toLowerCase();
            }

            // Assign unique ID by appending counter
            const newId = `${EXTENSION_ID_PREFIX}${idBase}-${elementIdCounter++}`;
            element.id = newId;
            elementsWithAssignedIds.add(element);
            assignedCount++;
        }
        // If element already has an ID, just track it
        else {
            elementsWithAssignedIds.add(element);
        }
    });

    console.log(`Assigned ${assignedCount} new IDs to elements`);
    return assignedCount;
}

// Process incoming messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content received message:', request);

    try {
        switch (request.action) {
            case 'ping':
                sendResponse({ status: 'ok', from: 'content_script' });
                break;

            case 'getPageElements':
                const elements = extractInteractiveElements();
                sendResponse(elements);
                break;

            case 'interactWithElement':
                if (request.selector === 'currentPosition') {
                    // Click at current mouse position
                    const element = document.elementFromPoint(mousePosition.x, mousePosition.y);
                    if (element) {
                        clickElement(element)
                            .then(result => sendResponse(result))
                            .catch(error => sendResponse({ success: false, error: error.message }));
                    } else {
                        sendResponse({ success: false, error: 'No element at position' });
                    }
                } else {
                    // Convert findElement to return a Promise
                    findElementPromise(request.selector)
                        .then(element => {
                            if (!element) {
                                sendResponse({ success: false, error: 'Element not found' });
                                return null;
                            }

                            if (request.interactionType === 'click') {
                                return clickElement(element);
                            } else if (request.interactionType === 'input') {
                                return inputText(element, request.value);
                            } else if (request.interactionType === 'select') {
                                return selectOption(element, request.value);
                            } else {
                                return { success: false, error: 'Unknown interaction type' };
                            }
                        })
                        .then(result => {
                            if (result) sendResponse(result);
                        })
                        .catch(error => {
                            console.error("Error in element interaction:", error);
                            sendResponse({ success: false, error: error.message });
                        });
                }
                return true; // Keep the channel open for async response

            case 'scroll':
                handleScroll(request.direction === 'up' ? -300 : 300);
                sendResponse({ success: true });
                break;

            case 'advancedScroll':
                switch (request.scrollType) {
                    case 'toPercent':
                        scrollToPercent(request.percent);
                        break;

                    case 'byPages':
                        scrollByPages(request.pages, request.direction || 1);
                        break;

                    case 'getInfo':
                        sendResponse(getScrollInfo());
                        return true;
                }
                sendResponse({ success: true });
                break;

            default:
                console.log('Unknown action:', request.action);
                sendResponse({ success: false, error: 'Unknown action' });
        }
    } catch (error) {
        console.error('Error processing message:', error);
        sendResponse({ success: false, error: error.message });
    }

    return true; // Keep the message channel open
});

//================ SCROLL HANDLING FUNCTIONS ================//
function handleScroll(amount) {
    const scrollableElement = findScrollableElement();

    if (scrollableElement) {
        scrollableElement.scrollBy({
            top: amount,
            behavior: 'smooth'
        });
    } else {
        window.scrollBy({
            top: amount,
            behavior: 'smooth'
        });
    }
}

function scrollToPercent(percent) {
    const scrollableElement = findScrollableElement();

    if (scrollableElement) {
        const targetPosition = scrollableElement.scrollHeight * (percent / 100);
        scrollableElement.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
    } else {
        const targetPosition = document.body.scrollHeight * (percent / 100);
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
    }
}

function scrollByPages(pages, direction = 1) {
    const scrollableElement = findScrollableElement();
    const viewportHeight = window.innerHeight;
    const scrollAmount = pages * viewportHeight * direction;

    console.log(`Scrolling by ${pages} page(s), direction: ${direction > 0 ? 'down' : 'up'}`);

    if (scrollableElement) {
        const currentPos = scrollableElement.scrollTop;
        scrollableElement.scrollTo({
            top: currentPos + scrollAmount,
            behavior: 'smooth'
        });
    } else {
        const currentPos = window.pageYOffset || document.documentElement.scrollTop;
        window.scrollTo({
            top: currentPos + scrollAmount,
            behavior: 'smooth'
        });
    }
}

function getScrollInfo() {
    const scrollableElement = findScrollableElement();

    if (scrollableElement) {
        return {
            currentPosition: scrollableElement.scrollTop,
            maxScroll: scrollableElement.scrollHeight - scrollableElement.clientHeight,
            viewportHeight: scrollableElement.clientHeight,
            totalHeight: scrollableElement.scrollHeight,
            percentScrolled: (scrollableElement.scrollTop /
                (scrollableElement.scrollHeight - scrollableElement.clientHeight)) * 100
        };
    } else {
        const currentPosition = window.pageYOffset || document.documentElement.scrollTop;
        const totalHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
        );
        const viewportHeight = window.innerHeight;
        const maxScroll = totalHeight - viewportHeight;

        return {
            currentPosition,
            maxScroll,
            viewportHeight,
            totalHeight,
            percentScrolled: (currentPosition / maxScroll) * 100
        };
    }
}

function findScrollableElement() {
    // Get element at mouse position
    const element = document.elementFromPoint(mousePosition.x, mousePosition.y);
    if (!element) return null;

    // Walk up the DOM tree to find a scrollable container
    let current = element;
    while (current) {
        if (isScrollable(current)) {
            return current;
        }
        current = current.parentElement;
    }

    return null;
}

function isScrollable(element) {
    // Skip the body element as we want to use window.scrollBy for that
    if (element === document.body || element === document.documentElement) {
        return false;
    }

    const style = window.getComputedStyle(element);
    const overflowY = style.getPropertyValue('overflow-y');

    // Check if element has scrollable content
    const hasScrollableContent = element.scrollHeight > element.clientHeight;

    // Check if element has scroll-friendly CSS
    const hasScrollableCSS = ['auto', 'scroll'].includes(overflowY);

    return hasScrollableContent && hasScrollableCSS;
}

// Wrap findElement in a Promise
function findElementPromise(selector) {
    return new Promise((resolve) => {
        const element = findElement(selector);
        resolve(element);
    });
}

//================ SCROLL HANDLING FUNCTIONS ================//
// [Your existing scroll functions]

//================ ELEMENT INTERACTION FUNCTIONS ================//
function findElement(selector) {
    console.log("Finding element with selector:", selector);
    let element = null;

    if (selector.startsWith('#') && selector.substring(1).startsWith(EXTENSION_ID_PREFIX)) {
        const id = selector.substring(1);
        element = document.getElementById(id);
        if (element) {
            console.log(`Found element directly by ID: ${id}`);
            return element;
        }
    }

    let textToFind = null;
    if (selector.startsWith('[text=')) {
        const match = selector.match(/\[text=['"]([^'"]+)['"]\]/);
        if (match) {
            textToFind = match[1];
        }
    }

    // If we have text to find, try to find it among our IDs first
    if (textToFind) {
        // Look through all elements with our assigned IDs
        for (const element of elementsWithAssignedIds) {
            const elementText = element.textContent?.trim() || '';
            if (elementText === textToFind || elementText.toLowerCase() === textToFind.toLowerCase()) {
                console.log(`Found element by text match in assigned IDs: ${textToFind}`);
                return element;
            }
        }
    }

    // Special case for XPath selectors
    if (selector.startsWith('xpath=')) {
        try {
            // Extract the actual XPath expression
            const xpathExpression = selector.substring(6); // Remove 'xpath=' prefix
            console.log("Processing XPath:", xpathExpression);

            // Evaluate the XPath expression
            const result = document.evaluate(
                xpathExpression,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );

            element = result.singleNodeValue;

            // If we found an element, return it immediately
            if (element) {
                console.log("Found element using exact XPath");
                return element;
            }

            // If the original XPath contained text() and failed, try a more flexible approach
            if (xpathExpression.includes('text()=')) {
                // Extract the text content we're looking for
                const textMatch = xpathExpression.match(/text\(\)\s*=\s*['"]([^'"]+)['"]/);
                if (textMatch) {
                    const targetText = textMatch[1];
                    console.log("Trying flexible XPath search for text:", targetText);

                    // Get the element type (assuming format like //a[text()='Dashboard'])
                    const elementTypeMatch = xpathExpression.match(/\/\/([a-zA-Z0-9]+)(\[|$)/);
                    const elementType = elementTypeMatch ? elementTypeMatch[1] : '*';

                    // Try a more flexible XPath that uses contains()
                    const flexibleXPath = `//${elementType}[contains(text(), '${targetText}')]`;
                    console.log("Flexible XPath:", flexibleXPath);

                    const flexResult = document.evaluate(
                        flexibleXPath,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                    );

                    element = flexResult.singleNodeValue;

                    if (element) {
                        console.log("Found element using flexible XPath");
                        return element;
                    }

                    // If XPath still fails, fall back to a simpler text search
                    console.log("XPath failed, trying direct text search");
                    element = findElementByText(targetText);

                    if (element) {
                        console.log("Found element using text search");
                        return element;
                    }
                }
            }
        } catch (e) {
            console.error("XPath evaluation error:", e);
        }

        // If we reach here, we couldn't find the element via XPath
        // Try to extract text from XPath for fallback
        const xpathText = extractTextFromXPath(selector);
        if (xpathText) {
            console.log("Trying to find by extracted text:", xpathText);
            element = findElementByText(xpathText) || findElementByPartialText(xpathText);
            return element;
        }

        return null; // Return null if all XPath approaches failed
    }

    // Handle :has-text() selector (Playwright style)
    if (selector.includes(':has-text(')) {
        const match = selector.match(/([a-z0-9]+):has-text\(['"]([^'"]+)['"]\)/i);
        if (match) {
            const [_, tagName, text] = match;
            console.log(`Parsed :has-text selector: tag=${tagName}, text=${text}`);

            // Get all elements of the specified tag
            const elements = document.querySelectorAll(tagName);
            console.log(`Found ${elements.length} ${tagName} elements to search`);

            // Look for exact text match first
            element = Array.from(elements).find(el =>
                el.textContent.trim() === text ||
                el.textContent.trim().toLowerCase() === text.toLowerCase()
            );

            // If no exact match, try partial match
            if (!element) {
                element = Array.from(elements).find(el =>
                    el.textContent.trim().includes(text) ||
                    el.textContent.trim().toLowerCase().includes(text.toLowerCase())
                );
            }

            if (element) {
                console.log(`Found ${tagName} element with text: ${text}`);
                return element;
            }
        }
    }

    // Try standard CSS selector
    try {
        element = document.querySelector(selector);
        if (element) {
            console.log("Found element with standard CSS selector");
            return element;
        }
    } catch (e) {
        // Ignore error for invalid selectors
        console.log("Invalid CSS selector, trying other methods");
    }

    // Try attribute-based selector: [attributeName="value"]
    if (selector.startsWith('[') && selector.includes('=')) {
        const match = selector.match(/\[([a-zA-Z-]+)\s*=\s*['"]([^'"]+)['"]\]/);
        if (match) {
            const [_, attrName, attrValue] = match;

            if (attrName === 'text') {
                element = findElementByText(attrValue);
            } else {
                try {
                    const attrSelector = `[${attrName}="${attrValue}"]`;
                    element = document.querySelector(attrSelector);
                } catch (e) {
                    console.warn(`Invalid attribute selector: ${attrSelector}`);
                }
            }

            if (element) {
                console.log(`Found element by attribute ${attrName}="${attrValue}"`);
                return element;
            }
        }
    }

    // Last resort: Try to find element by text content
    // First, try to extract any text content from the selector
    const textContent = extractTextContent(selector);
    if (textContent) {
        console.log("Trying to find by extracted text content:", textContent);
        element = findElementByText(textContent) || findElementByPartialText(textContent);
    }

    console.log("Find element result:", element ? "Found" : "Not found");
    return element;
}

function extractTextFromXPath(xpathSelector) {
    // Look for text()='something' or contains(text(), 'something')
    const match1 = xpathSelector.match(/text\(\)\s*=\s*['"]([^'"]+)['"]/);
    const match2 = xpathSelector.match(/contains\s*\(\s*text\(\)\s*,\s*['"]([^'"]+)['"]\s*\)/);

    return match1 ? match1[1] : (match2 ? match2[1] : null);
}

// Helper function to extract text content from various selector formats
function extractTextContent(selector) {
    // Try to extract text from various selector formats
    let textContent = null;

    // Check for text='content' format
    const textMatch = selector.match(/text\s*=\s*['"]([^'"]+)['"]/);
    if (textMatch) return textMatch[1];

    // Check for :has-text('content') format
    const hasTextMatch = selector.match(/:has-text\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (hasTextMatch) return hasTextMatch[1];

    // Check for contains(text(), 'content') format
    const containsMatch = selector.match(/contains\s*\(\s*text\(\)\s*,\s*['"]([^'"]+)['"]\s*\)/);
    if (containsMatch) return containsMatch[1];

    // Plain text as a last resort - strip any obvious selector syntax
    return selector.replace(/^[a-z0-9]+:|[.#\[\]]/g, '').trim();
}

/**
 * Enhanced findElementByText with more flexible matching
 */
function findElementByText(text) {
    if (!text) return null;

    // Clean the text
    const cleanText = text.replace(/[.,;:!?]$/, '').trim();

    // Common interactive elements that might contain text
    const allTextElements = Array.from(document.querySelectorAll(
        'button, a, input[type="submit"], [role="button"], div, span, p, label, h1, h2, h3, h4, h5, h6'
    ));

    return allTextElements.find(el => {
        const elText = el.textContent?.trim() || '';
        const cleanElText = elText.replace(/[.,;:!?]$/, '').trim();

        return cleanElText === cleanText ||
            cleanElText.toLowerCase() === cleanText.toLowerCase();
    });
}

function findElementByPartialText(text) {
    if (!text) return null;

    // Clean the text
    const cleanText = text.replace(/[.,;:!?]$/, '').trim();

    // Common interactive elements that might contain text
    const allTextElements = Array.from(document.querySelectorAll(
        'button, a, input[type="submit"], [role="button"], div, span, p, label, h1, h2, h3, h4, h5, h6'
    ));

    return allTextElements.find(el => {
        const elText = el.textContent?.trim() || '';
        const cleanElText = elText.replace(/[.,;:!?]$/, '').trim();

        return cleanElText.includes(cleanText) ||
            cleanElText.toLowerCase().includes(cleanText.toLowerCase());
    });
}

async function clickElement(element) {
    if (!element) {
        return { success: false, error: 'Element is null' };
    }

    console.log('Clicking element:', element);

    // Ensure the element is in view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scrolling to complete
    return new Promise(resolve => {
        setTimeout(() => {
            try {
                // Try the native click (simpler approach)
                element.click();
                resolve({ success: true, action: 'click' });
            } catch (error) {
                console.warn('Native click failed, trying event dispatch:', error);

                try {
                    // Use a single click event to avoid double-clicking
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });

                    const success = element.dispatchEvent(clickEvent);
                    resolve({
                        success: success,
                        action: 'click',
                        method: 'event'
                    });
                } catch (eventError) {
                    resolve({
                        success: false,
                        error: eventError.message,
                        originalError: error.message
                    });
                }
            }
        }, 300); // Small delay to ensure scrolling is complete
    });
}

async function inputText(element, text) {
    if (!element) {
        return { success: false, error: 'Element is null' };
    }

    if (element.tagName.toLowerCase() !== 'input' &&
        element.tagName.toLowerCase() !== 'textarea') {
        return { success: false, error: 'Element is not an input field' };
    }

    // Ensure the element is in view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scrolling to complete
    return new Promise(resolve => {
        setTimeout(() => {
            try {
                element.focus();
                element.value = text || '';
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                resolve({ success: true, action: 'input' });
            } catch (error) {
                resolve({
                    success: false,
                    error: error.message
                });
            }
        }, 300);
    });
}

async function selectOption(element, value) {
    if (!element) {
        return { success: false, error: 'Element is null' };
    }

    if (element.tagName.toLowerCase() !== 'select') {
        return { success: false, error: 'Element is not a select dropdown' };
    }

    // Ensure the element is in view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scrolling to complete
    return new Promise(resolve => {
        setTimeout(() => {
            try {
                const option = Array.from(element.options)
                    .find(opt => opt.textContent === value || opt.value === value);

                if (option) {
                    element.value = option.value;
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    resolve({ success: true, action: 'select' });
                } else {
                    resolve({ success: false, error: 'Option not found' });
                }
            } catch (error) {
                resolve({
                    success: false,
                    error: error.message
                });
            }
        }, 300);
    });
}

function extractInteractiveElements() {
    // First, ensure IDs are assigned to elements
    assignIdsToInteractiveElements();

    const elements = [];
    const interactiveSelectors = [
        'button',
        'a',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="menuitem"]',
        // Add more as needed
    ];

    // Find all interactive elements
    const allElements = document.querySelectorAll(interactiveSelectors.join(', '));

    // Process each element
    allElements.forEach(element => {
        // Skip hidden or non-visible elements
        if (!isElementVisible(element)) {
            return;
        }

        // Extract useful information from the element
        const elementInfo = {
            tag: element.tagName.toLowerCase(),
            text: element.textContent?.trim() || '',
            id: element.id || '',
            className: element.className || '',
            type: element.type || '',
            name: element.name || '',
            value: element.tagName.toLowerCase() === 'input' ? element.value : '',
            placeholder: element.placeholder || '',
            ariaLabel: element.getAttribute('aria-label') || '',
            role: element.getAttribute('role') || '',
            isInteractive: true,
            isInViewport: isElementInViewport(element),
            boundingRect: element.getBoundingClientRect()
        };

        // Add to elements array
        elements.push(elementInfo);
    });

    // Return both elements and page context
    return {
        pageContext: {
            title: document.title,
            url: window.location.href
        },
        elements: elements
    };
}

function isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);

    // Check various properties that would make an element non-interactive
    return !(
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        style.pointerEvents === 'none' ||
        element.hasAttribute('hidden') ||
        element.hasAttribute('aria-hidden') && element.getAttribute('aria-hidden') === 'true' ||
        element.offsetParent === null // This checks if element is not rendered
    );
}

function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
        rect.width > 0 &&
        rect.height > 0
    );
}

console.log('Content script loaded');