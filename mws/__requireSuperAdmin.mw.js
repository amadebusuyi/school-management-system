module.exports = ({ managers }) => {
    return ({ res, results, next }) => {
        const principal = results.__authToken;
        if (!principal) {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 401, errors: ['unauthorized'] });
        }

        if (principal.role !== 'superadmin') {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 403, errors: ['superadmin role required'] });
        }

        next(principal);
    };
};
