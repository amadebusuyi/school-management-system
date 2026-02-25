const useragent = require('useragent');
const requestIp = require('request-ip');

module.exports = () => {
    return ({ req, next }) => {
        let ip = req.clientIp || 'N/A';
        let agent = req.headers ? req.headers['user-agent'] || req.headers['User-Agent'] : 'N/A';

        try {
            if (!req.clientIp) {
                ip = requestIp.getClientIp(req) || ip;
            }
        } catch (_) {
            // no-op
        }

        try {
            agent = useragent.lookup(agent || '').toString();
        } catch (_) {
            agent = agent || 'N/A';
        }

        next({ ip, agent });
    };
};
