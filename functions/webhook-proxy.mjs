let requestTimes = {}; // This will store the timestamp of the last request from each client (keyed by IP or unique identifier)
const RATE_LIMIT = 10; // Maximum number of requests allowed (you can adjust this value)
const TIME_FRAME = 60000; // 1 minute (in milliseconds)

export async function handler(event, context) {
    const userAgent = event.headers['user-agent'] || '';
    const clientIp = event.requestContext.identity.sourceIp;  // Using IP address for rate limiting (could also use a unique ID)

    // Rate limiting logic
    const currentTime = Date.now();
    if (!requestTimes[clientIp]) {
        requestTimes[clientIp] = [];
    }

    // Remove requests older than the TIME_FRAME
    requestTimes[clientIp] = requestTimes[clientIp].filter(time => currentTime - time <= TIME_FRAME);

    if (requestTimes[clientIp].length >= RATE_LIMIT) {
        return {
            statusCode: 429,
            body: JSON.stringify({ error: 'Too Many Requests' }),
        };
    }

    // Record the current request time
    requestTimes[clientIp].push(currentTime);

    // Use the Discord Webhook URL from environment variable
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Webhook URL not configured' }),
        };
    }

    try {
        const body = JSON.parse(event.body);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to send webhook' }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: 'Webhook sent successfully' }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
}
