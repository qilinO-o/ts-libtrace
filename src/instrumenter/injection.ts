import ts from "typescript";
import { FunctionIdStruct, functionIdToString } from "./functionId.js";
import { collectFreeVariableNames } from "./envAnalyzer.js";

const createConst = (factory: ts.NodeFactory, name: string, initializer: ts.Expression): ts.Statement =>
  factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [factory.createVariableDeclaration(factory.createIdentifier(name), undefined, undefined, initializer)],
      ts.NodeFlags.Const
    )
  );

const createStringArrayLiteral = (factory: ts.NodeFactory, values: string[]): ts.ArrayLiteralExpression =>
  factory.createArrayLiteralExpression(
    values.map((value) => factory.createStringLiteral(value)),
    false
  );

const isTypeNodeKind = (kind: ts.SyntaxKind): boolean =>
  kind >= ts.SyntaxKind.FirstTypeNode && kind <= ts.SyntaxKind.LastTypeNode;

const isShorthandProperty = (node: ts.Identifier): boolean =>
  ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node;

const isPropertyNamePosition = (node: ts.Identifier): boolean => {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return true;
  }
  if (ts.isPropertyAssignment(parent) && parent.name === node && !isShorthandProperty(node)) {
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

const typeFormatFlag = 
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.WriteArrayAsGenericType |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

const typeToString = (typeChecker: ts.TypeChecker, type: ts.Type | undefined): string => {
  if (!type) {
    return "unknown";
  }
  return typeChecker.typeToString(
    typeChecker.getBaseTypeOfLiteralType(type),
    undefined,
    typeFormatFlag
  );
};

const getThisArgTypeName = (
  node: ts.FunctionLikeDeclarationBase,
  typeChecker: ts.TypeChecker
): string => {
  if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
    return typeToString(typeChecker, typeChecker.getTypeAtLocation(node.parent));
  }
  return "undefined";
};

const getReturnTypeName = (
  node: ts.FunctionLikeDeclarationBase,
  typeChecker: ts.TypeChecker
): string => {
  const signature = typeChecker.getSignatureFromDeclaration(node as ts.SignatureDeclaration);
  if (!signature) {
    return "unknown";
  }
  return typeToString(typeChecker, typeChecker.getReturnTypeOfSignature(signature));
};

const getParamTypeNames = (
  node: ts.FunctionLikeDeclarationBase,
  typeChecker: ts.TypeChecker
): string[] =>
  node.parameters.map((param) => typeToString(typeChecker, typeChecker.getTypeAtLocation(param)));

const getEnvTypeNames = (
  node: ts.FunctionLikeDeclarationBase,
  freeVarNames: string[],
  typeChecker: ts.TypeChecker
): string[] => {
  if (!node.body || freeVarNames.length === 0) {
    return [];
  }

  const remaining = new Set(freeVarNames);
  const types = new Map<string, string>();

  const visit = (visitNode: ts.Node): void => {
    if (remaining.size === 0) {
      return;
    }
    if (isTypeNodeKind(visitNode.kind)) {
      return;
    }
    if (ts.isIdentifier(visitNode)) {
      const name = visitNode.text;
      if (remaining.has(name) && !isPropertyNamePosition(visitNode) && !isCallLikeCallee(visitNode)) {
        const type = typeChecker.getTypeAtLocation(visitNode);
        types.set(name, typeToString(typeChecker, type));
        remaining.delete(name);
      }
    }

    ts.forEachChild(visitNode, visit);
  };

  visit(node.body);

  return freeVarNames.map((name) => types.get(name) ?? "unknown");
};

