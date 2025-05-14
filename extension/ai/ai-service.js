const TOGETHER_API_KEY = 'tgp_v1_RFc5YLeJaQ2tSm5oaJGRhOX_-OUGO-KZDZQiJCHqZOs'; // Replace with your actual API key

export async function processWithAI(command, tabsInfo, pageElements = null) {
    console.log("Processing command with AI:", command);

    try {
        // Determine the command type and prepare the appropriate system prompt
        let systemPrompt, userPrompt;
        let isElementInteraction = false;

        // Command seems to be related to element interaction if it contains certain keywords
        const elementInteractionKeywords = [
            'click', 'press', 'tap', 'select', 'choose', 'check', 'uncheck',
            'type', 'enter', 'input', 'write', 'fill'
        ];

        isElementInteraction = elementInteractionKeywords.some(keyword =>
            command.toLowerCase().includes(keyword)
        );

        // If this appears to be an element interaction and we have page elements
        if (isElementInteraction && pageElements) {
            console.log("Processing as element interaction");

            const filteredElements = pageElements.elements.slice(0, 30).map(element => ({
                text: element.text,
                tag: element.tag,
                id: element.id,
                ariaLabel: element.ariaLabel,
                placeholder: element.placeholder,
                role: element.role,
                type: element.type,
                isInViewport: element.isInViewport,
                hasAssignedId: element.id && element.id.startsWith('vc-target-')
            }));

            systemPrompt = `You are an AI assistant that helps users interact with web elements. You analyze page elements and find the best match for user commands.
    
                Respond with a JSON object containing:
                - action: The type of interaction ("click", "input", "select", "scroll")
                - target: The specific selector to interact with. IMPORTANT: If an element has an id, ALWAYS use the '#id' selector format as it's most reliable.
                - value: Any value to be input (for text fields)
                - confidence: A number between 0-1 indicating your confidence
                - reasoning: A brief explanation of why this element was chosen`;

            userPrompt = `User command: "${command}"
    
                Page title: ${pageElements.pageContext.title}
                URL: ${pageElements.pageContext.url}
                
                Available interactive elements:
                ${JSON.stringify(filteredElements, null, 2)}
                
                Based on the command and available elements, identify which element to interact with and how.
                ALWAYS prefer using id selectors (format: '#element-id') when available as they are most reliable.`;
        }
        // Otherwise, process as a navigation/system command
        else {
            console.log("Processing as navigation/system command");

            systemPrompt = `You are a command parser that converts voice commands into JSON actions. Respond ONLY with valid JSON. 

                The JSON object should include:
                - action: One of: "switch_tab", "new_tab", "close_tab", "go_back", "go_forward", "scroll", "click", "element_interaction", "advanced_scroll", "navigate_to_url"
                - target: For basic scrolling: "up", "down", "top", "bottom". For tabs: the tab number or identifier. For element interactions: what to interact with. For navigation history: null. For URL navigation: the full URL (add https:// if missing).
                - details: Additional parameters based on action type:
                  - For "advanced_scroll": Include "scrollType" ("toPercent" or "byPages"), "percent" (0-100) or "pages" (number of viewport heights), AND "direction" ("up" or "down")
                  - For "navigate_to_url": You can optionally include "newTab" boolean to indicate if the URL should open in a new tab
                  - For other commands: null or specific parameters
                
                IMPORTANT NAVIGATION RULES:
                - For commands like "go to [website]", "open [website]", "navigate to [website]", use action "navigate_to_url".
                - Always add "https://" to the URL if the user doesn't specify the protocol.
                - If the user just mentions a domain without a TLD (like "go to amazon"), add ".com" as the default TLD.
                - If the user mentions a search query like "search for cats", use action "navigate_to_url" with "https://www.google.com/search?q=cats".
                
                [rest of prompt remains the same]`;


            userPrompt = `Parse this voice command into JSON: "${command}". 
                Available tabs:
                ${tabsInfo.map((tab, i) => `${i + 1}. ${tab.title}`).join('\n')}`;
        }

        // Make API call to Together AI
        const response = await fetch('https://api.together.xyz/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOGETHER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "google/gemma-2-27b-it",
                // model: "anthropic/claude-3-haiku-20240307",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 250
            })
        });

        const data = await response.json();
        const content = data.choices[0].message.content;

        // Clean the response to ensure it's valid JSON
        const cleanedContent = content.replace(/```json|```/g, '').trim();
        let result = JSON.parse(cleanedContent);

        // If we have tab navigation, ensure the target is properly formatted
        if (result.action === 'switch_tab' && isNaN(parseInt(result.target))) {
            // Find the tab with matching title
            const matchingTab = tabsInfo.find(tab =>
                tab.title.toLowerCase().includes(result.target.toLowerCase())
            );

            if (matchingTab) {
                result.target = matchingTab.index;
            } else {
                console.log(`Tab not found with title containing: ${result.target}`);
                result.target = null;
            }
        }

        // Special handling for element interactions
        if (isElementInteraction && pageElements) {
            // If the AI detected an element interaction, add a flag
            result.isElementInteraction = true;
        }

        console.log("AI processing result:", result);
        return result;
    } catch (error) {
        console.error('Error processing command with AI:', error);
        return { action: "none", target: null, details: null };
    }
}

