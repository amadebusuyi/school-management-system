module.exports = class ResponseDispatcher {
    dispatch(res, { ok, data, code, errors, message, msg }) {
        const statusCode = code ? code : ok === true ? 200 : 400;
        const payload = {
            ok: ok || false,
            data: data || {},
            errors: errors || [],
            message: msg || message || '',
        };

        if (res && typeof res.status === 'function' && typeof res.send === 'function') {
            res.status(statusCode).send(payload);
        }

        if (res && typeof res.__resolve === 'function') {
            res.__resolve({ statusCode, body: payload });
        }

        return payload;
    }
};