const createExitCall = (
  factory: ts.NodeFactory,
  kind: "return" | "throw",
  valueIdentifier: string,
  envExpression: ts.ObjectLiteralExpression,
  outcomeTypeNames: string[],
  envTypeNames: string[]
): ts.Statement => {
  const outcomeProps =
    kind === "return"
      ? [
          factory.createPropertyAssignment("kind", factory.createStringLiteral("return")),
          factory.createPropertyAssignment("value", factory.createIdentifier(valueIdentifier))
        ]
      : [
          factory.createPropertyAssignment("kind", factory.createStringLiteral("throw")),
          factory.createPropertyAssignment("error", factory.createIdentifier(valueIdentifier))
        ];

  return factory.createExpressionStatement(
    factory.createCallExpression(
      factory.createPropertyAccessExpression(factory.createIdentifier("__trace"), "exit"),
      undefined,
      [
        factory.createIdentifier("__fnId"),
        factory.createIdentifier("__callId"),
        factory.createObjectLiteralExpression(outcomeProps, true),
        envExpression,
        createStringArrayLiteral(factory, outcomeTypeNames),
        createStringArrayLiteral(factory, envTypeNames)
      ]
    )
  );
};

const createEnterCall = (
  factory: ts.NodeFactory,
  thisArgExpression: ts.Expression,
  thisArgTypeName: string,
  argsExpression: ts.Expression,
  argsTypeNames: string[],
  envExpression: ts.ObjectLiteralExpression,
  envTypeNames: string[],
  funcKind: number
): ts.Expression => {
  return factory.createCallExpression(
    factory.createPropertyAccessExpression(factory.createIdentifier("__trace"), "enter"),
    undefined,
    [
      factory.createIdentifier("__fnId"),
      thisArgExpression,
      argsExpression,
      envExpression,
      factory.createStringLiteral(thisArgTypeName),
      createStringArrayLiteral(factory, argsTypeNames),
      createStringArrayLiteral(factory, envTypeNames),
      factory.createNumericLiteral(funcKind)
    ]
  );
};

export function ensureTraceImport(
  sourceFile: ts.SourceFile,
  factory: ts.NodeFactory,
  runtimeModuleSpecifier: string
): ts.SourceFile {
  const hasTraceImport = sourceFile.statements.some((stmt) => {
    if (!ts.isImportDeclaration(stmt)) {
      return false;
    }

    const moduleName = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(moduleName) || moduleName.text !== runtimeModuleSpecifier) {
      return false;
    }

    const namedBindings = stmt.importClause?.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      return namedBindings.elements.some(
        (el) => ts.isIdentifier(el.name) && el.name.text === "__trace"
      );
    }

    return false;
  });

  if (hasTraceImport) {
    return sourceFile;
  }

  const traceImport = factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      undefined,
      undefined,
      factory.createNamedImports([
        factory.createImportSpecifier(false, undefined, factory.createIdentifier("__trace"))
      ])
    ),
    factory.createStringLiteral(runtimeModuleSpecifier)
  );

  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const others = sourceFile.statements.filter((stmt) => !ts.isImportDeclaration(stmt));
  const newStatements = [...imports, traceImport, ...others];

  return factory.updateSourceFile(sourceFile, newStatements);
}

