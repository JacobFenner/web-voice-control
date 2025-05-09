let mousePosition = { x: 0, y: 0 };

// Update mouse position when the mouse moves
document.addEventListener('mousemove', function(e) {
    mousePosition.x = e.clientX;
    mousePosition.y = e.clientY;
});

// Initialize with center of viewport
document.addEventListener('DOMContentLoaded', function() {
    mousePosition = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    };
});

function processCommand(command, details) {
    console.log(command, details);
    switch (command) {
        case 'click':
            handleClick();
            break;
        case 'scroll_up':
            smartScroll(-300);
            break;
        case 'scroll_down':
            smartScroll(300);
            break;
        case 'scroll_top':
            smartScrollTo(0);
            break;
        case 'scroll_bottom':
            smartScrollToBottom();
            break;
        case 'scroll_to_percent':
            if (details && details.percent !== undefined) {
                smartScrollToPercent(details.percent);
            }
            break;
        case 'scroll_by_pages':
            if (details && details.pages !== undefined) {
                smartScrollByPages(details.pages);
            }
            break;
        case 'custom_scroll':
            if (details && details.amount) {
                smartScroll(details.amount);
            }
            break;
        // Add more commands as needed
    }
}

function handleClick() {
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("Received message from background script:", request);
    if (request.action === "ping") {
        console.log("Ping received, sending response");
        sendResponse({ status: "ok", from: "content_script" });
    } else if (request.action === "processCommand") {
        processCommand(request.command, request.details);
    } else if (request.action === "scroll") {
        processCommand(request.direction === "up" ? "scroll_up" : "scroll_down");
    } else if (request.action === "getPageElements") {
        const elements = extractInteractiveElements();
        sendResponse(elements);
    } else if (request.action === "interactWithElement") {
        const result = interactWithElement(
            request.selector,
            request.interactionType || 'click',
            request.value
        );
        sendResponse(result);
    } else if (request.action === "advancedScroll") {
        // Handle advanced scroll commands
        switch (request.scrollType)  {
            case "toPercent":
                smartScrollToPercent(request.percent);
                break;
            case "byPages":
                smartScrollByPages(request.pages);
                break;
            case "getInfo":
                sendResponse(getScrollInfo());
                return true;
        }
    } else if (request.type === "performClick") {
        console.log("Received performClick request:", request);

        // Extract the element description from params
        const elementDescription = request.params.join(' ');
        console.log("Looking for element:", elementDescription);

        // Use your interactWithElement function to find and click the element
        const result = interactWithElement(elementDescription, 'click');
        console.log("Click result:", result);

        // Send back the result
        sendResponse(result);
    }

    return true;
});

function smartScroll(amount) {
    const scrollableElement = findScrollableElementAtMousePosition();

    if (scrollableElement) {
        // If found a scrollable container, scroll it
        scrollableElement.scrollBy({
            top: amount,
            behavior: 'smooth'
        });
    } else {
        // Fall back to window scroll
        window.scrollBy({
            top: amount,
            behavior: 'smooth'
        });
    }
}

function smartScrollTo(position) {
    const scrollableElement = findScrollableElementAtMousePosition();

    if (scrollableElement) {
        scrollableElement.scrollTo({
            top: position,
            behavior: 'smooth'
        });
    } else {
        window.scrollTo({
            top: position,
            behavior: 'smooth'
        });
    }
}

function smartScrollToBottom() {
    const scrollableElement = findScrollableElementAtMousePosition();

    if (scrollableElement) {
        scrollableElement.scrollTo({
            top: scrollableElement.scrollHeight,
            behavior: 'smooth'
        });
    } else {
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
    }
}

