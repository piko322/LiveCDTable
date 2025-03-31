const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());

const LIVE_URL = 'https://127.0.0.1:2999/liveclientdata/allgamedata';
const DDRAGON_URL = 'https://ddragon.leagueoflegends.com/cdn/15.4.1/data/en_US/champion/';
const MERAKI_URL = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions/';

async function getLiveData() {
    try {
        const response = await axios.get(LIVE_URL, { httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) });
        return response.data;
    } catch (error) {
        console.error('Error fetching live data:', error);
        return null;
    }
}

function getChampionData(liveData) {
    let out = { Blue: [], Red: [] };
    liveData.allPlayers.forEach(player => {
        const playerChamp = player.championName;
        const playerTeam = player.team === 'ORDER' ? 'Blue' : 'Red';
        out[playerTeam].push(playerChamp);
    });
    return out;
}

async function getChampionCooldown(championName, recursive = false) {
    try {
        if (championName === 'Wukong') championName = 'monkeyKing';
        const url = `${MERAKI_URL}${championName}.json`;
        const response = await axios.get(url);
        const abilities = response.data.abilities;
        const champIcon = response.data.icon; // Fetch the champion icon URL

        let cooldowns = {
            champIcon: champIcon // Include champIcon in the returned data
        };

        for (let spellKey in abilities) {
            if (spellKey === 'P') continue; // Skip passive ability
            let spell = abilities[spellKey][0];

            let hasCD = spell.cooldown ? true : false;
            if (hasCD) {
                let spellCDs = spell.cooldown.modifiers[0].values;
                if (spellCDs.every(cd => cd === spellCDs[0])) {
                    cooldowns[spellKey] = `${spellCDs[0]} all ranks`;
                } else {
                    cooldowns[spellKey] = spellCDs.join(' / ');
                }
            } else {
                cooldowns[spellKey] = 'No CD';
            }

            let hasAmmo = spell.rechargeRate ? true : false;
            // Check for ammo recharge ability
            if (hasAmmo) {
                let rechargeRate = spell.rechargeRate;
                let rechargeString = '';
                if (rechargeRate.every(recharge => recharge === rechargeRate[0])) {
                    rechargeString += `${rechargeRate[0]} all ranks`;
                } else {
                    rechargeString += rechargeRate.join(' / ');
                }
                cooldowns[spellKey] += ` <br> recharge: <br> ${rechargeString}`;
            }
        }

        return cooldowns;
    } catch (error) {
        return {};
    }
}

async function getDDragonLatestVersion() {
    try {
        const response = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
        return response.data[0];
    } catch (error) {
        console.error('Error fetching Data Dragon version:', error);
        return null;
    }
}

async function getChampionCooldownDDragon(championName) {
    try {
        if (championName === 'Wukong') {
            championName = 'monkeyKing';
        }
        let version = await getDDragonLatestVersion();

        console.log(`Fetching cooldowns for ${championName} from Data Dragon`);
        let response = await axios.get(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${championName}.json`)
        let champData = response.data.data;
        champData = champData[championName];
        let champIcon = `http://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champData.image.full}`;
        console.log(`CDragon response: ${champData}`);
        console.log(`Champion icon: ${champIcon}`);

        const champSpells = champData.spells;
          let cooldowns = {
            champIcon: champIcon // Include champIcon in the returned data
        };

        const spellKeys = ['Q', 'W', 'E', 'R'];

        spellKeys.forEach((spellKey, index) => {
            const spell = champSpells[index];
            const spellCDs = spell.cooldown;

            // If all the entries are the same, just show one
            let spellCDDescription;
            if (spellCDs.every(val => val === spellCDs[0])) {
                spellCDDescription = `${spellCDs[0]} all ranks`;
            } else {
                spellCDDescription = spellCDs.join(' / ');
            }

            cooldowns[spellKey] = spellCDDescription;
        });
        return cooldowns;
    } catch (error) {
        console.error(`Error fetching cooldowns for ${championName} from Data Dragon:`, error);
        return {};
    }
}

async function getChampionCooldowns(champions) {
    let championCooldowns = {};
    let teamChampDict = {};
    for (const team in champions) {
        for (const champ of champions[team]) {
            teamChampDict[champ] = team;
            let MerakiData = await getChampionCooldown(champ);

            // If Meraki data is empty, try fetching from Data Dragon
            if (Object.keys(MerakiData).length === 0) {
                let CDragonData = await getChampionCooldownDDragon(champ);
                championCooldowns[champ] = CDragonData;
            } else {
                championCooldowns[champ] = await getChampionCooldown(champ);
            }
            console.log('=====================================');
            // If both Meraki and DDragon data are empty, try finding the closest match
            if (Object.keys(championCooldowns[champ]).length === 0) {
                let closestMatch = await findClosestMatch(champ);
                let closestMatchDDragon = await findClosestMatch(champ, false);
                console.error(`Error fetching cooldowns for ${champ}, trying closest match: ${closestMatch} and ${closestMatchDDragon}`);
                if (closestMatch !== closestMatchDDragon) {
                    console.log("Difference in closest match, going with CDragon data")
                    CDragonData = await getChampionCooldownDDragon(closestMatchDDragon);
                    championCooldowns[champ] = CDragonData;
                    console.log("CDragon data:", CDragonData);
                } else {
                    console.log("No difference in closest match, going with Meraki data")
                    MerakiData = await getChampionCooldown(closestMatch);
                    championCooldowns[champ] = MerakiData;
                    console.log("Meraki data:", MerakiData);
                }
            }

        }
    }
    return { championCooldowns, teamChampDict };
}

async function getAllChampionNames(meraki=true) {
    if (meraki) {
        try {
            const allChampsUrl = `https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json`;
            const allChampsResponse = await axios.get(allChampsUrl);
            return Object.keys(allChampsResponse.data);
        } catch (error) {
            console.error("Error fetching champion list:", error);
            return [];
        }
    } else {
        try {
            const versionResponse = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
            const latestVersion = versionResponse.data[0];
    
            const allChampsUrl = `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`;
            const allChampsResponse = await axios.get(allChampsUrl);
            return Object.keys(allChampsResponse.data.data);
        } catch (error) {
            console.error("Error fetching champion list:", error);
            return [];
        }
    }
}

async function findClosestMatch(champName, meraki=true) {
    if (meraki) {
        const allChampsList = await getAllChampionNames();
        let closestMatch = null;
        let closestDistance = Infinity;

        allChampsList.forEach(champ => {
            const distance = levenshteinDistance(champName.toLowerCase(), champ.toLowerCase());
            if (distance < closestDistance) {
                closestDistance = distance;
                closestMatch = champ;
            }
        });
        return closestMatch;
    } else {
        const allChampsList = await getAllChampionNames(meraki=false);
        let closestMatch = null;
        let closestDistance = Infinity;
    
        allChampsList.forEach(champ => {
            const distance = levenshteinDistance(champName.toLowerCase(), champ.toLowerCase());
            if (distance < closestDistance) {
                closestDistance = distance;
                closestMatch = champ;
            }
        });
    
        return closestMatch;
    }
        
}

function levenshteinDistance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]) + 1;
            }
        }
    }

    return dp[a.length][b.length];
}


app.get('/cooldowns', async (req, res) => {
    const liveData = await getLiveData();
    if (!liveData) return res.status(500).json({ error: "Failed to fetch live data" });

    const champions = getChampionData(liveData);
    const cooldownData = await getChampionCooldowns(champions);
    res.json(cooldownData);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
