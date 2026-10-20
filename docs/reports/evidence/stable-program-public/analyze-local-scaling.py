"""Reaggregate sealed 22/23 scale evidence; never run LSP or replace original evidence."""
import csv
import hashlib
import json
from pathlib import Path
from statistics import median
import sys

BASE = Path('.bench/stable-program-v1')
EVIDENCE = Path('docs/reports/evidence/2026-10-20-stable-program-checkpoint-23')
ARCHIVE = json.loads((EVIDENCE / 'archive-manifest.json').read_text())['contents']
consumed = {}


def read(file):
    data = file.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    assert str(file) in ARCHIVE, file
    assert digest == ARCHIVE[str(file)]['sha256'], file
    consumed[str(file)] = digest
    return data.decode()


def load(file):
    return json.loads(read(file))


def lines(file):
    return [json.loads(line) for line in read(file).splitlines()]


def normalized(response):
    value = json.loads(json.dumps(response['response']['result']))
    if response['method'] == 'textDocument/completion':
        for item in value if isinstance(value, list) else value['items']:
            item.pop('data', None)
    return value


SUITES = [
    ('total-64', '合成64', 'synthetic', 64),
    ('total-256', '合成256', 'synthetic', 256),
    ('total-1024', '合成1024', 'synthetic', 1024),
    ('total-2048', '合成2048', 'synthetic', 2048),
    ('fixed', 'Photos+0', 'photos', 0),
    ('photos-noise-128', 'Photos+128', 'photos', 128),
    ('photos-noise-512', 'Photos+512', 'photos', 512),
]
STATES = [
    'disk-first-completion', 'disk-repeat-completion', 'disk-definition',
    'open-first-completion', 'open-repeat-completion', 'open-definition',
    'reopen-completion', 'reopen-definition', 'reopen-completion', 'reopen-definition',
    'rename', 'renamed-references-first', 'renamed-references-repeat',
]
VERSIONS = ['checkpoint-22', 'checkpoint-23']
index = load(BASE / 'incremental23-paired-index.json')
assert len(index) == 54
summarized = load(EVIDENCE / 'summary.json')
original_groups = {(r['suite'], r['operationIndex']): r for r in summarized['perOperation']}
samples, initializations, scopes = [], [], []
groups, paired, plans = {}, {}, {}
for suite, label, cohort, level in SUITES:
    selected = [row for row in index if row['suite'] == suite]
    assert len(selected) == 6
    for entry in selected:
        variant, trial = entry['variant'], entry['trial']
        report_file = Path(entry['report'])
        report, responses = load(report_file), lines(report_file.parent / 'responses.ndjson')
        assert len(responses) == 13 and entry['exit'] in [0, 2]
        assert report['inputsUnchanged'] and report['runtimeUnchanged'] and not report['samplerErrors']
        assert report['close']['exit'] == {'code': 0, 'signal': None}
        assert report['preparation']['report']['semanticState'] == 'degraded'
        assert report['preparation']['report']['unavailableInput']['code'] == 2307
        events = lines(report_file.parent / 'logs/server.log')
        cache = [e['event'] for e in events if e['event'].startswith('references.cache.')]
        assert cache == ['references.cache.miss', 'references.cache.store', 'references.cache.hit']
        paired[suite, trial, variant] = responses
        initializations.append({'suite': suite, 'label': label, 'variant': variant, 'trial': trial,
            'milliseconds': report['initializationMs'], 'report': str(report_file)})
        for operation, row in enumerate(responses, 1):
            assert row['operationIndex'] == operation and row['category'] == STATES[operation - 1]
            assert row['check']['pass'] and 'error' not in row['response']
            assert row['elapsedMs'] >= 0
            groups.setdefault((suite, variant, operation), []).append(row['elapsedMs'])
            samples.append({'suite': suite, 'label': label, 'cohort': cohort, 'level': level,
                'variant': variant, 'trial': trial, 'operationIndex': operation,
                'category': row['category'], 'elapsedMs': row['elapsedMs'], 'file': row['file'],
                'symbol': row['symbol'], 'position': row['position'], 'precondition': row['precondition'],
                'resultCache': 'MISS' if operation == 12 else 'HIT' if operation == 13 else 'UNMEASURED',
                'cacheEvidence': str(report_file.parent / 'logs/server.log') if operation >= 12 else '',
                'raw': str(report_file.parent / 'responses.ndjson')})
    case_id = selected[0]['caseId']
    plan = load(Path('.bench/mac-photos-scaling-v1/fixtures-v2') / (case_id + '.json'))
    plans[suite] = plan
    if cohort == 'synthetic':
        assert plan['sourceFiles'] == level and plan['targetBytes'] == 314
        assert plan['graph'] == {'nodes': 16, 'edges': 16, 'rootFanout': 1, 'maxChainDepth': 16}
    else:
        assert plan['sourceFiles'] == 289 + level and plan['targetBytes'] == 5100
    for variant in VERSIONS:
        trace = BASE / 'runs' / f'{case_id}-{variant}-trace-incremental23-input-{suite}-1'
        events = lines(trace / 'logs/server.log')
        wanted = ['completion.program.complete', 'semantic.definition.complete',
            'semantic.rename.complete', 'semantic.references.complete']
        stats = [e for e in events if e['event'] in wanted]
        assert len(stats) == 12
        assert all(e['programSequence'] == stats[0]['programSequence'] for e in stats[:6])
        assert stats[6]['programSequence'] == stats[7]['programSequence'] != stats[0]['programSequence']
        assert stats[8]['programSequence'] == stats[9]['programSequence'] != stats[6]['programSequence']
        expected = 19 if cohort == 'synthetic' else 171
        full_expected = level if cohort == 'synthetic' else 284 + level
        assert all(e['programProjectFiles'] == expected for e in stats[:10])
        assert all(e['programProjectFiles'] == full_expected for e in stats[10:])
        scopes.append({'suite': suite, 'label': label, 'variant': variant,
            'rawSourceFiles': plan['sourceFiles'], 'rawAllFiles': len(plan['fileHashes']),
            'addedIndependentSources': level - 19 if cohort == 'synthetic' else level,
            'independentSourceMeaning': 'all noise module sources' if cohort == 'synthetic'
                else 'added F*.ts only, excluding the preexisting Noise.ts seed',
            'nodeDependencies': 16 if cohort == 'synthetic' else 'UNMEASURED separately',
            'completionDefinitionProjectFiles': expected,
            'completionDefinitionSdkFiles': stats[0]['sdkSourceFiles'],
            'completionDefinitionOtherFiles': stats[0]['otherSourceFiles'],
            'renameReferencesProjectFiles': full_expected,
            'renameReferencesSdkFiles': stats[-1]['sdkSourceFiles'],
            'renameReferencesOtherFiles': stats[-1]['otherSourceFiles'],
            'traceStatsByOperation': [{key: e.get(key) for key in ['event', 'programSequence',
                'programProjectFiles', 'programSourceFiles', 'sdkSourceFiles',
                'createProgramEvents']} for e in stats], 'evidence': str(trace / 'logs/server.log')})

