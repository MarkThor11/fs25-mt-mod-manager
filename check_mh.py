import urllib.request, re
try:
    url = 'https://www.farming-simulator.com/mod.php?mod_id=315279'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    cat = re.search(r'Category:.*?<a.*?>(.*?)</a>', html, re.DOTALL | re.IGNORECASE)
    if not cat:
        cat = re.search(r'Category(?:.*?)</p>\s*<p>(.*?)</p>', html, re.DOTALL | re.IGNORECASE)
    print('HTML snippet around Category:')
    idx = html.find('Category')
    if idx != -1:
        print(html[idx-50:idx+200])
except Exception as e:
    print('Error:', e)
