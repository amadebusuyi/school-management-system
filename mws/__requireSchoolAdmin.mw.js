module.exports = ({ managers }) => {
    return ({ res, results, next }) => {
        const principal = results.__authToken;
        if (!principal) {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 401, errors: ['unauthorized'] });
        }

        if (principal.role !== 'school_admin') {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 403, errors: ['school_admin role required'] });
        }

        next(principal);
    };
};
