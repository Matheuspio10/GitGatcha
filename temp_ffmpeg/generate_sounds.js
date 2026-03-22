const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const outDir = path.join(__dirname, '../public/sounds');

// Ensure directories exist
['general', 'battle', 'collection', 'store', 'notifications', 'booster', 'hacking'].forEach(cat => {
    fs.mkdirSync(path.join(outDir, cat), { recursive: true });
});

const sounds = [
    // General
    { name: 'general/nav_whoosh', filter: 'sine=f=800:d=0.15,afade=t=in:ss=0:d=0.01,afade=t=out:ss=0.05:d=0.1' }, // fake whoosh
    { name: 'general/button_click_primary', filter: 'sine=f=1200:d=0.05,afade=t=out:ss=0:d=0.05' },
    { name: 'general/button_click_secondary', filter: 'sine=f=800:d=0.05,afade=t=out:ss=0:d=0.05' },
    { name: 'general/tab_switch', filter: 'sine=f=2000:d=0.03,afade=t=out:ss=0:d=0.03' },
    { name: 'general/modal_open', filter: 'sine=f=400:d=0.1,afade=t=in:ss=0:d=0.05,afade=t=out:ss=0.05:d=0.05' },
    { name: 'general/modal_close', filter: 'sine=f=200:d=0.1,afade=t=out:ss=0:d=0.1' },
    { name: 'general/hover_tick', filter: 'sine=f=3000:d=0.02,afade=t=out:ss=0:d=0.02,volume=0.1' },
    { name: 'general/error_buzzer', filter: 'sawtooth=f=150:d=0.2,afade=t=out:ss=0.1:d=0.1' },
    { name: 'general/success_chime', filter: 'sine=f=880:d=0.15,afade=t=out:ss=0.05:d=0.1' }, // just one beep for now

    // Battle
    { name: 'battle/battle_start', filter: 'sawtooth=f=200:d=1.0,afade=t=in:ss=0:d=1.0' },
    { name: 'battle/stat_win', filter: 'square=f=1200:d=0.1,afade=t=out:ss=0:d=0.1' },
    { name: 'battle/stat_loss', filter: 'triangle=f=150:d=0.15,afade=t=out:ss=0:d=0.15' },
    { name: 'battle/battle_win', filter: 'sine=f=880:d=2.0,afade=t=out:ss=1.0:d=1.0' },
    { name: 'battle/battle_loss', filter: 'sawtooth=f=150:d=1.5,afade=t=out:ss=0.5:d=1.0' },
    { name: 'battle/rating_gain', filter: 'sine=f=1500:d=0.05,afade=t=out:ss=0:d=0.05' },
    { name: 'battle/rating_loss', filter: 'triangle=f=200:d=0.1,afade=t=out:ss=0:d=0.1' },
    { name: 'battle/rank_promotion', filter: 'square=f=880:d=3.0,afade=t=out:ss=2.0:d=1.0' },

    // Booster
    { name: 'booster/pack_select', filter: 'anoisesrc=d=0.2:a=0.5,afade=t=out:ss=0.1:d=0.1' },
    { name: 'booster/card_common', filter: 'sine=f=600:d=0.15,afade=t=out:ss=0:d=0.15' },
    { name: 'booster/card_uncommon', filter: 'sine=f=800:d=0.2,afade=t=out:ss=0.1:d=0.1' },
    { name: 'booster/card_rare', filter: 'sine=f=1000:d=0.3,afade=t=out:ss=0.2:d=0.1' },
    { name: 'booster/card_epic', filter: 'sawtooth=f=800:d=0.4,afade=t=out:ss=0.2:d=0.2' },
    { name: 'booster/card_legendary', filter: 'square=f=200:d=1.0,afade=t=in:ss=0:d=0.1,afade=t=out:ss=0.5:d=0.5' },
    
    // Hacking
    { name: 'hacking/node_click', filter: 'square=f=800:d=0.06,afade=t=out:ss=0:d=0.06' },
    { name: 'hacking/path_segment', filter: 'sine=f=1200:d=0.08,afade=t=out:ss=0:d=0.08' },
    { name: 'hacking/puzzle_complete', filter: 'sine=f=880:d=0.5,afade=t=out:ss=0:d=0.5' },
    { name: 'hacking/access_granted', filter: 'sawtooth=f=200:d=1.0,afade=t=out:ss=0:d=1.0' },
    { name: 'hacking/firewall_alarm', filter: 'sawtooth=f=900:d=0.18,afade=t=out:ss=0:d=0.18' },

    // Collection/Shop
    { name: 'collection/deck_add', filter: 'sine=f=800:d=0.1,afade=t=out:ss=0:d=0.1' },
    { name: 'collection/deck_remove', filter: 'sine=f=400:d=0.1,afade=t=out:ss=0:d=0.1' },
    { name: 'collection/card_detail', filter: 'sine=f=300:d=0.3,afade=t=in:ss=0:d=0.1,afade=t=out:ss=0.1:d=0.2' },
    { name: 'collection/card_dismantle', filter: 'anoisesrc=d=0.2:a=0.5,afade=t=out:ss=0:d=0.2' },
    { name: 'collection/duplicate', filter: 'triangle=f=600:d=0.2,afade=t=out:ss=0:d=0.2' },
    { name: 'store/purchase', filter: 'sine=f=1500:d=0.3,afade=t=in:ss=0:d=0.1,afade=t=out:ss=0.1:d=0.2' },
    { name: 'store/currency_gain', filter: 'sine=f=2000:d=0.1,afade=t=out:ss=0:d=0.1' },

    // Notifications
    { name: 'notifications/friend_request', filter: 'sine=f=800:d=0.3,afade=t=out:ss=0:d=0.3' },
    { name: 'notifications/challenge', filter: 'square=f=1000:d=0.4,afade=t=out:ss=0:d=0.4' },
    { name: 'notifications/system', filter: 'sine=f=400:d=0.3,afade=t=out:ss=0:d=0.3' },
];

function generateFile(def, format, commandName) {
    const file = path.join(outDir, `${def.name}.${format}`);
    // ffmpeg -f lavfi -i "sine=f=1000:d=0.1" out.webm
    const lavfi = `"${def.filter}"`;
    const cmd = `"${ffmpeg}" -f lavfi -i ${lavfi} -y -c:a ${format === 'webm' ? 'libopus' : 'libmp3lame'} -b:a 64k "${file}"`;
    try {
        console.log(`Generating ${file}...`);
        execSync(cmd, { stdio: 'pipe' });
    } catch (e) {
        console.error(`Failed: ${def.name}.${format}`, e.message);
    }
}

sounds.forEach(s => {
    generateFile(s, 'webm');
    generateFile(s, 'mp3');
});

console.log('All sounds generated.');