assert len(samples) == 546 and len(initializations) == 42 and len(scopes) == 14
for suite, _, _, _ in SUITES:
    for trial in [1, 2, 3]:
        left, right = (paired[suite, trial, v] for v in VERSIONS)
        for before, after in zip(left, right):
            for key in ['operationIndex', 'file', 'symbol', 'position', 'sourceSha256', 'params']:
                assert before[key] == after[key]
            assert normalized(before) == normalized(after)
statistics = []
for (suite, variant, operation), values in groups.items():
    assert len(values) == 3
    assert values == original_groups[suite, operation][variant]
    assert median(values) == original_groups[suite, operation][variant + '-medianMs']
    statistics.append({'suite': suite, 'variant': variant, 'operationIndex': operation,
        'category': STATES[operation - 1], 'n': len(values), 'medianMs': median(values),
        'maxMs': max(values), 'valuesMs': values, 'over500': sum(v > 500 for v in values)})
assert len(statistics) == 182
growth = []
for cohort, low, high in [('synthetic', 'total-64', 'total-2048'),
        ('photos', 'fixed', 'photos-noise-512')]:
    for variant in VERSIONS:
        for op in range(1, 14):
            start, finish = (median(groups[s, variant, op]) for s in [low, high])
            growth.append({'cohort': cohort, 'variant': variant, 'operationIndex': op,
                'category': STATES[op - 1], 'startMedianMs': start, 'endMedianMs': finish,
                'absoluteIncreaseMs': finish - start, 'increasePercent': (finish / start - 1) * 100,
                'meaning': 'observed endpoint difference, not a complexity fit or per-file cost'})

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=False)


