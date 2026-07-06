/**
 * Word EQ field code → LaTeX converter.
 *
 * EQ fields are the legacy math format used before OMML (Office 2003 and earlier).
 * Common in educational PPTs where formulas were authored in Word and pasted as OLE.
 *
 * Supported constructs:
 *   \f(num,den)                         → \frac{num}{den}
 *   \o(base,\s\up N(overlay))           → \overrightarrow{base} (when overlay is →)
 *   \b\lc X\rc Y(content)               → \left X content \right Y
 *   \a\vs N\al\co M(item1,item2,...)    → column array
 *   \s\up N(text)                        → ^{text}
 *   \s\do N(text)                        → _{text}
 *   \r(N,expr)                           → \sqrt[N]{expr} or \sqrt{expr}
 *   \i(,,expr,expr)                      → \int_{a}^{b}
 *
 * Reference: MS-OE376 §2.16.5.22 (EQ field) and Word field code documentation.
 */
/**
 * Convert a single EQ field instruction string to LaTeX.
 * Input should be the raw instrText content (e.g. "eq \\f(4,3)").
 */
export declare function eqFieldToLatex(instrText: string): string;
export interface DocxMathContent {
    /** LaTeX representation of the full line (text + formulas). */
    latex: string;
    /** Plain text representation (formulas simplified to readable text). */
    plainText: string;
}
/**
 * Parse word/document.xml content and extract text + EQ fields,
 * converting the full paragraph content into LaTeX and plain text.
 *
 * Structure: <w:body><w:p>...<w:r>(w:t | w:fldChar+w:instrText)...</w:r>...</w:p></w:body>
 *
 * @param xmlString raw XML content of word/document.xml
 */
export declare function parseDocxMathContent(xmlString: string): DocxMathContent;
