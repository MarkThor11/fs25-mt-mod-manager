import os
import re

docs = os.path.expanduser('~/Documents/My Games/FarmingSimulator2025')
if not os.path.exists(docs):
    docs = os.path.expanduser('~/Documents/My Games/FarmingSimulator2022')

print('Docs path:', docs)

for i in range(1, 30):
    sg = os.path.join(docs, f'savegame{i}')
    if os.path.exists(sg):
        career = os.path.join(sg, 'careerSavegame.xml')
        farms = os.path.join(sg, 'farms.xml')
        print(f'=== savegame{i} ===')
        if os.path.exists(career):
            with open(career, 'r', encoding='utf-8', errors='ignore') as f:
                txt = f.read()
                m1 = re.search(r'<playerName>(.*?)</playerName>', txt)
                m2 = re.search(r'playerName="(.*?)"', txt)
                print('  careerSavegame.xml:', m1.group(1) if m1 else (m2.group(1) if m2 else 'NONE'))
        else:
            print('  careerSavegame.xml: NOT FOUND')
            
        if os.path.exists(farms):
            with open(farms, 'r', encoding='utf-8', errors='ignore') as f:
                txt = f.read()
                nicknames = re.findall(r'lastNickname="(.*?)"', txt)
                print('  farms.xml lastNickname:', nicknames)
        else:
            print('  farms.xml: NOT FOUND')
