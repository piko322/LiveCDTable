# %% ----------------------------- IMPORTS ------------------------------------
import os
import json
import requests
import urllib3
import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd

# Disable SSL warnings for localhost Riot endpoint
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# URLs
LIVE_URL = 'https://127.0.0.1:2999/liveclientdata/allgamedata'
DDRAGON_API = 'https://ddragon.leagueoflegends.com/api/versions.json'
DDRAGON_BASE = 'https://ddragon.leagueoflegends.com/cdn'
MERAKI_BASE = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions/'

# Timeout for requests
TIMEOUT = 5


# %% -------------------------- BASIC HELPERS ---------------------------------
def get_live_data():
    """Fetch live game data with SSL verification disabled."""
    try:
        r = requests.get(LIVE_URL, verify=False, timeout=TIMEOUT)
        return r.json()
    except Exception as e:
        print("Error fetching live data:", e)
        return None


def get_ddragon_latest_version():
    """Fetch the latest Data Dragon version once."""
    try:
        r = requests.get(DDRAGON_API, timeout=TIMEOUT)
        versions = r.json()
        return versions[0] if versions else None
    except Exception as e:
        print("Error fetching Data Dragon version:", e)
        return None


# %% ---------------------- CHAMPION DATA FETCHERS ----------------------------
def get_champion_data(live_data):
    """Extract champion names for Blue and Red teams from live data."""
    out = {'Blue': [], 'Red': []}
    for player in live_data.get('allPlayers', []):
        champ = player.get('championName')
        team = 'Blue' if player.get('team') == 'ORDER' else 'Red'
        out[team].append(champ)
    return out


def get_champion_cooldown(champion_name):
    """Fetch champion cooldown data from Meraki."""
    try:
        if champion_name == 'Wukong':
            champion_name = 'monkeyKing'

        r = requests.get(f"{MERAKI_BASE}{champion_name}.json", timeout=TIMEOUT)
        data = r.json()
        abilities = data.get('abilities', {})
        champ_icon = data.get('icon')

        cooldowns = {'champIcon': champ_icon}
        for spell_key, spell_list in abilities.items():
            if spell_key == 'P':  # skip passive
                continue

            spell = spell_list[0]
            cd_text = 'No CD'

            if 'cooldown' in spell and spell['cooldown']:
                spell_cds = spell['cooldown']['modifiers'][0]['values']
                if all(cd == spell_cds[0] for cd in spell_cds):
                    cd_text = f"{spell_cds[0]} all ranks"
                else:
                    cd_text = " / ".join(str(cd) for cd in spell_cds)

            # Add recharge info if present
            if 'rechargeRate' in spell and spell['rechargeRate']:
                rr = spell['rechargeRate']
                if all(rate == rr[0] for rate in rr):
                    recharge_text = f"{rr[0]} all ranks"
                else:
                    recharge_text = " / ".join(str(rate) for rate in rr)
                cd_text += f" <br> recharge: <br> {recharge_text}"

            cooldowns[spell_key] = cd_text

        return cooldowns
    except Exception:
        return {}


def get_champion_cooldown_ddragon(champion_name, version):
    """Fetch champion cooldown data from Data Dragon."""
    try:
        if champion_name == 'Wukong':
            champion_name = 'monkeyKing'

        url = f"{DDRAGON_BASE}/{version}/data/en_US/champion/{champion_name}.json"
        r = requests.get(url, timeout=TIMEOUT)
        champ_data = r.json().get('data', {}).get(champion_name, {})

        image_full = champ_data.get('image', {}).get('full', '')
        champ_icon = f"{DDRAGON_BASE}/{version}/img/champion/{image_full}"
        print(f"{champion_name} icon URL: {champ_icon}")
        champ_spells = champ_data.get('spells', [])

        cooldowns = {'champIcon': champ_icon}
        for i, spell in enumerate(champ_spells[:4]):
            spell_cds = spell.get('cooldown', [])
            if not spell_cds:
                continue
            if all(cd == spell_cds[0] for cd in spell_cds):
                cd_text = f"{spell_cds[0]} all ranks"
            else:
                cd_text = " / ".join(str(cd) for cd in spell_cds)
            cooldowns[["Q", "W", "E", "R"][i]] = cd_text

        return cooldowns
    except Exception:
        return {}


