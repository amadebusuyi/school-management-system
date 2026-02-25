module.exports = ({ managers }) => {
    return ({ res, results, next }) => {
        const principal = results.__authToken;
        if (!principal) {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 401, errors: ['unauthorized'] });
        }

        if (!['superadmin', 'school_admin'].includes(principal.role)) {
            return managers.responseDispatcher.dispatch(res, { ok: false, code: 403, errors: ['administrator role required'] });
        }

        next(principal);
    };
};
