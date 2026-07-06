export async function onRequest(context) {
    const { request, env } = context;
    const userAgent = request.headers.get('User-Agent') || '';
    const isBot =
        /discordbot|twitterbot|facebookexternalhit|bingbot|googlebot|slurp|whatsapp|pinterest|slackbot|telegrambot|linkedinbot|mastodon|signal|snapchat|redditbot|skypeuripreview|viberbot|linebot|embedly|quora|outbrain|tumblr|duckduckbot|yandexbot|rogerbot|showyoubot|kakaotalk|naverbot|seznambot|mediapartners|adsbot|petalbot|applebot|ia_archiver/i.test(
            userAgent
        );

    if (isBot) {
        const pageUrl = request.url;

        const metaHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Arostream | About</title>
                <meta name="description" content="Free, open-source music streaming. No ads. No tracking.">
                <meta name="theme-color" content="#000000">

                <meta property="og:site_name" content="Arostream">
                <meta property="og:title" content="Arostream | About">
                <meta property="og:description" content="Free, open-source music streaming. No ads. No tracking.">
                <meta property="og:type" content="website">
                <meta property="og:url" content="${pageUrl}">

                <meta name="twitter:card" content="summary">
                <meta name="twitter:title" content="Arostream | About">
                <meta name="twitter:description" content="Free, open-source music streaming. No ads. No tracking.">
            </head>
            <body>
                <h1>Arostream</h1>
                <p>Free, open-source music streaming. No ads. No tracking.</p>
            </body>
            </html>
        `;

        return new Response(metaHtml, {
            headers: { 'content-type': 'text/html;charset=UTF-8' },
        });
    }

    const url = new URL(request.url);
    url.pathname = '/';
    return env.ASSETS.fetch(new Request(url, request));
}
