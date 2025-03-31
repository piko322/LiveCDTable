let activeChampions = [];
let teamAssignments = {
    Blue: [],
    Red: []
};
let championOrder = [];
let cooldownFile;
let cooldowns = {};
let championNames = [];
let initialized = false;

let championSuggestions = [];

function assignTeam(champion, team) {
    if (team === 'Blue') {
        if (teamAssignments.Blue.length < 5) {
            teamAssignments.Blue.push(champion);
        } else {
            throw new Error("Blue team is full.");
        }
    } else if (team === 'Red') {
        if (teamAssignments.Red.length < 5) {
            teamAssignments.Red.push(champion);
        } else {
            throw new Error("Red team is full.");
        }
    } else {
        throw new Error("Invalid team. Use 'Blue' or 'Red'.");
    }
}

async function initialize() {
    // Fetch the manifest file to get the path to most recent version data
    const response = await fetch('manifest.json');
    const data = await response.json();
    cooldownFile = data.currentFile;
    console.log("In: data/"+cooldownFile);

    // Fetch the cooldown file
    await fetch('data/' + cooldownFile)
        .then(response => response.json())
        .then(data => {
            cooldowns = data;
            championNames = Object.keys(cooldowns);
            console.log("Champion Names: ", championNames);
        })
        .catch(error => console.error('Error fetching cooldown file:', error));
    
    // Mark initialization as complete
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.textContent = ""
    initialized = true;
}

initialize().then(() => {
    console.log("Initialization complete.");
});

document.addEventListener('DOMContentLoaded', async () => {
    const searchBar = document.getElementById('searchBar');
    const suggestionsList = document.getElementById('suggestionsList');

    function clearSearch() {
        searchBar.value = '';
        championSuggestions = [];
        suggestionsList.innerHTML = '';
    }

    function showSuggestions(input) {
        let suggestions = [];
        suggestionsList.innerHTML = ''; // Clear previous suggestions
        championSuggestions = [];

        // Hide the suggestions list if the input is empty
        if (input.trim().length === 0) {
            console.log("Input is empty, hiding suggestions.");
            clearSearch();
            return;
        }
        
        const regex = new RegExp('^' + input, 'i'); // Match only names that start with input
        suggestions = championNames
            .filter(champion => regex.test(champion))
            .filter(champion => !activeChampions.includes(champion))
            .slice(0, 5);

        // console.log("Filtered suggestions: ", suggestions);
        if (suggestions.length === 0) {
            console.log("No suggestions found.");
            suggestionsList.innerHTML = '';
            return;
        }

        suggestions.forEach(suggestion => {
            const li = document.createElement('li');
            const iconUrl = cooldowns[suggestion].champIcon;
            li.innerHTML = `<img id="suggestionIcon" src="${iconUrl}" alt="${suggestion}"> ${suggestion}`;
            li.addEventListener('click', () => {
                clearSearch();
                if (!activeChampions.includes(suggestion) && activeChampions.length < 10) {
                    activeChampions.push(suggestion);
                    championOrder.push(suggestion);
                    updateTable();
                    console.log("Active Champions: ", activeChampions);
                }
            });
            championSuggestions.push(suggestion);
            suggestionsList.appendChild(li);
        });

    }

    searchBar.addEventListener('input', () => {
        // console.log("Input value: ", searchBar.value);
        showSuggestions(searchBar.value)
    });

    searchBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            // console.log("Enter key pressed, current input: ", searchBar.value);
            // console.log("Suggestions: ", championSuggestions);
            if (championSuggestions.length > 0) {
                const selectedChampion = championSuggestions[0]; // Select the first suggestion
                if (!activeChampions.includes(selectedChampion) && activeChampions.length < 10) {
                    activeChampions.push(selectedChampion);
                    championOrder.push(selectedChampion);
                    updateTable();
                    // console.log("Active Champions: ", activeChampions);
                }
            } else {
                console.log("No suggestions available.");
            }
            clearSearch();
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchBar.contains(e.target) && !suggestionsList.contains(e.target)) {
            clearSearch();
        }
    })


});

