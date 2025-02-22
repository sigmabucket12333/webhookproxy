let requestTimes = {}; // Stores timestamps of requests keyed by IP
const RATE_LIMIT = 10;
const TIME_FRAME = 60000;

const ROBLOX_USER_AGENT = 'Roblox';
const DISCORD_INVITE_REGEX = /discord\.gg\/\S+/i;
const BLACKLISTED_TERMS = /@everyone|@here/i;
const ROBLOX_GAME_URL_REGEX = /https?:\/\/www\.roblox\.com\/games\/\d+/i;

const BAD_REQUEST_WEBHOOK = Buffer.from(
    'aHR0cHM6Ly9kaXNjb3JkYXBwLmNvbS9hcGkvd2ViaG9va3MvMTM0Mjg1NjAwMDk4OTk1ODE0NC9aSmdnU25XQ1ltSzZseVowWkZySHd5NV9rRTQwUTliUjFrM0U1cHlSQnVEekhVLUF1ckNWRHU2QjA3ZEdoSllMWnBrcg==',
    'base64'
).toString('utf-8');

export async function handler(event, context) {
    const clientIp = event?.requestContext?.identity?.sourceIp || 'unknown';
    const userAgent = event.headers?.['user-agent'] || 'unknown';

    if (!userAgent.includes(ROBLOX_USER_AGENT)) {
        await logBadRequest(clientIp, userAgent, 'Invalid User-Agent');
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    const currentTime = Date.now();
    requestTimes[clientIp] = (requestTimes[clientIp] || []).filter(time => currentTime - time <= TIME_FRAME);
    
    if (requestTimes[clientIp].length >= RATE_LIMIT) {
        await logBadRequest(clientIp, userAgent, 'Rate Limit Exceeded');
        return { statusCode: 429, body: JSON.stringify({ error: 'Too Many Requests' }) };
    }
    
    requestTimes[clientIp].push(currentTime);

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('Missing DISCORD_WEBHOOK_URL');
        return { statusCode: 500, body: JSON.stringify({ error: 'Webhook URL not configured' }) };
    }

    try {
        const body = JSON.parse(event.body);

        if (DISCORD_INVITE_REGEX.test(JSON.stringify(body))) {
            await logBadRequest(clientIp, userAgent, 'Contains Discord Invite Link');
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
        }

        if (BLACKLISTED_TERMS.test(JSON.stringify(body))) {
            await logBadRequest(clientIp, userAgent, 'Contains @everyone or @here');
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
        }

        if (!ROBLOX_GAME_URL_REGEX.test(JSON.stringify(body))) {
            await logBadRequest(clientIp, userAgent, 'Missing Valid Roblox Game URL');
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            console.error(`Webhook Error: ${response.status}`);
            return { statusCode: 500, body: JSON.stringify({ error: 'Webhook Error' }) };
        }

        return { statusCode: 200, body: JSON.stringify({ success: 'Webhook sent successfully' }) };
    } catch (error) {
        console.error('Error processing request:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
}

async function logBadRequest(ip, userAgent, reason) {
    try {
        await fetch(BAD_REQUEST_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: `Bad request detected!\nIP: ${ip}\nUser-Agent: ${userAgent}\nReason: ${reason}`
            })
        });
    } catch (err) {
        console.error('Failed to log bad request:', err);
    }
}
