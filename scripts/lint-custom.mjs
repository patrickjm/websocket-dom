import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const repoRoot = path.resolve(process.cwd());

// Custom lint checks that go beyond what Biome/Grit supports.
// Add new checks by:
// 1) defining a matcher (AST or string-based),
// 2) collecting violations with a clear reason,
// 3) wiring the check into main().

const fileExtensions = new Set([".ts", ".tsx"]);

const isIgnoredPath = (filePath) =>
  filePath.includes(`${path.sep}dist${path.sep}`) ||
  filePath.includes(`${path.sep}build${path.sep}`) ||
  filePath.includes(`${path.sep}node_modules${path.sep}`);

const listFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (isIgnoredPath(fullPath)) {
      continue;
    }
    if (entry.isDirectory()) {
      results.push(...(await listFiles(fullPath)));
      continue;
    }
    if (fileExtensions.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
};

const readImports = (filePath, sourceText) => {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const imports = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier) {
      imports.push(statement.moduleSpecifier.text);
    }
  }
  return { sourceFile, imports };
};

const allowComment = "syncui-allow-inline-import";
const allowGlobalComment = "syncui-allow-global";

const boundaryRules = [
  {
    matchPath: /packages\/syncui\/src\/core\//,
    disallow: [
      /^\.\.\/client\b/,
      /^\.\.\/transport\b/,
      /^\.\.\/asset-proxy\b/,
      /^\.\.\/e2e\b/,
      /^syncui-dom\b/,
      /^jsdom\b/,
      /^@playwright\/test\b/,
      /^playwright\b/,
    ],
    reason:
      "core must stay transport-agnostic and adapter-agnostic; no DOM/transport dependencies",
  },
  {
    matchPath: /packages\/syncui\/src\/transport\//,
    disallow: [/^\.\.\/client\b/, /^syncui-dom\b/],
    reason: "transport must not depend on client or DOM adapters",
  },
  {
    matchPath: /packages\/syncui-dom\/src\//,
    disallow: [/^syncui\/src\b/],
    reason: "syncui-dom should only import public syncui entrypoints",
  },
];

const checkBoundaryRules = (filePath, imports, violations) => {
  for (const rule of boundaryRules) {
    if (!rule.matchPath.test(filePath)) {
      continue;
    }
    for (const specifier of imports) {
      for (const pattern of rule.disallow) {
        if (pattern.test(specifier)) {
          violations.push({
            filePath,
            specifier,
            reason: rule.reason,
          });
        }
      }
    }
  }
};

const isFunctionLike = (node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node);

const isRequireCall = (node) =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === "require";

const findFunctionAncestor = (node) => {
  let current = node.parent;
  while (current) {
    if (isFunctionLike(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
};

const hasAllowComment = (sourceText, node) => {
  const { line } = ts.getLineAndCharacterOfPosition(
    node.getSourceFile(),
    node.getStart()
  );
  const lines = sourceText.split(/\r?\n/);
  const commentLine = lines[line] ?? "";
  const previousLine = lines[line - 1] ?? "";
  return (
    commentLine.includes(allowComment) || previousLine.includes(allowComment)
  );
};

const collectRequireViolations = (
  sourceFile,
  sourceText,
  violations,
  filePath
) => {
  const visit = (node) => {
    if (isRequireCall(node)) {
      const functionAncestor = findFunctionAncestor(node);
      if (functionAncestor && !hasAllowComment(sourceText, node)) {
        violations.push({
          filePath,
          specifier: node.expression.getText(sourceFile),
          reason:
            "inline require() inside functions is disallowed (use top-level import)",
        });
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
};

const isSyncuiGlobalAccess = (node) =>
  ts.isPropertyAccessExpression(node) &&
  ts.isIdentifier(node.name) &&
  node.name.text.startsWith("__syncui");

const collectSyncuiGlobalViolations = (
  sourceFile,
  sourceText,
  violations,
  filePath
) => {
  const visit = (node) => {
    if (isSyncuiGlobalAccess(node) && !hasAllowComment(sourceText, node)) {
      violations.push({
        filePath,
        specifier: node.getText(sourceFile),
        reason:
          "avoid __syncui* globals; use explicit APIs or scoped state instead",
      });
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
};

const main = async () => {
  const targets = [
    path.join(repoRoot, "packages", "syncui", "src"),
    path.join(repoRoot, "packages", "syncui-dom", "src"),
  ];
  const files = (
    await Promise.all(targets.map((target) => listFiles(target)))
  ).flat();
  const violations = [];

  for (const filePath of files) {
    const sourceText = await fs.readFile(filePath, "utf8");
    const { sourceFile, imports } = readImports(filePath, sourceText);
    if (imports.length > 0) {
      checkBoundaryRules(filePath, imports, violations);
    }
    collectRequireViolations(sourceFile, sourceText, violations, filePath);
    collectSyncuiGlobalViolations(sourceFile, sourceText, violations, filePath);
  }

  if (violations.length > 0) {
    const message = violations
      .map(
        (violation) =>
          `${path.relative(repoRoot, violation.filePath)}: import '${
            violation.specifier
          }' (${violation.reason})`
      )
      .join("\n");
    console.error(message);
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
