// #region Imports

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigurationResolver, type IResolvedConfiguration } from './ConfigurationResolver';
import { ConfigurationWriter } from './ConfigurationWriter';

// #endregion

const EXECUTOR = '@pixel-brewery/nx-tasks:localizator';

describe('ConfigurationWriter', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-writer-')));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function write(path: string, text: string): string {
    const file = join(workspace, path);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);

    return file;
  }

  function resolve(cwd = workspace): IResolvedConfiguration {
    return new ConfigurationResolver({}).resolve({ cwd });
  }

  it('changes a value in the file it comes from and leaves the rest of the file alone', () => {
    // arrange
    const file = write(
      'wortlaut.config.json',
      '{\n    // keep me\n    "actions": { "sort": { "order": "asc" } },\n    "output": "x"\n}\n',
    );

    // act
    const edit = ConfigurationWriter.edit(resolve(), 'actions.sort.order', 'desc');

    // assert
    expect(edit.file).toBe(file);
    expect(edit.content).toBe(
      '{\n    // keep me\n    "actions": { "sort": { "order": "desc" } },\n    "output": "x"\n}\n',
    );
  });

  it('adds a value nobody sets to the configuration file that exists', () => {
    // arrange
    const file = write('localizator.config.json', '{\n  "output": "x"\n}\n');

    // act
    const edit = ConfigurationWriter.edit(resolve(), 'actions.sort.order', 'desc');

    // assert
    expect(edit.file).toBe(file);
    expect(JSON.parse(edit.content)).toEqual({ output: 'x', actions: { sort: { order: 'desc' } } });
  });

  it('creates wortlaut.config.json for a project without any configuration', () => {
    // act
    const edit = ConfigurationWriter.edit(resolve(), 'actions.sort.order', 'desc');

    // assert
    expect(edit.file).toBe(join(workspace, 'wortlaut.config.json'));
    expect(JSON.parse(edit.content)).toEqual({ actions: { sort: { order: 'desc' } } });
  });

  it('changes a value of project.json in project.json', () => {
    // arrange
    write('nx.json', '{}');
    const file = write(
      'libs/a/project.json',
      JSON.stringify({
        targets: { intl: { executor: EXECUTOR, options: { actions: { sort: { order: 'asc' } } } } },
      }),
    );

    // act
    const edit = ConfigurationWriter.edit(
      resolve(join(workspace, 'libs/a')),
      'actions.sort.order',
      'desc',
    );

    // assert
    expect(edit.file).toBe(file);
    expect(JSON.parse(edit.content).targets.intl.options.actions.sort.order).toBe('desc');
  });

  it('turns a shared default into an override in project.json that keeps the rest of the inherited option', () => {
    // arrange
    const shared =
      '{"targetDefaults":{"@pixel-brewery/nx-tasks:localizator":{"options":{"actions":{"sort":{"order":"asc"},"detect":{"preset":"angular"}}}}}}';
    write('nx.json', shared);
    const file = write(
      'libs/a/project.json',
      JSON.stringify({ targets: { intl: { executor: EXECUTOR } } }),
    );

    // act
    const edit = ConfigurationWriter.edit(
      resolve(join(workspace, 'libs/a')),
      'actions.sort.order',
      'desc',
    );

    // assert
    expect(edit.file).toBe(file);
    expect(JSON.parse(edit.content).targets.intl.options.actions).toEqual({
      sort: { order: 'desc' },
      detect: { preset: 'angular' },
    });
  });

  it('edits the configuration of project.json for a value from there', () => {
    // arrange
    write('nx.json', '{}');
    write(
      'libs/a/project.json',
      JSON.stringify({
        targets: {
          intl: {
            executor: EXECUTOR,
            defaultConfiguration: 'ci',
            configurations: { ci: { output: 'x' } },
          },
        },
      }),
    );

    // act
    const edit = ConfigurationWriter.edit(
      new ConfigurationResolver({}).resolve({
        cwd: join(workspace, 'libs/a'),
        configuration: 'ci',
      }),
      'output',
      'y',
    );

    // assert
    expect(JSON.parse(edit.content).targets.intl.configurations.ci.output).toBe('y');
  });

  it('refuses a plain secret and accepts a token', () => {
    // act & assert
    expect(() =>
      ConfigurationWriter.edit(resolve(), 'actions.generate.apiKey', 'sk-plain'),
    ).toThrow(/accepts only a token/);
    expect(
      JSON.parse(
        ConfigurationWriter.edit(resolve(), 'actions.generate.apiKey', '{env.KEY}').content,
      ).actions.generate.apiKey,
    ).toBe('{env.KEY}');
  });

  it('refuses a setting that does not exist and a value of the wrong kind', () => {
    // act & assert
    expect(() => ConfigurationWriter.edit(resolve(), 'actions.sort.nope', 'x')).toThrow(
      /no setting/,
    );
    expect(() => ConfigurationWriter.edit(resolve(), 'actions.sort.order', 'sideways')).toThrow(
      /invalid/,
    );
  });
});
