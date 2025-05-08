function processCommand(command, details) {
    switch (command) {
        case 'click':
            handleClick();
            break;
        case 'scroll_up':
            window.scrollBy(0, -300);
            break;
        case 'scroll_down':
            window.scrollBy(0, 300);
            break;
        case 'scroll_top':
            window.scrollTo(0, 0);
            break;
        case 'scroll_bottom':
            window.scrollTo(0, document.body.scrollHeight);
            break;
        case 'custom_scroll':
            if (details && details.amount) {
                window.scrollBy(0, details.amount);
            }
            break;
        // Add more commands as needed
    }
}

function handleClick() {
    if (gazeData) {
        const element = document.elementFromPoint(gazeData.x, gazeData.y);
        if (element) {
            element.click();
        }
    }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "processCommand") {
        processCommand(request.command, request.details);
    } else if (request.action === "scroll") {
        processCommand(request.direction === "up" ? "scroll_up" : "scroll_down");
    }
    return true;
});
