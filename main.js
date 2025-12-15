import Logger from './logger.js';
import fs from 'fs';
import ms from 'ms';
import axios from 'axios';
import pkg from './package.json' with { type: 'json' };

let proxyConf;
if (process.env.NODE_ENV === 'development') {
    const dotenv = await import('dotenv');
    dotenv.config();

    //  docker run --rm -it --name=proxyserver --network=media -p 8676:8888 vimagick/tinyproxy
    proxyConf = {
        host: '192.168.1.208',
        port: 8676
    }
}

const {
    DEBUG,
    RADARR_URL,
    RADARR_KEY,
    RADARR_HDR_ALLOW_PROFILE,
    SONARR_URL,
    SONARR_KEY,
    SONARR_HDR_ALLOW_PROFILE,
    CHECK_INTERVAL,
    NTFY_URL,
    NTFY_AUTH,
} = process.env;

const radarrApi = axios.create({
    baseURL: `${RADARR_URL}/api/v3`,
    proxy: proxyConf || {},
    headers: {
        'X-Api-Key': RADARR_KEY,
    }
});

const sonarrApi = axios.create({
    baseURL: `${SONARR_URL}/api/v3`,
    proxy: proxyConf || {},
    headers: {
        'X-Api-Key': SONARR_KEY,
    }
});

const sendNtfy = async (title, tag, message) => {
    await axios.post(NTFY_URL, message, {
        headers: {
            "Title": title,
            "Tags": tag,
            "Markdown": "yes",
            "Authorization": NTFY_AUTH ? `Bearer ${NTFY_AUTH}` : ''
        }
    });
}

const log = new Logger(pkg.name, DEBUG === 'true');

const main = async () => {
    log.info('Performing check for unexpected HDR media...');

    try {
        if (!fs.existsSync('lastcheck.txt')) {
            fs.writeFileSync('lastcheck.txt', new Date().toISOString());
        }

        const lastCheck = fs.readFileSync('lastcheck.txt', 'utf-8');

        const historyParams = {
            date: lastCheck,
            eventType: 'downloadFolderImported',
        }

        const radarrHistory = (await radarrApi('/history/since', { params: historyParams })).data;
        const sonarrHistory = (await sonarrApi('/history/since', { params: historyParams })).data;
    
        const expectedSDRMovies = (await Promise.all(radarrHistory
                .map(movie => radarrApi(`/movie/${movie.movieId}`))
                .map(req => req.then(res => res.data))))
                .filter(movie => movie.qualityProfileId == RADARR_HDR_ALLOW_PROFILE)
        const expectedSDREpisodes = (await Promise.all(sonarrHistory
                .map(episode => sonarrApi(`/episode/${episode.episodeId}`))
                .map(req => req.then(res => res.data))))
                .filter(episode => episode.qualityProfileId == SONARR_HDR_ALLOW_PROFILE);

        const allItems = [...expectedSDRMovies, ...expectedSDREpisodes];

        const unexpectedHdrItems = allItems.filter(item => item.movieFile?.mediaInfo?.videoDynamicRange === 'HDR');
        log.info(`Found ${unexpectedHdrItems.length} unexpected HDR items.`);

        for (const item of unexpectedHdrItems) {
            log.info(`Found unexpected HDR download for ${item.title}.`);
            await sendNtfy(
                'Unexpected HDR Media Detected',
                'warning',
                `The following media was downloaded in HDR but is expected to be SDR: ${item.movieFile.relativePath}. Performing blacklist and search...`
            );
        }
    } catch (err) {
        log.error(err);
    }

    fs.writeFileSync('lastcheck.txt', new Date().toISOString());

    setInterval(main, ms(CHECK_INTERVAL));
}

log.info(`Starting ${pkg.name}_v${pkg.version}`);

main();