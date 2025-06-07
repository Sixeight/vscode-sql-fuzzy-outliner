import * as vscode from 'vscode';
import { GraphQLDefinitionProvider } from './graphqlDefinitionProvider';
import { GraphQLReferenceProvider } from './graphqlReferenceProvider';

/**
 * GraphQLFallbackProvider - a provider that shows references when definitions are not found
 *
 * This class wraps the standard definition provider and, if no definitions are found,
 * uses the reference provider to find references of the same term.
 */
export class GraphQLFallbackProvider implements vscode.DefinitionProvider {
  private definitionProvider: GraphQLDefinitionProvider;
  private referenceProvider: GraphQLReferenceProvider;

  constructor(
    definitionProvider: GraphQLDefinitionProvider,
    referenceProvider: GraphQLReferenceProvider
  ) {
    this.definitionProvider = definitionProvider;
    this.referenceProvider = referenceProvider;
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | vscode.LocationLink[] | null> {
    // First, search for definitions
    const definitions = await this.definitionProvider.provideDefinition(
      document,
      position,
      token
    );
    if (
      definitions &&
      (Array.isArray(definitions) ? definitions.length > 0 : true)
    ) {
      return definitions;
    }

    // If no definitions, search for references
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    try {
      const refs = await this.referenceProvider.provideReferences(
        document,
        position,
        { includeDeclaration: true },
        token
      );
      if (refs && refs.length > 0) {
        // Convert to LocationLink array and return
        return refs.map(
          (loc) =>
            ({
              originSelectionRange: wordRange,
              targetUri: loc.uri,
              targetRange: loc.range,
              targetSelectionRange: loc.range,
            }) as vscode.LocationLink
        );
      }
    } catch (error) {
      console.error('Error in fallback references:', error);
    }

    return null;
  }
}
