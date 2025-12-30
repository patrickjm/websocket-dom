import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const allowComment = "syncui-allow-inline-import";
const root = process.cwd();
const ignoreDirs = new Set(["node_modules", "dist", "build", ".turbo"]);
const allowExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

const isFunctionLike = (node) =>
  ts.isFunctionLike(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessor(node) ||
  ts.isSetAccessor(node);

const hasAllowComment = (sourceText, sourceFile, node) => {
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile)
  );
  const lines = sourceText.split(/\r?\n/);
  const current = lines[line] ?? "";
  const previous = lines[line - 1] ?? "";
  return current.includes(allowComment) || previous.includes(allowComment);
};

const isInlineImportCall = (node) =>
  ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;

const isInlineRequireCall = (node) =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === "require";

const isInsideFunction = (node) => {
  let current = node.parent;
  while (current) {
    if (isFunctionLike(current)) {
      return true;
    }
    if (ts.isSourceFile(current)) {
      return false;
    }
    current = current.parent;
  }
  return false;
};

const collectFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(fullPath)));
      continue;
    }
    if (!allowExtensions.has(path.extname(entry.name))) {
      continue;
    }
    results.push(fullPath);
  }
  return results;
};

const checkFile = async (filePath) => {
  const sourceText = await fs.readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const errors = [];
  const visit = (node) => {
    if ((isInlineImportCall(node) || isInlineRequireCall(node)) && isInsideFunction(node)) {
      if (!hasAllowComment(sourceText, sourceFile, node)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile)
        );
        errors.push({
          filePath,
          line: line + 1,
          column: character + 1,
          kind: isInlineImportCall(node) ? "import()" : "require()",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return errors;
};

const run = async () => {
  const files = await collectFiles(path.join(root, "packages"));
  const errors = [];
  for (const file of files) {
    errors.push(...(await checkFile(file)));
  }
  if (errors.length > 0) {
    console.error("Inline import()/require() calls inside functions are disallowed.");
    for (const error of errors) {
      console.error(
        `${error.filePath}:${error.line}:${error.column} ${error.kind} (add // ${allowComment} if required)`
      );
    }
    process.exit(1);
  }
};

await run();
