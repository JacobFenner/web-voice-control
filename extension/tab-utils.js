function findTargetTab(tabs, target) {
    if (!isNaN(parseInt(target))) {
        const index = parseInt(target) - 1;
        return tabs[index];
    }

    console.log(tabs)
    return tabs.find(tab =>
        tab.title.toLowerCase().includes(target?.toLowerCase())
    );
}
