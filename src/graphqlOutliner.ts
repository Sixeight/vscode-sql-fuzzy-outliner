import * as vscode from 'vscode';
import {
  parse,
  print,
  Kind,
  DocumentNode,
  OperationDefinitionNode,
  FragmentDefinitionNode,
  SelectionSetNode,
  FieldNode,
  FragmentSpreadNode,
  ObjectTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  EnumTypeDefinitionNode,
  FieldDefinitionNode,
  EnumValueDefinitionNode,
  ScalarTypeDefinitionNode,
  UnionTypeDefinitionNode,
} from 'graphql';

export class GraphQLDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  // Mapping from GraphQL element kinds to VSCode SymbolKind
  private kindToSymbolKind: { [key: string]: vscode.SymbolKind } = {
    [Kind.OPERATION_DEFINITION]: vscode.SymbolKind.Class,
    [Kind.FRAGMENT_DEFINITION]: vscode.SymbolKind.Class,
    [Kind.OBJECT_TYPE_DEFINITION]: vscode.SymbolKind.Class,
    [Kind.INTERFACE_TYPE_DEFINITION]: vscode.SymbolKind.Interface,
    [Kind.ENUM_TYPE_DEFINITION]: vscode.SymbolKind.Enum,
    [Kind.ENUM_VALUE_DEFINITION]: vscode.SymbolKind.EnumMember,
    [Kind.INPUT_OBJECT_TYPE_DEFINITION]: vscode.SymbolKind.Class,
    [Kind.FIELD]: vscode.SymbolKind.Field,
    [Kind.FIELD_DEFINITION]: vscode.SymbolKind.Field,
    [Kind.INPUT_VALUE_DEFINITION]: vscode.SymbolKind.Field,
    [Kind.FRAGMENT_SPREAD]: vscode.SymbolKind.Struct,
    [Kind.INLINE_FRAGMENT]: vscode.SymbolKind.Struct,
    FieldWithArguments: vscode.SymbolKind.Method,
  };

  // Cache: stores symbols per document URI and version
  private symbolCache = new Map<
    string,
    { version: number; symbols: vscode.DocumentSymbol[] }
  >();
  // Mapping of opening to closing bracket positions
  private bracketMap = new Map<number, number>();

  // Pre-generate bracket mapping from the entire text
  private buildBracketMap(text: string): void {
    this.bracketMap.clear();
    const stack: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        stack.push(i);
      } else if (text[i] === '}') {
        const open = stack.pop();
        if (open !== undefined) {
          this.bracketMap.set(open, i);
        }
      }
    }
  }

  // Utility: create a DocumentSymbol given start/end offsets
  private createSymbol(
    document: vscode.TextDocument,
    name: string,
    detail: string,
    kind: vscode.SymbolKind,
    rangeStart: number,
    rangeEnd: number,
    selectionStart?: number,
    selectionEnd?: number
  ): vscode.DocumentSymbol {
    const start = document.positionAt(rangeStart);
    const end = document.positionAt(rangeEnd);
    const range = new vscode.Range(start, end);
    // selection range ignores comments; default to rangeStart if not provided
    const selStartPos = document.positionAt(selectionStart ?? rangeStart);
    const selEndPos = document.positionAt(
      selectionEnd ?? (selectionStart ? selectionEnd! : rangeStart)
    );
    const selectionRange = new vscode.Range(selStartPos, selEndPos);
    return new vscode.DocumentSymbol(name, detail, kind, range, selectionRange);
  }

  // Extract common logic for finding definitions and creating symbols
  private extractDefinitions(
    document: vscode.TextDocument,
    text: string,
    pattern: RegExp,
    symbols: vscode.DocumentSymbol[],
    options: {
      getName: (match: RegExpExecArray) => string;
      getDetail: (match: RegExpExecArray) => string;
      getSymbolKind: (match: RegExpExecArray) => vscode.SymbolKind;
      addChildren?: (
        document: vscode.TextDocument,
        text: string,
        parentSymbol: vscode.DocumentSymbol,
        startIndex: number,
        endIndex: number,
        match: RegExpExecArray
      ) => void;
    }
  ) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = options.getName(match);
      const detail = options.getDetail(match);
      const blockStartIndex = text.indexOf('{', match.index);
      const blockEndIndex =
        blockStartIndex === -1
          ? match.index + match[0].length - 1
          : this.findMatchingBracket(text, blockStartIndex);
      const kind = options.getSymbolKind(match);
      const symbol = this.createSymbol(
        document,
        name,
        detail,
        kind,
        match.index,
        blockEndIndex + 1
      );
      if (options.addChildren && blockStartIndex !== -1) {
        options.addChildren(
          document,
          text,
          symbol,
          blockStartIndex + 1,
          blockEndIndex,
          match
        );
      }
      symbols.push(symbol);
    }
  }

  // Method to provide document symbols (AST parse version)
  public provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const text = document.getText();
    let ast: DocumentNode;
    try {
      ast = parse(text, { noLocation: false });
    } catch {
      return [];
    }
    const symbols: vscode.DocumentSymbol[] = [];
    for (const def of ast.definitions) {
      switch (def.kind) {
        case Kind.OPERATION_DEFINITION:
          this.handleOperation(
            document,
            def as OperationDefinitionNode,
            symbols
          );
          break;
        case Kind.FRAGMENT_DEFINITION:
          this.handleFragment(document, def as FragmentDefinitionNode, symbols);
          break;
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.INTERFACE_TYPE_DEFINITION:
        case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        case Kind.ENUM_TYPE_DEFINITION:
        case Kind.UNION_TYPE_DEFINITION:
        case Kind.SCALAR_TYPE_DEFINITION:
          this.handleTypeDefinition(document, def as any, symbols);
          break;
      }
    }
    return symbols;
  }

  // Create a symbol from OperationDefinitionNode
  private handleOperation(
    document: vscode.TextDocument,
    node: OperationDefinitionNode,
    symbols: vscode.DocumentSymbol[]
  ) {
    const name = node.name?.value || 'anonymous';
    const kind = this.kindToSymbolKind[Kind.OPERATION_DEFINITION];
    const selStart = node.name?.loc?.start;
    const selEnd = node.name?.loc?.end;
    const symbol = this.createSymbol(
      document,
      name,
      node.operation,
      kind,
      node.loc!.start,
      node.loc!.end,
      selStart,
      selEnd
    );
    if (node.selectionSet) {
      this.convertSelectionSet(document, node.selectionSet, symbol);
    }
    symbols.push(symbol);
  }

  // Create a symbol from FragmentDefinitionNode
  private handleFragment(
    document: vscode.TextDocument,
    node: FragmentDefinitionNode,
    symbols: vscode.DocumentSymbol[]
  ) {
    const name = node.name.value;
    const detail = `fragment on ${node.typeCondition.name.value}`;
    const kind = this.kindToSymbolKind[Kind.FRAGMENT_DEFINITION];
    const selStart = node.name.loc?.start;
    const selEnd = node.name.loc?.end;
    const symbol = this.createSymbol(
      document,
      name,
      detail,
      kind,
      node.loc!.start,
      node.loc!.end,
      selStart,
      selEnd
    );
    if (node.selectionSet) {
      this.convertSelectionSet(document, node.selectionSet, symbol);
    }
    symbols.push(symbol);
  }

  // Create symbols from type definition nodes
  private handleTypeDefinition(
    document: vscode.TextDocument,
    node:
      | ObjectTypeDefinitionNode
      | InterfaceTypeDefinitionNode
      | InputObjectTypeDefinitionNode
      | EnumTypeDefinitionNode
      | UnionTypeDefinitionNode
      | ScalarTypeDefinitionNode,
    symbols: vscode.DocumentSymbol[]
  ) {
    const name = (node as any).name.value;
    const kindVal =
      this.kindToSymbolKind[node.kind as keyof typeof this.kindToSymbolKind] ??
      this.kindToSymbolKind[Kind.OBJECT_TYPE_DEFINITION];
    const selStart = (node as any).name.loc?.start;
    const selEnd = (node as any).name.loc?.end;
    const symbol = this.createSymbol(
      document,
      name,
      '',
      kindVal,
      node.loc!.start,
      node.loc!.end,
      selStart,
      selEnd
    );
    if ('fields' in node && node.fields) {
      for (const field of node.fields as FieldDefinitionNode[]) {
        const fname = field.name.value;
        const fDetail = print(field.type);
        const argCount = field.arguments?.length ?? 0;
        const fKind =
          argCount > 0
            ? this.kindToSymbolKind['FieldWithArguments']
            : this.kindToSymbolKind[Kind.FIELD_DEFINITION];
        // selection range for field name, fallback to full field loc if name loc missing
        const fieldSelStart = field.name.loc?.start ?? field.loc!.start;
        const fieldSelEnd = field.name.loc?.end ?? field.loc!.end;
        symbol.children.push(
          this.createSymbol(
            document,
            fname,
            fDetail,
            fKind,
            field.loc!.start,
            field.loc!.end,
            fieldSelStart,
            fieldSelEnd
          )
        );
      }
    }
    if (node.kind === Kind.ENUM_TYPE_DEFINITION && node.values) {
      for (const val of node.values as EnumValueDefinitionNode[]) {
        // selection range for enum value name, fallback if missing
        const enumSelStart = val.name.loc?.start ?? val.loc!.start;
        const enumSelEnd = val.name.loc?.end ?? val.loc!.end;
        symbol.children.push(
          this.createSymbol(
            document,
            val.name.value,
            'enum value',
            this.kindToSymbolKind[Kind.ENUM_VALUE_DEFINITION],
            val.loc!.start,
            val.loc!.end,
            enumSelStart,
            enumSelEnd
          )
        );
      }
    }
    symbols.push(symbol);
  }

  // Recursively generate field symbols from a SelectionSetNode
  private convertSelectionSet(
    document: vscode.TextDocument,
    sel: SelectionSetNode,
    parent: vscode.DocumentSymbol
  ) {
    for (const s of sel.selections) {
      let fieldName: string;
      let detail = '';
      let kind: vscode.SymbolKind;
      const nodeLoc = (s as any).loc!;
      let childSymbol: vscode.DocumentSymbol;
      switch (s.kind) {
        case Kind.FIELD: {
          fieldName = (s as FieldNode).name.value;
          const argCount = (s as FieldNode).arguments?.length ?? 0;
          kind =
            argCount > 0
              ? this.kindToSymbolKind['FieldWithArguments']
              : this.kindToSymbolKind[Kind.FIELD];
          const nameNode = (s as FieldNode).name;
          childSymbol = this.createSymbol(
            document,
            fieldName,
            detail,
            kind,
            nodeLoc.start,
            nodeLoc.end,
            nameNode.loc?.start,
            nameNode.loc?.end
          );
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          fieldName = (s as FragmentSpreadNode).name.value;
          kind = this.kindToSymbolKind[Kind.FRAGMENT_SPREAD];
          const spreadNode = (s as FragmentSpreadNode).name;
          childSymbol = this.createSymbol(
            document,
            fieldName,
            detail,
            kind,
            nodeLoc.start,
            nodeLoc.end,
            spreadNode.loc?.start,
            spreadNode.loc?.end
          );
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          fieldName = 'inline fragment';
          kind = this.kindToSymbolKind[Kind.INLINE_FRAGMENT];
          childSymbol = this.createSymbol(
            document,
            fieldName,
            detail,
            kind,
            nodeLoc.start,
            nodeLoc.end
          );
          break;
        }
        default:
          continue;
      }
      if ((s as FieldNode).selectionSet) {
        this.convertSelectionSet(
          document,
          (s as FieldNode).selectionSet!,
          childSymbol
        );
      }
      parent.children.push(childSymbol);
    }
  }

  // Find the matching closing brace
  private findMatchingBracket(text: string, openBraceIndex: number): number {
    return this.bracketMap.get(openBraceIndex) ?? openBraceIndex;
  }
}
