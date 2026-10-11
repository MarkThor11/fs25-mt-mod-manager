import os, xml.etree.ElementTree as ET

docs = os.path.expanduser('~/Documents/My Games/FarmingSimulator2025')
slots = []

for i in range(1, 15):
    sg = os.path.join(docs, f'savegame{i}')
    if os.path.exists(sg):
        sp_name = None
        mp_name = None
        career = os.path.join(sg, 'careerSavegame.xml')
        farms = os.path.join(sg, 'farms.xml')
        if os.path.exists(career):
            try:
                tree = ET.parse(career)
                pn = tree.find('.//playerName')
                if pn is not None and pn.text and pn.text not in ['Farmer', 'Player']:
                    sp_name = pn.text
            except: pass
        if os.path.exists(farms):
            try:
                tree = ET.parse(farms)
                for p in tree.findall('.//player'):
                    nick = p.get('lastNickname')
                    if nick and nick != 'Farm Member':
                        mp_name = nick
                        break
            except: pass
        slots.append({'index': i, 'singlePlayerName': sp_name, 'mpPlayerName': mp_name, 'playerName': sp_name or 'Farmer'})

canonical = next((s['singlePlayerName'] for s in slots if s['singlePlayerName']), None)
print('Canonical Single Player Name found across saves:', canonical)
for s in slots:
    if not s['singlePlayerName']:
        s['singlePlayerName'] = canonical
        s['playerName'] = canonical or 'Farmer'
    print(f"Slot {s['index']}: playerName={s['playerName']} (SP={s['singlePlayerName']}, MP={s['mpPlayerName']})")

spSave = next((s for s in slots if s['singlePlayerName'] and s['singlePlayerName'] != 'Farmer'), None)
heroName = spSave['singlePlayerName'] if spSave else 'Farmer'
print('>>> Hero greeting name will be:', heroName)
