module.exports = ({ managers }) => {
    return ({ req, res, next }) => {
        const token = req.headers && (req.headers.token || req.headers['x-access-token']);
        if (!token) {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 401, errors: ['unauthorized'] });
        }

        let decoded = null;
        try {
            decoded = managers.token.verifyShortToken({ token });
        } catch (_) {
            decoded = null;
        }

        if (!decoded) {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 401, errors: ['unauthorized'] });
        }

        next(decoded);
    };
};
