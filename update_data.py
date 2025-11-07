import requests
import json
import os
import time

# --- File Paths ---
# Use the correct file structure for the repository
COOLDOWNS_FILE = os.path.join("data", "champion_cooldowns.json")
MANIFEST_FILE = os.path.join("data", "manifest.json")

def get_latest_ddragon_version():
    """Fetches the latest DDragon version string."""
    versions_url = "https://ddragon.leagueoflegends.com/api/versions.json"
    try:
        response = requests.get(versions_url)
        response.raise_for_status()
        return response.json()[0] # The first element is the latest version
    except requests.exceptions.RequestException as e:
        print(f"Error fetching DDragon versions: {e}")
        return None

def fetch_and_process_champion_data(version):
    """
    Fetches champion data and processes it into a simplified cooldowns dictionary.
    """
    data_url = f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/championFull.json"
    
    try:
        response = requests.get(data_url)
        response.raise_for_status()
        all_champ_data = response.json()
        print(f"Successfully fetched champion data for version {version}.")
    except requests.exceptions.RequestException as e:
        print(f"Error fetching full champion data: {e}")
        return None

    champions = all_champ_data.get('data', {})
    cooldowns_data = {}

    for champ_id, champ_details in champions.items():
        champ_name = champ_details['name']
        
        # 'spells' is a list of the 4 skills (Q, W, E, R)
        skills = {}
        for spell in champ_details['spells']:
            spell_name = spell['name']
            
            # Extract and process data
            skills[spell_name] = {
                "cooldowns": spell.get('cooldownBurn', 'N/A'),
                "costs": spell.get('costBurn', 'N/A'),
                "resource": spell.get('costType', 'No Cost').replace(" ", "")
            }
            
        cooldowns_data[champ_name] = skills
            
    return cooldowns_data

def update_data_files():
    """Main function to orchestrate the fetching, processing, and file writing."""
    latest_version = get_latest_ddragon_version()
    if not latest_version:
        print("Failed to get latest version. Exiting.")
        return

    # 1. Fetch and process champion data
    champion_data = fetch_and_process_champion_data(latest_version)
    if not champion_data:
        print("Failed to process champion data. Exiting.")
        return
    
    # Ensure the data directory exists
    os.makedirs(os.path.dirname(COOLDOWNS_FILE), exist_ok=True)
    
    # 2. Write the champion_cooldowns.json file
    with open(COOLDOWNS_FILE, 'w', encoding='utf-8') as f:
        json.dump(champion_data, f, indent=2, ensure_ascii=False)
    print(f"✅ Data written to {COOLDOWNS_FILE}")
    
    # 3. Write the manifest.json file
    manifest_content = {
        "version": latest_version,
        "date_updated": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "champion_data_file": os.path.basename(COOLDOWNS_FILE)
    }
    with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
        json.dump(manifest_content, f, indent=2, ensure_ascii=False)
    print(f"✅ Manifest written to {MANIFEST_FILE}")

if __name__ == "__main__":
    update_data_files()