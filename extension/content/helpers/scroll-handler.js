// scroll-handler.js

/**
 * Handle scrolling operations based on direction
 * @param {number} amount - Amount to scroll
 * @param {Object} mousePosition - Current mouse position
 */
export function handleScroll(amount, mousePosition) {
    const scrollableElement = findScrollableElement(mousePosition);

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

/**
 * Handle advanced scrolling operations
 * @param {string} type - Type of scroll operation ('percent', 'pages')
 * @param {number} value - Value for the operation
 * @param {Object} mousePosition - Current mouse position
 */
export function handleAdvancedScroll(type, value, mousePosition) {
    const scrollableElement = findScrollableElement(mousePosition);

    switch (type) {
        case 'percent':
            if (scrollableElement) {
                const targetPosition = scrollableElement.scrollHeight * (value / 100);
                scrollableElement.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            } else {
                const targetPosition = document.body.scrollHeight * (value / 100);
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
            break;

        case 'pages':
            const viewportHeight = window.innerHeight;
            const scrollAmount = value * viewportHeight;

            if (scrollableElement) {
                const currentPos = scrollableElement.scrollTop;
                scrollableElement.scrollTo({
                    top: currentPos + scrollAmount,
                    behavior: 'smooth'
                });
            } else {
                const currentPos = window.scrollY || document.documentElement.scrollTop;
                window.scrollTo({
                    top: currentPos + scrollAmount,
                    behavior: 'smooth'
                });
            }
            break;

        case 'top':
            if (scrollableElement) {
                scrollableElement.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            } else {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
            break;

        case 'bottom':
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
            break;
    }
}

/**
 * Get information about current scroll position
 * @param {Object} mousePosition - Current mouse position
 * @returns {Object} - Scroll information
 */
export function getScrollInfo(mousePosition) {
    const scrollableElement = findScrollableElement(mousePosition);

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
        const currentPosition = window.scrollY || document.documentElement.scrollTop;
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

/**
 * Finds a scrollable element at the given mouse position
 * @param {Object} mousePosition - Current mouse position
 * @returns {Element|null} - A scrollable element or null
 */
function findScrollableElement(mousePosition) {
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

/**
 * Checks if an element is scrollable
 * @param {Element} element - Element to check
 * @returns {boolean} - Whether the element is scrollable
 */
function isScrollable(element) {
    // Skip the body and documentElement
    if (element === document.body || element === document.documentElement) {
        return false;
    }

    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;

    // Has scrollable content and scroll-friendly CSS
    return element.scrollHeight > element.clientHeight &&
        ['auto', 'scroll'].includes(overflowY);
}