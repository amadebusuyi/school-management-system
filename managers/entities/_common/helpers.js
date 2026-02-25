const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cleanString = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim();
};

const normalizeEmail = (email) => cleanString(email).toLowerCase();

const isValidEmail = (email) => EMAIL_REGEX.test(normalizeEmail(email));

const ensureArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
};

const nowIso = () => new Date().toISOString();

module.exports = {
    cleanString,
    normalizeEmail,
    isValidEmail,
    ensureArray,
    nowIso,
};
