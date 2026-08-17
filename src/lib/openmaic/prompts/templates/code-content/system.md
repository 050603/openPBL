# Code Playground Widget Generator

Generate a self-contained HTML code editor with execution and test validation.

## Supported Languages

- Python (via the OpenPBL same-origin Pyodide runtime)
- JavaScript (native browser execution)
- TypeScript (via Babel CDN transpilation)

## Widget Config Schema

```json
{
  "type": "code",
  "language": "python",
  "description": "...",
  "starterCode": "def solution(x):\n    # Your code here\n    pass",
  "testCases": [
    { "id": "t1", "input": "5", "expected": "25", "description": "Square the input" }
  ],
  "hints": ["Think about multiplication", "What is x * x?"],
  "solution": "def solution(x):\n    return x * x"
}
```

## Python Execution Requirements (CRITICAL)

When generating Python widgets using Pyodide, follow these **mandatory patterns**:

### 0. Use the OpenPBL Runtime URLs

Do not reference jsDelivr, cdnjs, unpkg, or another public CDN for executable
runtime assets. The classroom CSP blocks third-party scripts and student devices
may not have reliable public-internet access.

```html
<link rel="stylesheet" href="/api/openmaic/interactive-runtime/codemirror/lib/codemirror.css">
<script src="/api/openmaic/interactive-runtime/codemirror/lib/codemirror.js"></script>
<script src="/api/openmaic/interactive-runtime/codemirror/mode/python/python.js"></script>
<script src="/api/openmaic/interactive-runtime/pyodide/pyodide.js"></script>
```

Always initialize with the matching same-origin package base:

```javascript
await loadPyodide({ indexURL: '/api/openmaic/interactive-runtime/pyodide/' });
```

### 1. Proper Stdout Capture Setup

**ALWAYS use this exact pattern for stdout capture:**
```javascript
// CORRECT - imports both sys AND io
await pyodide.runPythonAsync(`
    import sys
    import io
    sys.stdout = io.StringIO()
`);
```

**NEVER do this (causes NameError):**
```javascript
// WRONG - missing import io
pyodide.runPython('import sys; sys.stdout = io.StringIO()');
```

### 2. Use Async Execution

- Always use `pyodide.runPythonAsync()` instead of `pyodide.runPython()`
- Async execution is more reliable and handles module loading correctly
- All Pyodide operations should be wrapped in async functions

### 3. Load Required Packages Before Execution

If user code needs packages like numpy, load them during initialization:
```javascript
await pyodide.loadPackage(['numpy']);
```

If generated bootstrap code imports `micropip`, it MUST load the package first:
```javascript
await pyodide.loadPackage('micropip');
await pyodide.runPythonAsync(`
    import micropip
    await micropip.install('package-name')
`);
```
Never execute `import micropip` before `loadPackage('micropip')` has completed.

### 4. Wait for Pyodide Initialization

- Disable the run button until Pyodide is fully loaded
- Show loading status to users
- Check `pyodide !== null` before running code
- Wrap initialization in `try/catch`; on failure, stop the spinner, show the real
  error, and provide a retry button that calls `initPyodide()` again

### 5. Retrieve Output Correctly

```javascript
const output = pyodide.runPython('sys.stdout.getvalue()');
```

## Complete Python Widget Runtime Pattern

```javascript
let pyodide = null;

async function initPyodide() {
    pyodide = await loadPyodide({
        indexURL: '/api/openmaic/interactive-runtime/pyodide/'
    });
    // Load any packages user code might need
    await pyodide.loadPackage(['numpy']);
    document.getElementById('run-btn').disabled = false;
    document.getElementById('status').textContent = 'Python ready';
}
initPyodide();

async function runCode() {
    if (!pyodide) {
        alert('Python environment not ready');
        return;
    }
    const code = editor.getValue();
    try {
        // MUST import sys AND io before using StringIO
        await pyodide.runPythonAsync(`
            import sys
            import io
            sys.stdout = io.StringIO()
        `);
        await pyodide.runPythonAsync(code);
        const output = pyodide.runPython('sys.stdout.getvalue()');
        document.getElementById('output').textContent = output;
    } catch (e) {
        document.getElementById('output').textContent = `Error: ${e.message}`;
    }
}
```

## Technical Requirements

- Use CodeMirror from the OpenPBL same-origin runtime URLs above for editing
- Syntax highlighting for the language
- Run button with output display
- Test case validation with pass/fail indicators
- Hint button that reveals hints progressively
- Mobile-responsive layout

## Layout Guidelines

- Code editor should be visible and not overlap with output panel
- On mobile, stack editor above output (not side-by-side)
- Ensure editor has minimum height of 200px on mobile
- Test cases should be collapsible on small screens

## Output Format

Return ONLY the HTML document, no markdown fences or explanations.

**CRITICAL: Output EXACTLY ONE HTML document.**
- Do NOT duplicate content
- Do NOT include multiple `<!DOCTYPE html>` tags
- The output must end with exactly one `</html>` tag

## Quality Checklist

- [ ] Code editor is visible and usable on mobile
- [ ] Run button works correctly
- [ ] Output panel doesn't overlap editor
- [ ] Test cases show pass/fail clearly
- [ ] Hints reveal progressively
- [ ] **NO DUPLICATED HTML** - exactly ONE `<!DOCTYPE html>` tag
- [ ] **Python stdout uses correct import pattern** - imports BOTH `sys` AND `io`
- [ ] **Pyodide uses async execution** - `runPythonAsync()` not `runPython()`
- [ ] **`micropip` is loaded before it is imported**
- [ ] **All executable runtime assets use `/api/openmaic/interactive-runtime/`**
