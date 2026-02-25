require('dotenv').config();
const pjson = require('../package.json');
const utils = require('../libs/utils');

const SERVICE_NAME = process.env.SERVICE_NAME ? utils.slugify(process.env.SERVICE_NAME) : pjson.name;
const USER_PORT = process.env.USER_PORT || 5111;
const ADMIN_PORT = process.env.ADMIN_PORT || 5222;
const ADMIN_URL = process.env.ADMIN_URL || `http://localhost:${ADMIN_PORT}`;
const ENV = process.env.ENV || 'development';
const REDIS_URI = process.env.REDIS_URI || 'redis://127.0.0.1:6379';

const CACHE_REDIS = process.env.CACHE_REDIS || REDIS_URI;
const CACHE_PREFIX = process.env.CACHE_PREFIX || `${SERVICE_NAME}:ch`;

const MONGO_URI = process.env.MONGO_URI || `mongodb://localhost:27017/${SERVICE_NAME}`;

const LONG_TOKEN_SECRET = process.env.LONG_TOKEN_SECRET || null;
const SHORT_TOKEN_SECRET = process.env.SHORT_TOKEN_SECRET || null;
const LONG_TOKEN_EXPIRES_IN = process.env.LONG_TOKEN_EXPIRES_IN || '24h';
const SHORT_TOKEN_EXPIRES_IN = process.env.SHORT_TOKEN_EXPIRES_IN || '12h';

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@school.local';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'ChangeMe123!';
const SUPERADMIN_NAME = process.env.SUPERADMIN_NAME || 'System Superadmin';

const RATE_LIMIT_WINDOW_SECONDS = process.env.RATE_LIMIT_WINDOW_SECONDS || 60;
const RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS || 120;

if (!LONG_TOKEN_SECRET || !SHORT_TOKEN_SECRET) {
    throw Error('missing .env variables LONG_TOKEN_SECRET and SHORT_TOKEN_SECRET');
}

const config = require(`./envs/${ENV}.js`);

config.dotEnv = {
    SERVICE_NAME,
    ENV,
    CACHE_REDIS,
    CACHE_PREFIX,
    MONGO_URI,
    USER_PORT,
    ADMIN_PORT,
    ADMIN_URL,
    LONG_TOKEN_SECRET,
    SHORT_TOKEN_SECRET,
    LONG_TOKEN_EXPIRES_IN,
    SHORT_TOKEN_EXPIRES_IN,
    SUPERADMIN_EMAIL,
    SUPERADMIN_PASSWORD,
    SUPERADMIN_NAME,
    RATE_LIMIT_WINDOW_SECONDS,
    RATE_LIMIT_MAX_REQUESTS,
};

module.exports = config;
