const readToken = (headers = {}) => {
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    return headers.token || headers['x-access-token'] || null;
};

module.exports = ({ managers }) => {
    return ({ req, res, next }) => {
        const token = readToken(req.headers || {});
        if (!token) {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 401, errors: ['unauthorized'] });
        }

        let decoded = null;
        try {
            decoded = managers.token.verifyLongToken({ token });
        } catch (_) {
            decoded = null;
        }

        if (!decoded) {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 401, errors: ['unauthorized'] });
        }

        next(decoded);
    };
};
