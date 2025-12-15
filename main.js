import Logger from './logger.js';
import pkg from './package.json' with { type: 'json' };

if (process.env.NODE_ENV === 'development') {
    const dotenv = await import('dotenv');
    dotenv.config();
}

const {
    DEBUG    
} = process.env;

const log = new Logger(pkg.name, DEBUG === 'true');

const main = async () => {

}

main();

log.info(`Starting ${pkg.name}_${pkg.version}`);