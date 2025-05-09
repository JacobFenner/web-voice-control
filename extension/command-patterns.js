const commandPatterns = {
    // Navigation patterns
    navigation: {
        switchTab: [
            /^(switch|go|navigate)\s+to\s+(tab\s+)?(\d+|first|second|third|last)/i,
            /^(open|show|display)\s+(tab\s+)?(\d+|first|second|third|last)/i
        ],
        newTab: [
            /^(open|create|new)\s+(a\s+)?(new\s+)?tab/i
        ],
        closeTab: [
            /^(close|exit)\s+(this\s+)?tab/i
        ],
        goBack: [
            /^(go|navigate)\s+back$/i,
            /^back$/i,
            /^return$/i,
            /^previous(\s+page)?$/i
        ],
        goForward: [
            /^(go|navigate)\s+forward$/i,
            /^forward$/i,
            /^next(\s+page)?$/i
        ]
    },

    // Scrolling patterns
    scrolling: {
        up: [/^scroll\s+(up|back|backward)$/i],
        down: [/^scroll\s+(down|forward)$/i],
        top: [/^(scroll\s+to\s+)?(the\s+)?top$/i],
        bottom: [/^(scroll\s+to\s+)?(the\s+)?bottom$/i]
    },

    // Click patterns
    clicking: {
        simpleClick: [/^(click|tap|press)$/i],
        elementClick: [
            /^(click|tap|press)\s+(on\s+)?(the\s+)?(.*?)\s+(button|link|element)$/i,
            /^(click|tap|press)\s+(the\s+)?(.*)$/i
        ]
    },

    // Input patterns
    input: {
        type: [
            /^(type|enter|input)\s+(.*)/i,
            /^(write|put)\s+(.*)/i
        ],
        focus: [
            /^(focus|select)\s+(on\s+)?(the\s+)?(.*?)\s+(field|input|box)/i
        ]
    },

    system: {
        stop: [
            /^(stop|end|quit|exit)\s+(listening|recognition)/i,
            /^(stop|end|quit|exit)$/i
        ]
    }

};

const processCommand = (command, tabInfo = null) => {
    // Try to match simple patterns first
    for (const [category, patterns] of Object.entries(commandPatterns)) {
        for (const [action, regexList] of Object.entries(patterns)) {
            for (const regex of regexList) {
                const match = command.match(regex);
                if (match) {
                    return {
                        matched: true,
                        category,
                        action,
                        params: match.slice(1).filter(Boolean),
                        useAI: shouldUseAI(category, action, match)
                    };
                }
            }
        }
    }

    // No pattern match, should use AI
    return {
        matched: false,
        useAI: true,
        command: command,
    };
};

function shouldUseAI(category, action, match) {
    // Simple commands that don't need AI
    const simpleCommands = {
        scrolling: ['up', 'down', 'top', 'bottom'],
        clicking: ['simpleClick'],
        navigation: ['newTab', 'closeTab']
    };

    if (simpleCommands[category]?.includes(action)) {
        return false;
    }

    // Complex commands that benefit from AI
    const complexCommands = {
        clicking: ['elementClick'],
        input: ['type', 'focus'],
        navigation: ['switchTab']
    };

    if (complexCommands[category]?.includes(action)) {
        return true;
    }

    return true; // Default to AI for unknown patterns
}
