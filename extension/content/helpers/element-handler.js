/**
 * Interacts with an element on the page using a selector or description
 * @param {string} selector - CSS selector, element path, or text description
 * @param {string} action - The action to perform (click, input, select)
 * @param {string|null} value - Value to use for input/select actions
 * @returns {Promise<Object>} - Result of the interaction
 */
function interactWithElement(selector, action = 'click', value = null) {
    console.log(`Attempting to ${action} element: ${selector}`);

    return new Promise(async (resolve) => {
        try {
            // Find the element using various strategies
            const element = await findElement(selector);

            if (!element) {
                console.error("Element not found using any method for selector:", selector);
                resolve({ success: false, error: "Element not found" });
                return;
            }

            // Log what we found
            console.log("Found element:", {
                tag: element.tagName,
                id: element.id,
                class: element.className,
                text: element.textContent?.trim()
            });

            // Ensure the element is in view
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Wait for scroll to complete
            setTimeout(() => {
                try {
                    switch (action) {
                        case 'click':
                            // Use a single click strategy to avoid double clicks
                            try {
                                // Try the native click first (simplest approach)
                                element.click();
                                resolve({ success: true, action: 'click' });
                            } catch (err) {
                                console.warn("Native click failed, trying event dispatch");

                                // Fallback to event dispatch approach
                                const mouseEvent = new MouseEvent('click', {
                                    bubbles: true,
                                    cancelable: true,
                                    view: window
                                });
                                const clickSuccess = element.dispatchEvent(mouseEvent);

                                resolve({
                                    success: clickSuccess,
                                    action: 'click',
                                    method: 'event'
                                });
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
                } catch (error) {
                    console.error(`Error performing ${action}:`, error);
                    resolve({
                        success: false,
                        error: error.message,
                        action: action
                    });
                }
            }, 300);
        } catch (error) {
            console.error("Error in interactWithElement:", error);
            resolve({ success: false, error: error.message });
        }
    });
}

/**
 * Finds an element using various strategies
 * @param {string} selector - CSS selector, element path, or text description
 * @returns {Element|null} - The found element or null
 */
function findElement(selector) {
    let element = null;

    // Strategy 1: [attribute='value'] format
    if (selector.startsWith('[') && selector.includes('=')) {
        const match = selector.match(/\[([a-zA-Z]+)=['"]([^'"]+)['"]\]/);
        if (match) {
            const [_, attribute, targetValue] = match;

            if (attribute === 'text') {
                element = findElementByText(targetValue);
            } else {
                try {
                    element = document.querySelector(`[${attribute}="${targetValue}"]`);
                } catch (e) {
                    console.warn(`Invalid attribute selector: [${attribute}="${targetValue}"]`);
                }
            }
        }
    }

    // Strategy 2: Standard CSS selector
    if (!element) {
        try {
            element = document.querySelector(selector);
        } catch (e) {
            console.warn("Not a valid CSS selector:", e);
        }
    }

    // Strategy 3: Element path
    if (!element) {
        element = findElementByPath(selector);
    }

    // Strategy 4: Plain text - exact match
    if (!element) {
        const plainText = selector.replace(/^\[text=['"]|['"]]\s*$/g, '');
        element = findElementByText(plainText);
    }

    // Strategy 5: Plain text - partial match
    if (!element) {
        const plainText = selector.replace(/^\[text=['"]|['"]]\s*$/g, '');
        element = findElementByPartialText(plainText);
    }

    return element;
}

/**
 * Finds an element by exact text match
 */
function findElementByText(text) {
    const allTextElements = Array.from(document.querySelectorAll(
        'button, a, input[type="submit"], [role="button"], div, span, p, label, h1, h2, h3, h4, h5, h6'
    ));

    return allTextElements.find(el => {
        const elText = el.textContent?.trim() || '';
        return elText === text || elText.toLowerCase() === text.toLowerCase();
    });
}

/**
 * Finds an element by partial text match
 */
function findElementByPartialText(text) {
    const allTextElements = Array.from(document.querySelectorAll(
        'button, a, input[type="submit"], [role="button"], div, span, p, label, h1, h2, h3, h4, h5, h6'
    ));

    return allTextElements.find(el => {
        const elText = el.textContent?.trim() || '';
        return elText.includes(text) || elText.toLowerCase().includes(text.toLowerCase());
    });
}

/**
 * Finds an element by its DOM path
 */
function findElementByPath(path) {
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
        if (generateElementPath(el) === path) {
            return el;
        }
    }
    return null;
}

/**
 * Generates a DOM path for an element
 */
function generateElementPath(element) {
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

/**
 * Extracts interactive elements from the page for AI processing
 */
function extractInteractiveElements() {
    console.log("Extracting interactive elements from page");

    try {
        const interactiveElements = [];

        // Get all potentially interactive elements
        const selectors = [
            'button', 'a', 'input', 'textarea', 'select',
            '[role="button"]', '[tabindex]', '[onclick]'
        ];
        const elements = document.querySelectorAll(selectors.join(', '));

        // Process each element
        Array.from(elements).forEach((element, index) => {
            // Skip hidden elements
            if (!isElementVisible(element)) return;

            // Extract key properties
            interactiveElements.push({
                index,
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                text: element.textContent?.trim() || null,
                value: element.value || null,
                placeholder: element.getAttribute('placeholder') || null,
                ariaLabel: element.getAttribute('aria-label') || null,
                role: element.getAttribute('role') || null,
                type: element.getAttribute('type') || null,
                isInViewport: isElementInViewport(element),
            });
        });

        return {
            elements: interactiveElements,
            pageContext: {
                title: document.title,
                url: window.location.href
            }
        };
    } catch (error) {
        console.error("Error extracting elements:", error);
        return {
            elements: [],
            pageContext: {
                title: document.title,
                url: location.href
            }
        };
    }
}

/**
 * Checks if an element is visible
 */
function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
}

/**
 * Checks if an element is in the viewport
 */
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