const TOGETHER_API_KEY = 'tgp_v1_RFc5YLeJaQ2tSm5oaJGRhOX_-OUGO-KZDZQiJCHqZOs'; // Replace with your actual API key

async function processWithAI(command, tabsInfo) {
    try {
        const response = await fetch('https://api.together.xyz/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOGETHER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
                messages: [
                    {
                        role: "system",
                        content: "You are a command parser that converts voice commands into JSON actions. Respond ONLY with valid JSON. No explanation, no markdown, just the JSON object with these fields: action (switch_tab, new_tab, close_tab, page_interaction, scroll, click), target (number or string), and details (optional parameters or null). \n\nIMPORTANT: For switch_tab actions, ALWAYS return a numeric tab index (1-based) as the target, NOT the tab title."
                    },
                    {
                        role: "user",
                        content: `Parse this voice command into JSON: "${command}". Available tabs:\n${tabsInfo.map((tab, i) => `${i + 1}. ${tab.title}`).join('\n')}`
                    }
                ],
                temperature: 0.7,
                max_tokens: 100
            })
        });

        const data = await response.json();
        const content = data.choices[0].message.content;

        // Clean the response to ensure it's valid JSON
        const cleanedContent = content.replace(/```json|```/g, '').trim();
        const result = JSON.parse(cleanedContent);

        // Double-check switch_tab actions to ensure target is a number
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

        return result;
    } catch (error) {
        console.error('Error processing command:', error);
        return { action: "none", target: null, details: null };
    }
}

