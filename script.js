let activeChampions = [];
let teamAssignments = { Blue: [], Red: [] };
let championOrder = [];
let cooldownFile;
let cooldowns = {};
let championNames = [];
let initialized = false;
let championSuggestions = [];
let currentVersion;
let selectedRow = null;

// Fetch data from manifest and cooldown file
async function initialize() {
    const response = await fetch('manifest.json');
    const data = await response.json();
    cooldownFile = data.currentFile;
    currentVersion = data.currentVersion;
    // Look for h1 element and add version
    const versionElement = document.querySelector('.version');
    versionElement.textContent += ` (${currentVersion})`;
    await fetch('data/' + cooldownFile)
        .then(response => response.json())
        .then(data => {
            cooldowns = data;
            championNames = Object.keys(cooldowns);
            console.log("Champion Names: ", championNames);
        })
        .catch(error => console.error('Error fetching cooldown file:', error));
    document.getElementById('statusMessage').textContent = "";
    initialized = true;
    if (isMobileDevice()) {
        document.getElementById('info').textContent = "The cooldowns are displayed in seconds.";
        document.getElementById('info2').textContent = "You can swap two rows by tapping them.";
    } else {
        document.getElementById('info').textContent = "You can drag and drop champions to change their order. The cooldowns are displayed in seconds.";
        document.getElementById('info2').textContent = "You can swap two rows by clicking one after another.";
    }
}

initialize().then(() => {
    console.log("Initialization complete.");
});

// Search bar functionality
document.addEventListener('DOMContentLoaded', () => {
    const searchBar = document.getElementById('searchBar');
    const suggestionsList = document.getElementById('suggestionsList');

    function clearSearch() {
        searchBar.value = '';
        championSuggestions = [];
        suggestionsList.innerHTML = '';
    }

    function showSuggestions(input) {
        suggestionsList.innerHTML = '';
        championSuggestions = [];

        if (input.trim().length === 0) {
            clearSearch();
            return;
        }
        
        const regex = new RegExp('^' + input, 'i'); // Match only names that start with input
        suggestions = championNames
            .filter(champion => regex.test(champion))
            .filter(champion => !activeChampions.includes(champion))
            .slice(0, 5);

        if (suggestions.length === 0) {
        return;
        }

        suggestions.forEach(suggestion => {
            const li = document.createElement('li');
            const iconUrl = cooldowns[suggestion].champIcon;
            li.innerHTML = `<img class="suggestion" src="${iconUrl}" alt="${suggestion}"> ${suggestion}`;
            li.classList.add('suggestion');
            li.addEventListener('click', () => {
                clearSearch();
                if (!activeChampions.includes(suggestion) && activeChampions.length < 10) {
                    activeChampions.push(suggestion);
                    championOrder.push(suggestion);
                    updateTable();
                }
            });
            championSuggestions.push(suggestion);
            suggestionsList.appendChild(li);
            toggleSearchBar();
        });
    }

    searchBar.addEventListener('input', () => {
        showSuggestions(searchBar.value);
    });

    searchBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (championSuggestions.length > 0) {
                const selectedChampion = championSuggestions[0];
                if (!activeChampions.includes(selectedChampion) && activeChampions.length < 10) {
                    activeChampions.push(selectedChampion);
                    championOrder.push(selectedChampion);
                    updateTable();
                }
            }
            clearSearch();
            console.log("Enter")
            toggleSearchBar();
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchBar.contains(e.target) && !suggestionsList.contains(e.target) && !e.target.classList.contains('suggestion')) {
            clearSearch();
            console.log("Click")
            toggleSearchBar();
        } else if (e.target.classList.contains('suggestion')) {
            clearSearch();
            console.log("Suggestion Click")
            toggleSearchBar(bypass = true);
        }
    });
});

function toggleSearchBar(bypass = false) {
    console.log(!bypass ? "No Focus" : "Focus");
    const searchBar = document.getElementById('searchBar');
    if (activeChampions.length < 10) {
        searchBar.style.display = 'block';
        if (!isMobileDevice() || bypass) {
            searchBar.focus();
        };
    } else {
        searchBar.style.display = 'none';
    }
}

function clearSelection() {
    document.querySelectorAll('.selected-row').forEach(row => {
        row.classList.remove('selected-row');
    });
    selectedRow = null;
    console.log("Clearing selection");
}

