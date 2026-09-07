fetch('https://www.farming-simulator.com/mod.php?mod_id=315279').then(r => r.text()).then(html => { 
    console.log('External:', html.includes('extern-dl')); 
    const match = html.match(/href=[\"'](.*?\.zip)[\"']/i); 
    console.log('Zip:', match ? match[1] : null); 
});
