import { describe, it, expect, beforeAll } from "vitest";
import { initAstMatcher, isInsideCommentOrString } from "../ast-context.js";

beforeAll(async () => {
  await initAstMatcher();
});

describe("AST context matching", () => {
  it("TS: axios in code is real match", () => {
    const code = `import axios from "axios";\nconst r = axios.get(url);`;
    const pos = code.indexOf("axios.get");
    expect(isInsideCommentOrString(code, pos, "typescript")).toBe(false);
  });

  it("TS: axios in // comment is filtered out", () => {
    const code = `// we used to use axios.get\nconst r = fetch(url);`;
    const pos = code.indexOf("axios.get");
    expect(isInsideCommentOrString(code, pos, "typescript")).toBe(true);
  });

  it("TS: axios in /* block comment */ is filtered", () => {
    const code = `/* TODO: replace axios with fetch */\nconst r = fetch(url);`;
    const pos = code.indexOf("axios");
    expect(isInsideCommentOrString(code, pos, "typescript")).toBe(true);
  });

  it("TS: axios in string literal is filtered", () => {
    const code = `const msg = "don't use axios";\nconst r = fetch(url);`;
    const pos = code.indexOf("axios");
    expect(isInsideCommentOrString(code, pos, "typescript")).toBe(true);
  });

  it("TS: axios in import module specifier is real dependency use", () => {
    const code = `import client from "axios";\nconst r = client.get(url);`;
    const pos = code.indexOf("axios");
    expect(isInsideCommentOrString(code, pos, "typescript")).toBe(false);
  });

  it("Python: axios in # comment is filtered", () => {
    const code = `# use requests not axios\nimport requests`;
    const pos = code.indexOf("axios");
    expect(isInsideCommentOrString(code, pos, "python")).toBe(true);
  });

  it("unknown language → falls back to substring (no filter)", () => {
    const code = `// axios`;
    const pos = code.indexOf("axios");
    expect(isInsideCommentOrString(code, pos, "unknown-lang")).toBe(false);
  });
});
