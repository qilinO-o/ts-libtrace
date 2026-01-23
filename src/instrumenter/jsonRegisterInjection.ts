import ts from "typescript";

const createRegisterClassBlock = (factory: ts.NodeFactory): ts.ClassElement =>
  factory.createClassStaticBlockDeclaration(
    factory.createBlock(
      [
        factory.createExpressionStatement(
          factory.createCallExpression(
            factory.createPropertyAccessExpression(factory.createIdentifier("__trace"), "registerClass"),
            undefined,
            [factory.createThis()]
          )
        )
      ],
      true
    )
  );

const shouldInstrumentClass = (node: ts.ClassLikeDeclarationBase): boolean =>
  (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Ambient) === 0;

export function updateClassMembers<T extends ts.ClassDeclaration | ts.ClassExpression>(node: T, factory: ts.NodeFactory): T {
  if (!shouldInstrumentClass(node)) {
    return node;
  }

  const members = factory.createNodeArray([createRegisterClassBlock(factory), ...node.members]);

  if (ts.isClassDeclaration(node)) {
    return factory.updateClassDeclaration(
      node,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      members
    ) as T;
  }

  return factory.updateClassExpression(
    node,
    node.modifiers,
    node.name,
    node.typeParameters,
    node.heritageClauses,
    members
  ) as T;
};