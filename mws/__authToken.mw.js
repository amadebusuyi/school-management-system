const readToken = (headers = {}) => {
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }

    return headers.token || headers['x-access-token'] || null;
};

module.exports = ({ managers }) => {
    return async ({ req, res, next }) => {
        const token = readToken(req.headers || {});
        if (!token) {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 401, errors: ['authorization token is required'] });
        }

        let decoded = null;
        try {
            decoded = managers.token.verifyLongToken({ token });
        } catch (_) {
            decoded = null;
        }

        if (!decoded || !decoded.userId) {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 401, errors: ['invalid or expired token'] });
        }

        const user = await managers.auth.getUserById(decoded.userId);
        if (!user || user.status !== 'active') {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 401, errors: ['user not found or inactive'] });
        }

        next({
            userId: user.id,
            role: user.role,
            schoolId: user.schoolId || null,
            email: user.email,
            name: user.name,
        });
    };
};
