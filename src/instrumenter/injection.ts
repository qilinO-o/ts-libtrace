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

const createLet = (
  factory: ts.NodeFactory,
  name: string,
  initializer?: ts.Expression
): ts.Statement =>
  factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [factory.createVariableDeclaration(factory.createIdentifier(name), undefined, undefined, initializer)],
      ts.NodeFlags.Let
    )
  );

const createAssignmentStatement = (
  factory: ts.NodeFactory,
  name: string,
  value: ts.Expression
): ts.Statement =>
  factory.createExpressionStatement(
    factory.createBinaryExpression(
      factory.createIdentifier(name),
      factory.createToken(ts.SyntaxKind.EqualsToken),
      value
    )
  );

const isNestedFunctionLike = (node: ts.Node): boolean =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

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

  const labelIdentifier = factory.createUniqueName("__libtrace_return");

  const createReturnReplacement = (expr?: ts.Expression): ts.Statement =>
    factory.createBlock(
      [
        createAssignmentStatement(factory, "__ret", expr ?? factory.createVoidZero()),
        createAssignmentStatement(factory, "__isThrow", factory.createFalse()),
        factory.createBreakStatement(labelIdentifier)
      ],
      true
    );

  const rewriteReturns = (block: ts.Block): ts.Block => {
    const transformer: ts.TransformerFactory<ts.Block> = (context) => {
      const visitReturns = (visitNode: ts.Node): ts.VisitResult<ts.Node> => {
        if (ts.isReturnStatement(visitNode)) {
          return createReturnReplacement(visitNode.expression);
        }
        if (isNestedFunctionLike(visitNode)) {
          return visitNode;
        }
        return ts.visitEachChild(visitNode, visitReturns, context);
      };
      return (visitNode) => ts.visitNode(visitNode, visitReturns) as ts.Block;
    };

    const result = ts.transform(block, [transformer]);
    const transformedBlock = result.transformed[0] as ts.Block;
    result.dispose();
    return transformedBlock;
  };

  const rewrittenBlock = rewriteReturns(originalBlock);
  const tryStatements = [...rewrittenBlock.statements];
  if (fnIdStruct.className && fnIdStruct.name === "constructor") {
    tryStatements.push(createAssignmentStatement(factory, "__ret", factory.createThis()));
  }
  tryStatements.push(createAssignmentStatement(factory, "__isThrow", factory.createFalse()));

  const catchClause = factory.createCatchClause(
    factory.createVariableDeclaration(factory.createIdentifier("__err")),
    factory.createBlock(
      [
        createAssignmentStatement(factory, "__isThrow", factory.createTrue()),
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
    factory.createBlock(tryStatements, true),
    catchClause,
    factory.createBlock(
      [
        factory.createIfStatement(
          factory.createPrefixUnaryExpression(
            ts.SyntaxKind.ExclamationToken,
            factory.createIdentifier("__isThrow")
          ),
          factory.createBlock(
            [
              createExitCall(
                factory,
                "return",
                "__ret",
                envExpression,
                outcomeTypeNames,
                envTypeNames
              )
            ],
            true
          )
        )
      ],
      true
    )
  );

  const labeledTryStatement = factory.createLabeledStatement(labelIdentifier, tryStatement);

  const newBody = factory.createBlock(
    [
      fnIdConst,
      callIdConst,
      createLet(factory, "__ret"),
      createLet(factory, "__isThrow", factory.createTrue()),
      labeledTryStatement,
      factory.createReturnStatement(factory.createIdentifier("__ret"))
    ],
    true
  );

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
