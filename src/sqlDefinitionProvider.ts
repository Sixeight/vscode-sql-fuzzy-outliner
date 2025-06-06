// ABOUTME: SQL definition provider for jumping to type and table definitions within the same file
// ABOUTME: Supports CREATE TABLE and CREATE TYPE statements with caching for performance

import * as vscode from 'vscode';

export class SQLDefinitionProvider implements vscode.DefinitionProvider {
  private definitionCache = new Map<string, vscode.Location[]>();

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);
    // Check if cursor is already on a definition
    if (this.isOnDefinition(document, position, word)) {
      return null;
    }

    const definitions = this.findDefinitions(document, word);

    if (definitions.length > 0) {
      return definitions;
    }

    return null;
  }

  private findDefinitions(
    document: vscode.TextDocument,
    word: string
  ): vscode.Location[] {
    const cacheKey = `${document.uri.toString()}-${word}`;

    if (this.definitionCache.has(cacheKey)) {
      return this.definitionCache.get(cacheKey)!;
    }

    const text = document.getText();
    const definitions: vscode.Location[] = [];

    // Pattern to match CREATE TABLE and CREATE TYPE definitions
    const createPattern = new RegExp(
      `CREATE\\s+(TABLE|TYPE)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${this.escapeRegex(
        word
      )})(?:\\s+AS\\s+ENUM)?\\s*[^;]+;`,
      'gmi'
    );

    let match;
    while ((match = createPattern.exec(text)) !== null) {
      const matchedName = match[2];
      if (matchedName.toLowerCase() === word.toLowerCase()) {
        const startPos = document.positionAt(
          match.index + match[0].indexOf(matchedName)
        );
        const endPos = document.positionAt(
          match.index + match[0].indexOf(matchedName) + matchedName.length
        );
        const range = new vscode.Range(startPos, endPos);
        definitions.push(new vscode.Location(document.uri, range));
      }
    }

    this.definitionCache.set(cacheKey, definitions);
    return definitions;
  }

  private isOnDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string
  ): boolean {
    const line = document.lineAt(position.line);
    const lineText = line.text.toLowerCase();

    // Check if current line contains CREATE TABLE or CREATE TYPE
    const createPattern = /create\s+(table|type)\s+/i;
    const match = createPattern.exec(lineText);

    if (match) {
      // Check if the word appears after CREATE TABLE/TYPE on the same line
      const afterCreate = lineText.substring(match.index + match[0].length);
      const wordInLine = afterCreate.toLowerCase().indexOf(word.toLowerCase());

      if (wordInLine !== -1) {
        // Check if cursor position is on this word
        const wordStartPos = match.index + match[0].length + wordInLine;
        const wordEndPos = wordStartPos + word.length;

        if (
          position.character >= wordStartPos &&
          position.character <= wordEndPos
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Clear cache when document changes
  clearCache(document: vscode.TextDocument): void {
    const prefix = document.uri.toString() + '-';
    for (const key of this.definitionCache.keys()) {
      if (key.startsWith(prefix)) {
        this.definitionCache.delete(key);
      }
    }
  }
}