function smartScrollToPercent(percent) {
    const scrollableElement = findScrollableElementAtMousePosition();

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

// Scroll by a number of "pages" (viewport heights)
function smartScrollByPages(pages) {
    const scrollableElement = findScrollableElementAtMousePosition();
    const viewportHeight = window.innerHeight;

    const scrollAmount = pages * viewportHeight;

    if (scrollableElement) {
        // Current position plus the desired scroll amount
        const currentPos = scrollableElement.scrollTop;
        scrollableElement.scrollTo({
            top: currentPos + scrollAmount,
            behavior: 'smooth'
        });
    } else {
        // Current position plus the desired scroll amount
        const currentPos = window.pageYOffset || document.documentElement.scrollTop;
        window.scrollTo({
            top: currentPos + scrollAmount,
            behavior: 'smooth'
        });
    }
}

function getScrollInfo() {
    const scrollableElement = findScrollableElementAtMousePosition();

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

function findScrollableElementAtMousePosition() {
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

function extractInteractiveElements() {
    console.log("Extracting interactive elements from page");

    try {
        const interactiveElements = [];

        // Get all potentially interactive elements
        const elements = document.querySelectorAll('button, a, input, textarea, select, [role="button"], [tabindex]');

        // Map each element to its properties
        Array.from(elements).forEach((element, index) => {
            // Skip hidden elements
            if (!isElementVisible(element)) return;

            // Extract key properties of the element
            const properties = {
                index,
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                text: element.textContent?.trim() || null,
                value: element.value || null,
                placeholder: element.getAttribute('placeholder') || null,
                ariaLabel: element.getAttribute('aria-label') || null,
                role: element.getAttribute('role') || null,
                type: element.getAttribute('type') || null,
                className: element.className || null,
                isInViewport: isElementInViewport(element),
                // Include only minimal position info to reduce size
                position: element.isInViewport ? {
                    top: element.getBoundingClientRect().top,
                    left: element.getBoundingClientRect().left
                } : null
            };

            interactiveElements.push(properties);
        });

        // Get overall page context
        const pageContext = {
            title: document.title,
            url: window.location.href
        };

        console.log(`Found ${interactiveElements.length} interactive elements`);

        return {
            elements: interactiveElements,
            pageContext
        };
    } catch (error) {
        console.error("Error extracting elements:", error);
        // Return an empty result rather than failing
        return { elements: [], pageContext: { title: document.title, url: location.href } };
    }
}

function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
        rect.width > 0 &&
        rect.height > 0 &&
        window.getComputedStyle(el).visibility !== 'hidden' &&
        window.getComputedStyle(el).display !== 'none'
    );
}

// Helper functions
function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
}

function getElementRect(element) {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
    };
}

function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
    );
}

function generateElementPath(element) {
    // Create a path like: body > div.container > form#login > button.submit
    let path = [];
    let current = element;

    while (current && current !== document.body) {
        let identifier = current.tagName.toLowerCase();
        if (current.id) {
            identifier += `#${current.id}`;
        } else if (current.className) {
            const classes = Array.from(current.classList).join('.');
            if (classes) {
                identifier += `.${classes}`;
            }
        }
        path.unshift(identifier);
        current = current.parentElement;
    }

    return path.join(' > ');
}

function getVisiblePageText() {
    // Get visible text content from the page, prioritizing headers and labels
    const textElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, label, button');
    return Array.from(textElements)
        .filter(el => isElementVisible(el))
        .map(el => el.textContent.trim())
        .filter(text => text.length > 0)
        .join('\n');
}

