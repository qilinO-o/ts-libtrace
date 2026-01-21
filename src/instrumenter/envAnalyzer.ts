import ts from "typescript";

const IGNORED_NAMES = new Set([
  "this",
  "super",
  "arguments",
  "console",
  "Math",
  "JSON",
  "Error",
  "Number",
  "String",
  "Boolean",
  "Date",
  "Promise",
  "Set",
  "Map",
  "WeakMap",
  "WeakSet",
  "Symbol",
  "BigInt",
  "global",
  "globalThis",
  "window",
  "process",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "undefined",
  "null"
]);

const isTypeNodeKind = (kind: ts.SyntaxKind): boolean =>
  kind >= ts.SyntaxKind.FirstTypeNode && kind <= ts.SyntaxKind.LastTypeNode;

const addBindingNames = (name: ts.BindingName, declared: Set<string>): void => {
  if (ts.isIdentifier(name)) {
    declared.add(name.text);
    return;
  }

  if (ts.isArrayBindingPattern(name)) {
    name.elements.forEach((el) => {
      if (ts.isBindingElement(el) && el.name) {
        addBindingNames(el.name, declared);
      }
    });
  } else if (ts.isObjectBindingPattern(name)) {
    name.elements.forEach((el) => {
      if (ts.isBindingElement(el) && el.name) {
        addBindingNames(el.name, declared);
      }
    });
  }
};

export function collectFreeVariableNames(fn: ts.FunctionLikeDeclarationBase): string[] {
  const declared = new Set<string>();
  const free = new Set<string>();

  const collectDeclarations = (node: ts.Node, declaredSet: Set<string>): void => {
    if (node !== fn && ts.isFunctionLike(node)) {
      return;
    }

    if (ts.isVariableDeclaration(node)) {
      addBindingNames(node.name, declaredSet);
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      declaredSet.add(node.name.text);
      return; // do not descend into nested function
    } else if (ts.isCatchClause(node) && node.variableDeclaration?.name) {
      addBindingNames(node.variableDeclaration.name, declaredSet);
    }

    ts.forEachChild(node, (child) => collectDeclarations(child, declaredSet));
  };

  const seedDeclarations = (fnNode: ts.FunctionLikeDeclarationBase, base: Set<string>): Set<string> => {
    const scope = new Set(base);
    if (fnNode.name && ts.isIdentifier(fnNode.name)) {
      scope.add(fnNode.name.text);
    }
    fnNode.parameters.forEach((param) => addBindingNames(param.name, scope));
    if (fnNode.body) {
      collectDeclarations(fnNode.body, scope);
    }
    return scope;
  };

  // parameters and declarations for root function
  const rootDeclared = seedDeclarations(fn, declared);

  const isShorthandProperty = (node: ts.Identifier): boolean =>
    ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node;

  const isPropertyNamePosition = (node: ts.Identifier): boolean => {
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
      return true;
    }
    if (ts.isPropertyAssignment(parent) && parent.name === node && !ts.isShorthandPropertyAssignment(parent)) {
      return true;
    }
    return false;
  };

  const isCallLikeCallee = (node: ts.Identifier): boolean => {
    const parent = node.parent;
    return (
      (ts.isCallExpression(parent) && parent.expression === node) ||
      (ts.isNewExpression(parent) && parent.expression === node)
    );
  };

  const visit = (node: ts.Node, declaredSet: Set<string>): void => {
    if (node !== fn && ts.isFunctionLike(node) && ts.isFunctionLike(node)) {
      if ("body" in node && node.body) {
        const nestedDeclared = seedDeclarations(node as ts.FunctionLikeDeclarationBase, declaredSet);
        ts.forEachChild(node.body, (child) => visit(child, nestedDeclared));
      }
      return;
    }

    if (isTypeNodeKind(node.kind)) {
      return;
    }

    if (ts.isIdentifier(node)) {
      const name = node.text;

      if (IGNORED_NAMES.has(name)) {
        // ignore built-ins and special identifiers
      } else if (isPropertyNamePosition(node)) {
        // skip property names in member access or object literals
      } else if (isCallLikeCallee(node)) {
        // skip direct call/new callee identifiers
      } else if (declaredSet.has(name)) {
        // declared within this function scope
      } else {
        free.add(name);
      }
    }

    ts.forEachChild(node, (child) => visit(child, declaredSet));
  };

  if (fn.body) {
    visit(fn.body, rootDeclared);
  }

  return Array.from(free);
}
