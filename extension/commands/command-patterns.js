export const commandPatterns = {
    navigation: {
        patterns: [
            { regex: /\b(open|new)\s+tab\b/i, action: 'newTab' },
            { regex: /\b(close|exit)\s+tab\b/i, action: 'closeTab' },
            { regex: /\bswitch\s+to\s+tab\s+(\d+|first|second|third|fourth|fifth|last)\b/i, action: 'switchTab' },
            { regex: /\bgo\s+back\b/i, action: 'goBack' },
            { regex: /\bgo\s+forward\b/i, action: 'goForward' },
            { regex: /\b(go\s+to|open|navigate\s+to)\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i, action: 'navigateToUrl' },
            { regex: /\bsearch\s+(for\s+)?(.+)$/i, action: 'search' }
        ]
    },

    scrolling: {
        patterns: [
            { regex: /^scroll\s+up$/i, action: 'up' },
            { regex: /^scroll\s+down$/i, action: 'down' },
            { regex: /\b(go\s+to\s+)?(top|scroll\s+to\s+top)\b/i, action: 'top' },
            { regex: /\b(go\s+to\s+)?(bottom|scroll\s+to\s+bottom)\b/i, action: 'bottom' }
        ]
    },

    clicking: {
        patterns: [
            { regex: /\b(just\s+)?click\b/i, action: 'simpleClick' },
            { regex: /\bclick\s+(?:on\s+)?(.+)\b/i, action: 'elementClick' }
        ]
    },

    system: {
        patterns: [
            { regex: /\b(stop|quit|exit)\s+(listening|voice|recognition)\b/i, action: 'stop' }
        ]
    }
};

export function processCommand(command) {
    const result = {
        matched: false,
        category: null,
        action: null,
        params: [],
        useAI: false
    };

    for (const [category, categoryData] of Object.entries(commandPatterns)) {
        for (const pattern of categoryData.patterns) {
            const match = command.match(pattern.regex);

            if (match) {
                result.matched = true;
                result.category = category;
                result.action = pattern.action;

                if (category === 'clicking')
                    result.useAI = true;

                if (match.length > 1) {
                    result.params = match.slice(1).filter(param => param !== undefined);
                }

                return result;
            }
        }
    }

    // No pattern matched
    result.useAI = true;
    return result;
}