function interactWithElement(selector, action = 'click', value = null) {
    console.log(`Attempting to ${action} element: ${selector}`);

    let element;

    try {
        // Check if it's an attribute selector with specific text format like [text='value']
        if (selector.startsWith('[') && selector.includes('=')) {
            // Extract the attribute and value
            const match = selector.match(/\[([a-zA-Z]+)=['"]([^'"]+)['"]\]/);
            if (match) {
                const [_, attribute, targetValue] = match;
                console.log(`Looking for element with ${attribute}="${targetValue}"`);

                // Find all elements with matching text content
                if (attribute === 'text') {
                    const allElements = Array.from(document.querySelectorAll('button, a, input[type="submit"], [role="button"], div, span, p'));
                    element = allElements.find(el => {
                        const text = el.textContent?.trim() || '';
                        return text === targetValue;
                    });
                    console.log(`Text search result:`, element);
                } else {
                    // For other attributes, use regular attribute selector
                    element = document.querySelector(`[${attribute}="${targetValue}"]`);
                }
            }
        }

        // If not found with attribute format, try as a CSS selector
        if (!element) {
            try {
                element = document.querySelector(selector);
            } catch (error) {
                console.log("Not a valid CSS selector:", error);
            }
        }

        // If still not found, try as an element path
        if (!element) {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (generateElementPath(el) === selector) {
                    element = el;
                    break;
                }
            }
        }

        // If still not found, try looking for exact text content match
        if (!element) {
            // Remove quotes and brackets if present
            const cleanSelector = selector.replace(/^\[text=['"]|['"]]\s*$/g, '');
            console.log("Trying text search with:", cleanSelector);

            const allTextElements = Array.from(document.querySelectorAll('button, a, input[type="submit"], [role="button"], div, span, p'));
            element = allTextElements.find(el => {
                const text = el.textContent?.trim() || '';
                return text === cleanSelector ||
                    text.toLowerCase() === cleanSelector.toLowerCase();
            });
        }

        // Try with partial text match as a last resort
        if (!element) {
            const cleanSelector = selector.replace(/^\[text=['"]|['"]]\s*$/g, '');
            console.log("Trying partial text match with:", cleanSelector);

            const allTextElements = Array.from(document.querySelectorAll('button, a, input[type="submit"], [role="button"], div, span, p'));
            element = allTextElements.find(el => {
                const text = el.textContent?.trim() || '';
                return text.includes(cleanSelector) ||
                    text.toLowerCase().includes(cleanSelector.toLowerCase());
            });
        }

        if (!element) {
            console.error("Element not found using any method for selector:", selector);
            return { success: false, error: "Element not found" };
        }

        // Log what we found for debugging
        console.log("Found element:", {
            tag: element.tagName,
            id: element.id,
            class: element.className,
            text: element.textContent?.trim()
        });

        // Ensure the element is in view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Small delay to ensure the element is fully visible
        return new Promise(resolve => {
            setTimeout(() => {
                // Perform the requested action
                switch (action) {
                    case 'click':
                        // Try multiple click strategies
                        try {
                            // Native click
                            element.click();

                            // Dispatch mouse events for better compatibility
                            ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                                element.dispatchEvent(new MouseEvent(eventType, {
                                    bubbles: true,
                                    cancelable: true,
                                    view: window
                                }));
                            });

                            console.log("Click executed successfully");
                            resolve({ success: true, action: 'click' });
                        } catch (clickError) {
                            console.error("Error during click:", clickError);
                            resolve({ success: false, error: `Click error: ${clickError.message}` });
                        }
                        break;

                    case 'input':
                        if (element.tagName.toLowerCase() === 'input' ||
                            element.tagName.toLowerCase() === 'textarea') {
                            element.focus();
                            element.value = value || '';
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                            resolve({ success: true, action: 'input' });
                        } else {
                            resolve({ success: false, error: "Element is not an input field" });
                        }
                        break;

                    case 'select':
                        if (element.tagName.toLowerCase() === 'select') {
                            const option = Array.from(element.options)
                                .find(opt => opt.textContent === value || opt.value === value);

                            if (option) {
                                element.value = option.value;
                                element.dispatchEvent(new Event('change', { bubbles: true }));
                                resolve({ success: true, action: 'select' });
                            } else {
                                resolve({ success: false, error: "Option not found" });
                            }
                        } else {
                            resolve({ success: false, error: "Element is not a select dropdown" });
                        }
                        break;

                    default:
                        resolve({ success: false, error: "Unsupported action" });
                }
            }, 300); // Small delay to ensure scrolling is complete
        });
    } catch (error) {
        console.error("Error in interactWithElement:", error);
        return { success: false, error: error.message };
    }
}

