// src/search/tokenize.ts — Chinese (trigram) + English word tokenization
/**
 * Detect if a character is Chinese (CJK Unified Ideographs).
 */
function isChinese(ch) {
    const code = ch.charCodeAt(0);
    return code >= 0x4e00 && code <= 0x9fff;
}
/**
 * Generate trigrams for a Chinese text segment.
 */
function trigrams(text) {
    const result = [];
    for (let i = 0; i <= text.length - 3; i++) {
        result.push(text.slice(i, i + 3));
    }
    // Also include bigrams for short words
    for (let i = 0; i <= text.length - 2; i++) {
        result.push(text.slice(i, i + 2));
    }
    return result;
}
/**
 * Tokenize text into searchable tokens.
 * - Chinese: trigram decomposition
 * - English: lowercase word split
 * - Mixed: segment and process each part
 */
export function tokenize(text) {
    const tokens = [];
    let chineseBuffer = '';
    let englishBuffer = '';
    function flushChinese() {
        if (chineseBuffer.length > 0) {
            tokens.push(...trigrams(chineseBuffer));
            chineseBuffer = '';
        }
    }
    function flushEnglish() {
        if (englishBuffer.length > 0) {
            const words = englishBuffer.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 0);
            tokens.push(...words);
            englishBuffer = '';
        }
    }
    for (const ch of text) {
        if (isChinese(ch)) {
            flushEnglish();
            chineseBuffer += ch;
        }
        else {
            flushChinese();
            englishBuffer += ch;
        }
    }
    flushChinese();
    flushEnglish();
    return tokens;
}
/**
 * Build a document frequency map from a set of tokenized documents.
 */
export function buildDFMap(tokenizedDocs) {
    const df = new Map();
    for (const doc of tokenizedDocs) {
        const unique = new Set(doc);
        for (const token of unique) {
            df.set(token, (df.get(token) ?? 0) + 1);
        }
    }
    return df;
}
//# sourceMappingURL=tokenize.js.map