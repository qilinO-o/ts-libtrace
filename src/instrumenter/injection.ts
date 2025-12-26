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

const createExitCall = (
  factory: ts.NodeFactory,
  kind: "return" | "throw",
  valueIdentifier: string,
  envExpression: ts.ObjectLiteralExpression
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
        envExpression
      ]
    )
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
  fnIdStruct: FunctionIdStruct
): ts.FunctionLikeDeclarationBase {
  const fnIdString = functionIdToString(fnIdStruct);
  const freeVarNames = collectFreeVariableNames(node);
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

  const callIdConst = createConst(
    factory,
    "__callId",
    factory.createCallExpression(
      factory.createPropertyAccessExpression(factory.createIdentifier("__trace"), "enter"),
      undefined,
      [
        factory.createIdentifier("__fnId"),
        factory.createObjectLiteralExpression(
          [
            factory.createPropertyAssignment("thisArg", thisArgExpr),
            factory.createPropertyAssignment("args", argsExpression),
            factory.createPropertyAssignment("env", envExpression)
          ],
          true
        )
      ]
    )
  );

  const rewrittenStatements: ts.Statement[] = [];

  var if_make_exit = false;
  originalBlock.statements.forEach((stmt) => {
    if (ts.isReturnStatement(stmt)) {
      const initializer = stmt.expression ?? factory.createVoidZero();
      const retConst = createConst(factory, "__ret", initializer);
      const exitStmt = createExitCall(factory, "return", "__ret", envExpression);
      const returnStmt = factory.createReturnStatement(factory.createIdentifier("__ret"));

      rewrittenStatements.push(retConst, exitStmt, returnStmt);
      if_make_exit = true;
    } else {
      rewrittenStatements.push(stmt);
    }
  });

  if (!if_make_exit) {
    const exitStmt = createExitCall(factory, "return", "undefined", envExpression);
    rewrittenStatements.push(exitStmt);
  }

  const catchClause = factory.createCatchClause(
    factory.createVariableDeclaration(factory.createIdentifier("__err")),
    factory.createBlock(
      [
        createExitCall(factory, "throw", "__err", envExpression),
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
