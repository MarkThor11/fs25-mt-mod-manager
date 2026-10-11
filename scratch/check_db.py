import sqlite3
import json
import os

db_path = r'C:\Users\Mark\AppData\Roaming\Electron\modhub-cache.db'
bundled_path = r'c:\Users\Mark\Desktop\GoogleModManager\src\main\resources\bundled_cache.json'

print("DB Path exists:", os.path.exists(db_path))
print("Bundled Path exists:", os.path.exists(bundled_path))

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # Load existing bundled cache
    with open(bundled_path, 'r', encoding='utf-8') as f:
        bundled = json.load(f)
    
    print("Initial bundled cache size:", len(bundled))
    
    # Read cache rows
    c.execute("SELECT key, value FROM cache WHERE key LIKE 'mods_%' OR key LIKE 'modDetail_%'")
    rows = c.fetchall()
    print("Cache rows found in DB:", len(rows))
    
    added_count = 0
    for key, value in rows:
        try:
            data = json.loads(value)
            if key.startswith('modDetail_') and isinstance(data, dict) and data.get('modId'):
                mod_id = str(data['modId']).lstrip('0')
                if mod_id and mod_id not in bundled:
                    bundled[mod_id] = data
                    added_count += 1
            elif isinstance(data, dict) and isinstance(data.get('mods'), list):
                for m in data['mods']:
                    if isinstance(m, dict) and m.get('modId'):
                        mod_id = str(m['modId']).lstrip('0')
                        if mod_id and mod_id not in bundled:
                            bundled[mod_id] = m
                            added_count += 1
        except Exception as e:
            pass
            
    # Read mod_tracking rows
    c.execute("SELECT mod_id, local_file_name, local_version, modhub_title, category, hp, price, technical_data FROM mod_tracking")
    tracks = c.fetchall()
    print("Mod tracking rows found in DB:", len(tracks))
    
    for row in tracks:
        mod_id, local_file_name, local_version, modhub_title, category, hp, price, tech_data_str = row
        if mod_id:
            mod_id_str = str(mod_id).lstrip('0')
            if mod_id_str not in bundled:
                tech_data = None
                if tech_data_str:
                    try:
                        tech_data = json.loads(tech_data_str)
                    except:
                        pass
                bundled[mod_id_str] = {
                    "modId": mod_id_str,
                    "title": modhub_title,
                    "category": category,
                    "fileName": local_file_name,
                    "version": local_version,
                    "techData": tech_data or ({"hp": hp, "price": price} if hp or price else None)
                }
                added_count += 1

    print("New total entries in bundled cache:", len(bundled))
    print("Added new entries:", added_count)
    
    # Save back to bundled_cache.json
    with open(bundled_path, 'w', encoding='utf-8') as f:
        json.dump(bundled, f, indent=2)
    print("Successfully updated bundled_cache.json on disk!")
