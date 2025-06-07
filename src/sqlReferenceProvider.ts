// ABOUTME: SQL reference provider for finding all references to tables and types within the same file
// ABOUTME: Searches for references in SELECT, INSERT, UPDATE, DELETE statements and other contexts

import * as vscode from 'vscode';

export class SQLReferenceProvider implements vscode.ReferenceProvider {
  private referenceCache = new Map<string, vscode.Location[]>();

  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return [];
    }

    const word = document.getText(wordRange);
    const references = this.findReferences(
      document,
      word,
      context.includeDeclaration
    );

    return references;
  }

  private findReferences(
    document: vscode.TextDocument,
    word: string,
    includeDeclaration: boolean
  ): vscode.Location[] {
    const cacheKey = `${document.uri.toString()}-${word}-${includeDeclaration}`;

    if (this.referenceCache.has(cacheKey)) {
      return this.referenceCache.get(cacheKey)!;
    }

    const text = document.getText();
    const references: vscode.Location[] = [];

    // Simple word boundary pattern to find all occurrences
    const wordPattern = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');

    let match;
    let matchCount = 0;
    while ((match = wordPattern.exec(text)) !== null) {
      matchCount++;
      const matchedText = match[0];
      if (matchedText.toLowerCase() === word.toLowerCase()) {
        // Get the line for context
        const lineStart = text.lastIndexOf('\n', match.index) + 1;
        const lineEnd = text.indexOf('\n', match.index);
        const line = text.substring(
          lineStart,
          lineEnd === -1 ? text.length : lineEnd
        );

        // Skip if it's in a comment
        if (line.trim().startsWith('--')) {
          continue;
        }

        // For now, include ALL non-comment occurrences to debug
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + matchedText.length);
        const range = new vscode.Range(startPos, endPos);
        references.push(new vscode.Location(document.uri, range));
      }
    }

    this.referenceCache.set(cacheKey, references);
    return references;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Clear cache when document changes
  clearCache(document: vscode.TextDocument): void {
    const prefix = document.uri.toString() + '-';
    for (const key of this.referenceCache.keys()) {
      if (key.startsWith(prefix)) {
        this.referenceCache.delete(key);
      }
    }
  }
}