def save_json(name, data):
    (out / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def save_csv(name, rows):
    with (out / name).open('w', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v
            for k, v in row.items()} for row in rows)


save_csv('samples.csv', samples)
save_csv('statistics.csv', statistics)
save_json('initialization.json', initializations)
save_json('scopes.json', scopes)
save_json('endpoint-growth.json', growth)
md = ['# checkpoint-23递增规模：现有封存数据重新汇总', '',
    '所有操作表单位ms，单元格为三轮中位数 / 最大值。状态不混池。', '']


def table(title, headers, rows):
    md.extend(['## ' + title, '', '| ' + ' | '.join(headers) + ' |',
        '| ' + ' | '.join(['---'] * len(headers)) + ' |'])
    md.extend('| ' + ' | '.join(row) + ' |' for row in rows)
    md.append('')


def cell(suite, op, variant='checkpoint-23'):
    values = groups[suite, variant, op]
    return f'{median(values):.3f} / {max(values):.3f}'


table('源码与语义范围', ['场景', '磁盘源码', '补全/定义项目', 'rename/refs项目',
    '补全/定义SDK', 'rename/refs SDK', '其他库'], [
    [r['label']] + [str(r[k]) for k in ['rawSourceFiles', 'completionDefinitionProjectFiles',
        'renameReferencesProjectFiles', 'completionDefinitionSdkFiles',
        'renameReferencesSdkFiles', 'renameReferencesOtherFiles']]
    for r in scopes if r['variant'] == 'checkpoint-23'])
for title, ops in [('23核心操作', [1, 3, 11, 12]), ('23热态', [2, 4, 5, 6]),
        ('23关闭重开', [7, 8, 9, 10])]:
    table(title, ['场景'] + [f'op{op} {STATES[op - 1]}' for op in ops],
        [[label] + [cell(suite, op) for op in ops] for suite, label, _, _ in SUITES])
table('23冷启动与结果缓存', ['场景', '初始化ms中位/最大', 'op13结果缓存HIT ms'], [
    [label, f'{median(v):.3f} / {max(v):.3f}', cell(suite, 13)]
    for suite, label, _, _ in SUITES
    for v in [[r['milliseconds'] for r in initializations if r['suite'] == suite
        and r['variant'] == 'checkpoint-23']]])
for op in range(1, 14):
    table(f'op{op} {STATES[op - 1]}，22对23', ['场景', '22中位/最大', '23中位/最大'],
        [[label, cell(suite, op, 'checkpoint-22'), cell(suite, op)]
        for suite, label, _, _ in SUITES])
(out / 'tables.md').write_text('\n'.join(md))
save_json('provenance.json', {'normalSessions': 42, 'normalOperations': len(samples),
    'fullNormalizedComparisons': 273, 'scales': len(SUITES), 'trialsPerVersionPerScale': 3,
    'independentTraceSessionsUsedForScope': 14, 'newPerformanceSessions': 0,
    'resultCacheSequenceConfirmedNormalSessions': 42,
    'sourceSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'consumedSealedFiles': consumed, 'limitations': ['all degraded2307',
        'initialization measured separately; no query during initialization',
        'first definition follows two completion queries; no cold first-definition experiment',
        'completion/definition result-cache hits UNMEASURED, Program identity is separate trace evidence',
        'OS cache and desktop load uncontrolled; three rounds, no extrapolation to tens of thousands',
        'do not use trace phase times as exclusive normal RPC composition']})
print(json.dumps({'normalSessions': 42, 'normalOperations': len(samples),
    'statisticsRows': len(statistics), 'scopeTraces': len(scopes),
    'verifiedSealedInputs': len(consumed), 'newPerformanceSessions': 0, 'output': str(out)}))