// Update the table with champion data
function updateTable() {
    const table = document.getElementById('cooldownTable');
    table.style.display = 'inline-table';
    const blueTeamBody = document.getElementById('Blue');
    const redTeamBody = document.getElementById('Red');

    blueTeamBody.innerHTML = '';
    redTeamBody.innerHTML = '';

    if (activeChampions.length === 0) return;

    teamAssignments = { Blue: [], Red: [] };

    // Reassign the teams based on row index
    championOrder.forEach((champion, index) => {
        const team = index < 5 ? 'Blue' : 'Red';
        teamAssignments[team].push(champion);

        if (cooldowns[champion]) {
            const data = cooldowns[champion];
            const row = document.createElement('tr');
            row.className = `team-row ${team}`;
            row.dataset.champion = champion;

            row.innerHTML = `
                <td id="champ"><img class="champion-icon" src="${data.champIcon}" alt="${champion}" width="50" height="50"></td>
                <td id="champ" data-label="CHAMPION" >${champion}</td>
                <td data-label="Q">${data.Q || 'N/A'}</td>
                <td data-label="W">${data.W || 'N/A'}</td>
                <td data-label="E">${data.E || 'N/A'}</td>
                <td data-label="R">${data.R || 'N/A'}</td>
                <td class="remove-col">X</td>
            `;

            row.addEventListener('pointerdown', (e) => {
                if (e.target.classList.contains('remove-col')) return; // Ignore clicks on the remove button
                if (document.body.classList.contains('dragging')) return; // Ignore clicks while dragging
                if (selectedRow && selectedRow !== row) {
                    const champ1 = selectedRow.dataset.champion;
                    const champ2 = row.dataset.champion;
                    const idx1 = championOrder.indexOf(champ1);
                    const idx2 = championOrder.indexOf(champ2);
                    if (idx1 !== -1 && idx2 !== -1) {
                        // Swap the champions in the order array
                        championOrder[idx1] = champ2;
                        championOrder[idx2] = champ1;
                    } 

                    // Animation
                    selectedRow.classList.add('swap-animation');
                    row.classList.add('swap-animation');
                    console.log("Swapping rows: ", selectedRow.dataset.champion, " and ", row.dataset.champion);
                    setTimeout(() => {
                        selectedRow.classList.remove('swap-animation');
                        row.classList.remove('swap-animation');
                        selectedRow = null;
                        updateTable();
                    }, 300); // Duration of the animation
                    // selectedRow.classList.remove('selected-row');
                    
                } else {
                    if (selectedRow) {
                        // If clicked on the same row, deselect it
                        selectedRow.classList.remove('selected-row');
                        selectedRow = null;
                    } else {
                        // If no row is selected, select this one
                        selectedRow = row;
                        selectedRow.classList.add('selected-row');
                    }
                } 
                console.log("Selected Row: ", selectedRow ? selectedRow.dataset.champion : "None");
            });

            row.querySelector('.remove-col').addEventListener('click', () => {
                const championName = row.dataset.champion;
                activeChampions = activeChampions.filter(champ => champ !== championName);
                championOrder = championOrder.filter(champ => champ !== championName);
                row.remove();
                updateTable();
            });

            // Append to the corresponding tbody
            if (team === 'Blue') {
                blueTeamBody.appendChild(row);
            } else {
                redTeamBody.appendChild(row);
            }
        }
    });

    // Initialize Sortable on both team bodies
    initializeSortable();
}

function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Initialize or reinitialize Sortable for the Blue and Red team table bodies
function initializeSortable() {
    if (isMobileDevice()) {return;}
    const blueTeamBody = document.getElementById('Blue');
    const redTeamBody = document.getElementById('Red');

    // Create Sortable instances for both teams that share a group.
    new Sortable(blueTeamBody, {
        group: 'shared',
        animation: 50,
        ghostClass: 'ghost',
        onStart: function (e) {
            console.log("Drag started");
            clearSelection();
            document.body.classList.add('dragging');
            e.item.addEventListener('dragstart', (event) => {
            event.dataTransfer.setDragImage(new Image(), 0, 0)
            })

        },
        onSort: updateAfterSort,
        onEnd: function (e) {
            document.body.classList.remove('dragging');
        }
    });

    new Sortable(redTeamBody, {
        group: 'shared',
        animation: 50,
        ghostClass: 'ghost',
        onStart: function (e) {
            document.body.classList.add('dragging');
            clearSelection();
            e.item.addEventListener('dragstart', (event) => {
            event.dataTransfer.setDragImage(new Image(), 0, 0)
            })
        },
        onSort: updateAfterSort,
        onEnd: function (e) {
            document.body.classList.remove('dragging');
        }
        });
    }

// Update champion order and team assignments after sorting
function updateAfterSort() {
    const blueRows = document.querySelectorAll("#Blue tr.team-row");
    const redRows = document.querySelectorAll("#Red tr.team-row");

    // Update championOrder array
    championOrder = [...blueRows, ...redRows].map(row => row.dataset.champion);
    // console.log("championOrder: ", championOrder);

    teamAssignments = { Blue: [], Red: [] };

    // Reassign teams based off new order
    championOrder.forEach((champion, index) => {
        const team = index < 5 ? 'Blue' : 'Red';
        teamAssignments[team].push(champion);
        const row = document.querySelector(`tr[data-champion="${champion}"]`);
        // Update row class to match new team
        if (row) {
            row.className = `team-row ${team}`;
        }
    });

    // Update the champion order based on the new sorting
    console.log("Updated Champion Order: ", championOrder);
    console.log("Team Assignments:", teamAssignments);
}