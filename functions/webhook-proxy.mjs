let requestTimes = {}; // This will store the timestamp of the last request from each client (keyed by IP or unique identifier)
const RATE_LIMIT = 30; // Maximum number of requests allowed (you can adjust this value)
const TIME_FRAME = 60000; // 1 minute (in milliseconds)

const ROBLOX_USER_AGENT = 'Roblox'; // Simple check for Roblox User-Agent
const DISCORD_INVITE_REGEX = /discord\.gg\/\S+/i; // Regex to match Discord invite links
const BLACKLISTED_TERMS = /@everyone|@here/i; // Regex to match @everyone or @here mentions
const ROBLOX_GAME_URL_REGEX = /https?:\/\/www\.roblox\.com\/games\/\d+/i; // Regex to match roblox.com/games/ URL

export async function handler(event, context) {
    const clientIp = event?.requestContext?.identity?.sourceIp || 'unknown'; // Fallback to 'unknown' if IP is missing
    const userAgent = event.headers?.['user-agent'] || 'unknown'; // Fallback to 'unknown' if User-Agent is missing

    // Check if the request comes from Roblox (based on User-Agent)
    if (!userAgent.includes(ROBLOX_USER_AGENT)) {
        console.error(Request rejected: Invalid User-Agent: ${userAgent});
        return {
            statusCode: 403,
            body: JSON.stringify({ error: 'Forbidden: Invalid' }),
        };
    }

    // Initialize rate limit tracking for the client
    const currentTime = Date.now();
    if (!requestTimes[clientIp]) {
        requestTimes[clientIp] = [];
    }

    // Clean up old requests outside of the time frame
    requestTimes[clientIp] = requestTimes[clientIp].filter(time => currentTime - time <= TIME_FRAME);

    // Check rate limit
    if (requestTimes[clientIp].length >= RATE_LIMIT) {
        console.error(Rate limit exceeded for IP: ${clientIp}, User-Agent: ${userAgent});
        return {
            statusCode: 429,
            body: JSON.stringify({ error: 'Too Many Requests' }),
        };
    }

    // Record the current request time
    requestTimes[clientIp].push(currentTime);

    // Retrieve the Discord Webhook URL from the environment variable
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('Missing environment variable: DISCORD_WEBHOOK_URL');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Webhook URL not configured' }),
        };
    }

    try {
        // Parse the request body
        const body = JSON.parse(event.body);
        console.info(Request received from IP: ${clientIp}, User-Agent: ${userAgent}, Payload:, body);

        // Check if the payload contains a Discord invite link (discord.gg or discord.com)
        if (DISCORD_INVITE_REGEX.test(JSON.stringify(body))) {
            console.error(Request rejected: Contains Discord invite link from IP: ${clientIp});
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Forbidden: Error' }),
            };
        }

        // Check if the payload contains blacklisted terms like @everyone or @here
        if (BLACKLISTED_TERMS.test(JSON.stringify(body))) {
            console.error(Request rejected: Contains blacklisted term (@everyone/@here) from IP: ${clientIp});
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Forbidden: Error' }),
            };
        }

        // Check if the message contains the Roblox game URL
        if (!ROBLOX_GAME_URL_REGEX.test(JSON.stringify(body))) {
            console.error(Request rejected: Does not contain a valid Roblox game URL from IP: ${clientIp});
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Forbidden: Error' }),
            };
        }

        // Send the payload to the Discord webhook
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        // Check for response errors
        if (!response.ok) {
            const responseBody = await response.text(); // Retrieve the response body for debugging
            console.error(Failed to send webhook. Status: ${response.status}, Body: ${responseBody});
            return {
                statusCode: 500,
                body: JSON.stringify({ error: Failed to send webhook: ${response.status} }),
            };
        }

        console.info('Webhook sent successfully');
        return {
            statusCode: 200,
            body: JSON.stringify({ success: 'Webhook sent successfully' }),
        };
    } catch (error) {
        // Log the error for debugging
        console.error('Error occurred while handling the request:', {
            message: error.message,
            stack: error.stack,
        });

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                details: error.message,
            }),
        };
    }
}
