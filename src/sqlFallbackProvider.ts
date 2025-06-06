// ABOUTME: SQL fallback provider that shows references when definitions are not found
// ABOUTME: Similar to GraphQL fallback provider, enhances navigation experience

import * as vscode from 'vscode';
import { SQLDefinitionProvider } from './sqlDefinitionProvider';
import { SQLReferenceProvider } from './sqlReferenceProvider';

export class SQLFallbackProvider implements vscode.DefinitionProvider {
  constructor(
    private definitionProvider: SQLDefinitionProvider,
    private referenceProvider: SQLReferenceProvider
  ) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | vscode.LocationLink[] | null> {
    // First try to find actual definitions
    const definitions = await this.definitionProvider.provideDefinition(
      document,
      position,
      token
    );
    if (definitions && Array.isArray(definitions) && definitions.length > 0) {
      return definitions;
    }

    // If no definitions found, show references instead
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);

    try {
      const references = await this.referenceProvider.provideReferences(
        document,
        position,
        { includeDeclaration: true },
        token
      );

      if (references && references.length > 0) {
        // Convert to LocationLink array to properly display in VS Code
        const locationLinks = references.map(
          (loc) =>
            ({
              originSelectionRange: wordRange,
              targetUri: loc.uri,
              targetRange: loc.range,
              targetSelectionRange: loc.range,
            } as vscode.LocationLink)
        );
        return locationLinks;
      }
    } catch (error) {
      console.error('Error in SQL fallback references:', error);
    }

    return null;
  }
}