export function instrumentFunctionBody(
  node: ts.FunctionLikeDeclarationBase,
  factory: ts.NodeFactory,
  fnIdStruct: FunctionIdStruct,
  typeChecker: ts.TypeChecker
): ts.FunctionLikeDeclarationBase {
  const fnIdString = functionIdToString(fnIdStruct);
  const freeVarNames = collectFreeVariableNames(node);
  const thisArgTypeName = getThisArgTypeName(node, typeChecker);
  const argsTypeNames = getParamTypeNames(node, typeChecker);
  const envTypeNames = getEnvTypeNames(node, freeVarNames, typeChecker);
  const outcomeTypeNames = [getReturnTypeName(node, typeChecker), "unknown"];
  const envExpression =
    freeVarNames.length === 0
      ? factory.createObjectLiteralExpression([], true)
      : factory.createObjectLiteralExpression(
          freeVarNames.map((name) => factory.createShorthandPropertyAssignment(name)),
          true
        );

  const body = node.body;
  if (!body) {
    return node;
  }
  const originalBlock = ts.isBlock(body)
    ? body
    : factory.createBlock([factory.createReturnStatement(body as ts.Expression)], true);

  const fnIdConst = createConst(factory, "__fnId", factory.createStringLiteral(fnIdString));

  const thisArgExpr =
    ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)
      ? factory.createThis()
      : factory.createIdentifier("undefined");

  const argsExpression = ts.isArrowFunction(node)
    ? factory.createArrayLiteralExpression(
        node.parameters.map((param) =>
          ts.isIdentifier(param.name) ? factory.createIdentifier(param.name.text) : factory.createNull()
        ),
        false
      )
    : factory.createCallExpression(
        factory.createPropertyAccessExpression(factory.createIdentifier("Array"), "from"),
        undefined,
        [factory.createIdentifier("arguments")]
      );

  // 1 for functions, 2 for methods, 3 for constructors
  const funcKind = (fnIdStruct.className === undefined) ? 1 : (fnIdStruct.name === "constructor" ? 3 : 2);
  const callIdConst = createConst(
    factory,
    "__callId",
    createEnterCall(
      factory,
      thisArgExpr,
      thisArgTypeName,
      argsExpression,
      argsTypeNames,
      envExpression,
      envTypeNames,
      funcKind
    )
  );

  const rewrittenStatements: ts.Statement[] = [];

  var if_make_exit = false;
  originalBlock.statements.forEach((stmt) => {
    if (ts.isReturnStatement(stmt)) {
      const initializer = stmt.expression ?? factory.createVoidZero();
      const retConst = createConst(factory, "__ret", initializer);
      const exitStmt = createExitCall(
        factory,
        "return",
        "__ret",
        envExpression,
        outcomeTypeNames,
        envTypeNames
      );
      const returnStmt = factory.createReturnStatement(factory.createIdentifier("__ret"));

      rewrittenStatements.push(retConst, exitStmt, returnStmt);
      if_make_exit = true;
    } else {
      rewrittenStatements.push(stmt);
    }
  });

  if (!if_make_exit) {
    const exitStmt = createExitCall(
      factory,
      "return",
      (fnIdStruct.className && fnIdStruct.name === "constructor" ? "this" : "undefined"),
      envExpression,
      outcomeTypeNames,
      envTypeNames
    );
    rewrittenStatements.push(exitStmt);
  }

  const catchClause = factory.createCatchClause(
    factory.createVariableDeclaration(factory.createIdentifier("__err")),
    factory.createBlock(
      [
        createExitCall(
          factory,
          "throw",
          "__err",
          envExpression,
          outcomeTypeNames,
          envTypeNames
        ),
        factory.createThrowStatement(factory.createIdentifier("__err"))
      ],
      true
    )
  );

  const tryStatement = factory.createTryStatement(
    factory.createBlock(rewrittenStatements, true),
    catchClause,
    undefined
  );

  const newBody = factory.createBlock([fnIdConst, callIdConst, tryStatement], true);

  if (ts.isFunctionDeclaration(node)) {
    return factory.updateFunctionDeclaration(
      node,
      node.modifiers,
      node.asteriskToken,
      node.name,
      node.typeParameters,
      node.parameters,
      node.type,
      newBody
    );
  }

  if (ts.isMethodDeclaration(node)) {
    return factory.updateMethodDeclaration(
      node,
      node.modifiers,
      node.asteriskToken,
      node.name,
      node.questionToken,
      node.typeParameters,
      node.parameters,
      node.type,
      newBody
    );
  }

  if (ts.isConstructorDeclaration(node)) {
    return factory.updateConstructorDeclaration(
      node,
      node.modifiers,
      node.parameters,
      newBody
    );
  }

  if (ts.isFunctionExpression(node)) {
    return factory.updateFunctionExpression(
      node,
      node.modifiers,
      node.asteriskToken,
      node.name,
      node.typeParameters,
      node.parameters,
      node.type,
      newBody
    );
  }

  if (ts.isArrowFunction(node)) {
    return factory.updateArrowFunction(
      node,
      node.modifiers,
      node.typeParameters,
      node.parameters,
      node.type,
      node.equalsGreaterThanToken,
      newBody
    );
  }

  return node;
}
