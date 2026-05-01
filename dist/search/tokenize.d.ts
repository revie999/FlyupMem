/**
 * Tokenize text into searchable tokens.
 * - Chinese: trigram decomposition
 * - English: lowercase word split
 * - Mixed: segment and process each part
 */
export declare function tokenize(text: string): string[];
/**
 * Build a document frequency map from a set of tokenized documents.
 */
export declare function buildDFMap(tokenizedDocs: string[][]): Map<string, number>;
//# sourceMappingURL=tokenize.d.ts.map