// #region Imports

import { Node, Project, type SourceFile } from 'ts-morph';
import type { ResourceContentFn } from './interfaces/IResourceInfo';
import type { ITypeScriptResourceInfo } from './interfaces/ITypeScriptResourceInfo';
import { ResourceType } from './interfaces/ResourceType';

// #endregion

/**
 * Writes a key as the name of a property. A key is text from a catalog, so it has to stay a string in the generated code.
 */
function toPropertyName(key: string): string {
  return `'${JSON.stringify(key).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
}

/**
 * Makes part of an identifier of a part of a file name, which may hold anything.
 */
function toIdentifierPart(text: string): string {
  return text.replace(/[^\p{L}\p{N}_$]/gu, '_');
}

/**
 * Represents a typescript resource.
 *
 * @public
 */
export class TypeScriptResourceInfo implements ITypeScriptResourceInfo {
  // #region Fields

  private readonly _name: string;
  private readonly _path: string;
  private readonly _language: string;
  private readonly _type: typeof ResourceType.TypeScript;
  private readonly _content: ResourceContentFn<Record<string, string>>;
  private _cacheContent: Record<string, string> | null;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `TypeScriptResourceInfo` class.
   *
   * @param resource The resource information.
   * @public
   */
  public constructor(resource: Partial<ITypeScriptResourceInfo> = {}) {
    this._name = resource.name ?? '';
    this._path = resource.path ?? '';
    this._language = resource.locale ?? '';
    this._type = ResourceType.TypeScript;
    this._cacheContent = null;
    this._content = (): Record<string, string> => {
      if (!this._cacheContent) {
        const c = resource.content ?? (() => ({}));
        return (this._cacheContent = c());
      }

      return this._cacheContent;
    };
  }

  // #endregion

  // #region Properties

  /**
   * Gets the `data` property.
   *
   * @public
   * @readonly
   */
  public get name(): string {
    return this._name;
  }

  /**
   * Gets the `data` property.
   *
   * @public
   * @readonly
   */
  public get path(): string {
    return this._path;
  }

  /**
   * Gets the `data` property.
   *
   * @public
   * @readonly
   */
  public get locale(): string {
    return this._language;
  }

  /**
   * Gets the `data` property.
   *
   * @public
   * @readonly
   */
  public get type(): typeof ResourceType.TypeScript {
    return this._type;
  }

  /**
   * Gets the `content` property.
   *
   * @public
   * @readonly
   */
  public get content(): ResourceContentFn<Record<string, string>> {
    return this._content;
  }

  /**
   * Gets the `isVirtual` property.
   *
   * @public
   * @readonly
   */
  public get isVirtual(): boolean {
    return this._path === '' || this._name === '';
  }

  // #endregion

  // #region Methods

  /**
   * Returns the keys of the resource.
   *
   * @public
   */
  public keys(): Array<string> {
    const content = this._content();

    return Object.keys(content);
  }

  /**
   * Returns the values of the resource.
   *
   * @public
   */
  public values(): Array<string> {
    const content = this._content();

    return Object.values(content);
  }

  /**
   * Returns the entries of the resource.
   *
   * @public
   */
  public entries(): Array<[string, string]> {
    const content = this._content();

    return Object.entries(content).map(([key, value]) => [key, value] as [string, string]);
  }

  /**
   * Clones the current instance.
   *
   * @public
   */
  public clone(): this {
    return this.copy(this);
  }

  /**
   * Copies the current instance.
   *
   * @public
   */
  public copy(resource: this): this {
    return new TypeScriptResourceInfo(resource) as this;
  }

  /**
   * Sorts the resource data.
   *
   * @public
   * @param order The order to sort the data.
   */
  public sort(order: 'asc' | 'desc'): this {
    const content = this._content();
    const sortedKeys = Object.keys(content).sort((a, b) =>
      order === 'asc' ? a.localeCompare(b) : b.localeCompare(a),
    );

    this._cacheContent = sortedKeys.reduce<Record<string, string>>((sorted, key) => {
      sorted[key] = content[key];
      return sorted;
    }, {});

    return this;
  }

  /**
   * Returns whether an existing TypeScript source already holds this resource: the same generated class with the same
   * keys and values in the same order. Line breaks, indentation and the quotes of string literals do not matter, so a
   * generated file that a formatter reformatted afterwards is still up to date and does not need to be written again.
   *
   * @public
   * @param source The content of the existing TypeScript file.
   */
  public isUpToDate(source: string): boolean {
    const generated = this.toString();

    if (source === generated) {
      return true;
    }

    const existingShape = TypeScriptResourceInfo.describe(source);

    return existingShape !== null && existingShape === TypeScriptResourceInfo.describe(generated);
  }

  /**
   * Converts the resource to a string.
   *
   * @public
   */
  public toString(): string {
    const content = this._content();
    const project = new Project();
    const sourceFile: SourceFile = project.createSourceFile(`${this.name}.ts`, '', {
      overwrite: true,
    });
    const className = `${toIdentifierPart(this._name.split('.')[0])}_${toIdentifierPart(this._language)}`;

    sourceFile.addStatements((writer) => {
      writer
        .writeLine('/* eslint-disable @stylistic/quotes */')
        .writeLine('/* eslint-disable @typescript-eslint/explicit-member-accessibility */')
        .writeLine('/* eslint-disable camelcase */')
        .writeLine('/* eslint-disable @typescript-eslint/naming-convention */')
        .writeLine('/* eslint-disable @typescript-eslint/class-literal-property-style */')
        .writeLine('');
    });

    sourceFile.addStatements((writer) => {
      writer
        .writeLine(
          '// ------------------------------------------------------------------------------',
        )
        .writeLine('// <auto-generated>')
        .writeLine('//     This code was generated by a tool.')
        .writeLine(
          '//     Changes to this file may cause incorrect behavior and will be lost if the code is regenerated.',
        )
        .writeLine('// </auto-generated>')
        .writeLine(
          '// ------------------------------------------------------------------------------',
        )
        .writeLine('');
    });

    sourceFile.addClass({
      name: className,
      isExported: true,
      docs: [
        {
          description: `This class contains the localized strings for the ${this._language} language.`,
          tags: [
            {
              tagName: 'public',
            },
          ],
        },
      ],
      properties: Object.entries(content).map(([key, value]) => ({
        name: toPropertyName(key),
        type: 'string',
        isStatic: true,
        isReadonly: true,
        hasQuestionToken: false,
        initializer: JSON.stringify(value),
      })),
      methods: [
        {
          docs: [
            {
              description: 'Returns all properties of the class as key value array.',
              tags: [
                {
                  tagName: 'public',
                },
                {
                  tagName: 'static',
                },
              ],
            },
          ],
          name: 'entries',
          isStatic: true,
          returnType: 'Array<[string, string]>',
          statements: (writer) =>
            writer
              .writeLine('const map = new Map<string, string>();')
              .writeLine(
                `Object.entries(${className}).forEach(([key, value]) => map.set(key, value));`,
              )
              .writeLine('return Array.from(map.entries());'),
        },
        {
          docs: [
            {
              description: 'Returns all properties of the class as key value object.',
              tags: [
                {
                  tagName: 'public',
                },
                {
                  tagName: 'static',
                },
              ],
            },
          ],
          name: 'toObject',
          isStatic: true,
          returnType: 'Record<string, string>',
          statements: (writer) =>
            writer
              .writeLine(
                `return Object.keys(${className}).reduce<Record<string, string>>((obj, key) => {`,
              )
              .indent(() => {
                writer.writeLine(`obj[key] = (${className} as any)[key];`);
                writer.writeLine('return obj;');
              })
              .writeLine('}, {});'),
        },
      ],
    });

    return sourceFile.getFullText();
  }

  /**
   * Describes a generated TypeScript resource independently of its formatting, or returns `null` when the source
   * does not contain an exported class.
   * The description holds the text before the class, the class name and every member in order: a property with a
   * string literal as the key and the value of both literals, any other member as its text, all without whitespace.
   *
   * @private
   */
  private static describe(source: string): string | null {
    const sourceFile = new Project({ useInMemoryFileSystem: true }).createSourceFile(
      'resource.ts',
      source,
    );
    const classDeclaration = sourceFile.getClasses().find((x) => x.isExported());

    if (!classDeclaration) {
      return null;
    }

    const withoutWhitespace = (text: string): string => text.replace(/\s+/g, '');
    const literalValue = (node: Node | undefined): string | null =>
      node && (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))
        ? node.getLiteralValue()
        : null;
    const members = classDeclaration.getMembers().map((member) => {
      if (Node.isPropertyDeclaration(member)) {
        const key = literalValue(member.getNameNode()) ?? member.getName();
        const value = literalValue(member.getInitializer());

        if (value !== null) {
          return [
            'property',
            member.isStatic(),
            member.isReadonly(),
            withoutWhitespace(member.getTypeNode()?.getText() ?? ''),
            key,
            value,
          ];
        }
      }

      return ['member', withoutWhitespace(member.getText())];
    });

    return JSON.stringify([
      withoutWhitespace(source.slice(0, classDeclaration.getStart())),
      classDeclaration.getName() ?? '',
      members,
    ]);
  }

  // #endregion
}