function updateTable() {
    const table = document.getElementById('cooldownTable');
    const blueTeamBody = document.getElementById('Blue');
    const redTeamBody = document.getElementById('Red');
    
    blueTeamBody.innerHTML = '';
    redTeamBody.innerHTML = '';
    table.style.display = 'inline-table';

    if (activeChampions.length === 0) {
        return;
    }

    teamAssignments = { Blue: [], Red: [] };

    championOrder.forEach((champion, index) => {
        const team = index < 5 ? 'Blue' : 'Red';
        teamAssignments[team].push(champion);

        if (cooldowns[champion]) {
            const data = cooldowns[champion];
            const row = document.createElement('tr');
            row.className = `team-row ${team}`;
            row.draggable = true;
            row.dataset.champion = champion;

            row.innerHTML = `
                <td><img class="champion-icon" src="${data.champIcon}" alt="${champion}" width="50" height="50"></td>
                <td>${champion}</td>
                <td>${data.Q || 'N/A'}</td>
                <td>${data.W || 'N/A'}</td>
                <td>${data.E || 'N/A'}</td>
                <td>${data.R || 'N/A'}</td>
                <td class="${team}">${team}</td>
            `;

            row.addEventListener('dragstart', (e) => {
                draggedRow = row;
                e.dataTransfer.effectAllowed = "move";
                row.classList.add('dragging');
                e.dataTransfer.setDragImage(new Image(), 0, 0);
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                const hoveringRow = e.target.closest('tr');
                if (hoveringRow && hoveringRow !== draggedRow) {
                    const bounding = hoveringRow.getBoundingClientRect();
                    const offset = e.clientY - bounding.top;
                    if (offset > bounding.height / 2) {
                        hoveringRow.after(draggedRow);
                    } else {
                        hoveringRow.before(draggedRow);
                    }
                    updateTeamColor();
                }
            });
            row.addEventListener('dragenter', (e) => {
                const hoveringRow = e.target.closest('tr');
                if (hoveringRow && hoveringRow !== draggedRow) {
                    hoveringRow.classList.add('dragging-over')
                }
            });

            row.addEventListener('dragleave', (e) => {
                const hoveringRow = e.target.closest('tr');
                if (hoveringRow && hoveringRow !== draggedRow) {
                    hoveringRow.classList.remove('dragging-over')
                }
            });

            row.addEventListener('dragend', () => {
                draggedRow.classList.remove('dragging');
                const allRows = [...blueTeamBody.getElementsByTagName('tr'), ...redTeamBody.getElementsByTagName('tr')];
                allRows.forEach(row => row.classList.remove('dragging-over')); // Remove the dragging-over class after drag ends
                draggedRow = null;
                updateChampionOrder();
                updateTable(); // Update teams dynamically after drag
            });

            if (team === 'Blue') {
                blueTeamBody.appendChild(row);
            } else {
                redTeamBody.appendChild(row);
            }
        }
    });

    updateTeamAssignments();
}

function updateTeamColor() {
    const rows = [...document.querySelectorAll('.team-row')];
    rows.forEach((row,index) => {
        if (index < 5) {
            row.classList.remove('Red');
            row.classList.add('Blue');
            row.lastElementChild.textContent = 'Blue';
        } else {
            row.classList.remove('Blue');
            row.classList.add('Red');
            row.lastElementChild.textContent = 'Red';
        }
    })

function updateChampionOrder() {
    const blueRows = document.querySelectorAll("#Blue tr.team-row");
    const redRows = document.querySelectorAll("#Red tr.team-row");
    
    championOrder = [...blueRows, ...redRows].map(row => row.dataset.champion);
}

function updateTeamAssignments() {
    const table = document.getElementById('cooldownTable');
    const rows = [...table.getElementsByTagName('tr')].filter(row => row.classList.contains('team-row'));
    teamAssignments = { Blue: [], Red: [] };

    rows.forEach((row, index) => {
        const champion = row.dataset.champion;
        const team = index < 5 ? 'Blue' : 'Red';
        row.className = `team-row ${team}`;
        row.lastElementChild.textContent = team;
        teamAssignments[team].push(champion);
    });

    // console.log("Updated Teams:", teamAssignments);
}