# %% ------------------------- NAME UTILITIES ---------------------------------
def get_all_champion_names(meraki=True):
    """Fetch a list of all champion names."""
    if meraki:
        try:
            url = f"https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json"  # remove 'champions/' part
            r = requests.get(url, timeout=TIMEOUT)
            return list(r.json().keys())
        except Exception as e:
            print("Error fetching champion list from Meraki:", e)
            return []
    else:
        try:
            r = requests.get(DDRAGON_API, timeout=TIMEOUT)
            latest = r.json()[0]
            url = f"{DDRAGON_BASE}/{latest}/data/en_US/champion.json"
            data = requests.get(url, timeout=TIMEOUT).json()
            return list(data.get('data', {}).keys())
        except Exception as e:
            print("Error fetching champion list from Data Dragon:", e)
            return []


def levenshtein_distance(a, b):
    """Compute Levenshtein distance between two strings."""
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        dp[i][0] = i
    for j in range(len(b) + 1):
        dp[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            dp[i][j] = dp[i - 1][j - 1] if a[i - 1] == b[j - 1] else min(
                dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]) + 1
    return dp[-1][-1]


def find_closest_match(champ_name, meraki=True):
    """Find closest matching champion name."""
    all_champs = get_all_champion_names(meraki=meraki)
    best, dist = None, float("inf")
    for c in all_champs:
        d = levenshtein_distance(champ_name.lower(), c.lower())
        if d < dist:
            best, dist = c, d
    return best


def champion_cooldowns_renamed(champion_cooldowns):
    """Rename champion keys for readability."""
    out = {}
    for champ, data in champion_cooldowns.items():
        new_name = 'Wukong' if champ == 'monkeyKing' else ''.join(
            [f" {c}" if c.isupper() else c for c in champ]).strip()
        if champ == 'Aphelios':
            data['Q'] = (
                "I just can't man, this dude has like 5 different Q abilities\n"
                "and it's formatted in such a messed up way that I give up"
            )
        out[new_name] = data
    return out


# %% --------------------- CONCURRENT FETCH LOGIC -----------------------------
def get_champion_cooldowns(champions, version, max_workers=16):
    """Fetch champion cooldown data concurrently."""
    if not isinstance(champions, dict):
        champions = {'Blue': champions, 'Red': []}

    champion_cooldowns = {}
    team_champ_dict = {}

    all_champs = champions['Blue'] + champions['Red']
    total = len(all_champs)
    bar = tqdm.tqdm(total=total, desc="Fetching cooldowns", unit="champion")

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(get_champion_cooldown, champ): champ for champ in all_champs}

        for future in as_completed(futures):
            champ = futures[future]
            team_champ_dict[champ] = 'Blue' if champ in champions['Blue'] else 'Red'
            try:
                data = future.result()
                if not data:
                    data = get_champion_cooldown_ddragon(champ, version)
                if not data:
                    # fallback to closest match
                    closest = find_closest_match(champ)
                    data = get_champion_cooldown(closest) or get_champion_cooldown_ddragon(closest, version)
                champion_cooldowns[champ] = data
            except Exception as e:
                print(f"Error fetching {champ}: {e}")
                champion_cooldowns[champ] = {}
            bar.update(1)

    bar.close()
    return champion_cooldowns, team_champ_dict


# %% ----------------------- MANIFEST GENERATION ------------------------------
def generate_manifest(version):
    manifest = {
        "currentVersion": version,
        "currentFile": f"champion_cooldowns_{version}.json",
    }
    os.makedirs("data", exist_ok=True)
    with open("data/manifest.json", "w") as f:
        json.dump(manifest, f, indent=4)
    print(f"Manifest saved to data/manifest.json")


# %% ----------------------------- MAIN EXEC ----------------------------------
if __name__ == "__main__":
    current_version = get_ddragon_latest_version()
    print(f"Current Data Dragon version: {current_version}")
    fp = f"data/champion_cooldowns_{current_version}.json"

    os.makedirs("data", exist_ok=True)

    if not os.path.exists(fp):
        print(f"File {fp} not found — generating new cooldown dataset...")
        all_champs = get_all_champion_names(meraki=True)
        if all_champs:
            cooldowns, _ = get_champion_cooldowns(all_champs, current_version)
            cooldowns = champion_cooldowns_renamed(cooldowns)
            with open(fp, "w") as f:
                json.dump(cooldowns, f, indent=4)
            print(f"Cooldown data saved to {fp}.")
        else:
            print("No champion data available.")
    else:
        print(f"File {fp} already exists — skipping rebuild.")

    generate_manifest(current_version)
