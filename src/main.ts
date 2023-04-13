import {getInput, error, setFailed} from '@actions/core'
import {XMLParser} from 'fast-xml-parser'
import {existsSync, readFileSync} from 'fs'
import {readFile, writeFile} from 'fs/promises'
import {glob} from 'glob'
import path from 'path'

interface Metric {
  loc: number
  ncloc: number
  methods: number
  coveredmethods: number
  conditionals: number
  coveredconditionals: number
  statements: number
  coveredstatements: number
  elements: number
  coveredelements: number
  classes: number
  coveredclasses: number
}

interface ClassMetric extends Metric {
  name: string
  complexity: number
}

interface PackageMetric extends Metric {
  name: string
}

interface SummaryMetric extends Metric {
  files: number
}

interface Package {
  name: string
  metrics: PackageMetric
  classes: {[key: string]: ClassMetric}
}

interface Packages {
  [key: string]: Package
}

const packageNamePathMap = new Map<string, string>()

export async function guessPackageNameByFilePath(
  file: string
): Promise<string> {
  const parts = file.split('/')

  let packageName = 'unknown'

  try {
    parts.reduce((filePath, part) => {
      if (packageNamePathMap.has(filePath)) {
        packageName = packageNamePathMap.get(filePath) || packageName
      }
      return `${filePath}/${part}`.replace(/\/\//g, '/')
    }, '')
  } catch (e) {
    if (e instanceof Error) error(e)
  }

  if (packageName !== 'unknown') {
    return packageName
  }

  do {
    parts.pop()
    const filePath = parts.join('/')
    if (existsSync(`${filePath}/composer.json`)) {
      try {
        const foo = path.resolve(filePath, 'composer.json')
        const json = readFileSync(foo, 'utf8')
        packageName = JSON.parse(json)['name']
        break
      } catch (e) {
        if (e instanceof Error) error(e)
      }
    }
  } while (parts.length > 0)

  packageNamePathMap.set(parts.join('/'), packageName)

  return packageName
}

export function getMetricRow(
  name: string,
  metrics: Metric,
  bold = false
): string {
  const percentage = parseInt(
    ((metrics.coveredmethods / metrics.methods) * 100).toString(),
    10
  )
  return `<tr>
  <td>${bold ? '<strong>' : ''}${name}
  <td align="center">${bold ? '<strong>' : ''}${(
    (metrics.coveredstatements / metrics.statements || 0) * 100
  ).toFixed(2)}%
  <td align="right">${bold ? '<strong>' : ''}${metrics.coveredstatements}/${
    metrics.statements
  }
  <td align="center">${bold ? '<strong>' : ''}${(
    (metrics.coveredmethods / metrics.methods || 0) * 100
  ).toFixed(2)}%
  <td align="right">${bold ? '<strong>' : ''}${metrics.coveredmethods}/${
    metrics.methods
  }
  <td align="center">${bold ? '<strong>' : ''}${(
    (metrics.coveredclasses / metrics.classes) *
    100
  ).toFixed(2)}%
  <td align="right">${bold ? '<strong>' : ''}${metrics.coveredclasses}/${
    metrics.classes
  }
  <td align="center">${bold ? '<strong>' : ''}${
    percentage === 100
      ? '🚀'
      : percentage > 80
      ? '✅'
      : percentage > 50
      ? '➖'
      : '❌'
  }`
}

export async function run(): Promise<{summary: string; details: string}> {
  const summary: string[] = ['']
  const details: string[] = ['']

  try {
    const files = await glob(getInput('filename'), {ignore: 'node_modules/**'})

    for (const filePath of files) {
      const xmlData = await readFile(path.resolve(filePath), 'utf8')

      const options = {
        ignoreAttributes: false
      }

      const parser = new XMLParser(options)
      const reportData = parser.parse(xmlData)

      const packages: Packages = {}
      for (const file of reportData.coverage.project.file) {
        const packageName = await guessPackageNameByFilePath(file['@_name'])

        if (packageName === undefined) {
          continue
        }

        if (!packages.hasOwnProperty(packageName)) {
          packages[packageName] = {
            name: packageName,
            classes: {},
            metrics: {
              name: packageName,
              classes: 0,
              coveredclasses: 0,
              loc: 0,
              ncloc: 0,
              methods: 0,
              coveredmethods: 0,
              conditionals: 0,
              coveredconditionals: 0,
              statements: 0,
              coveredstatements: 0,
              elements: 0,
              coveredelements: 0
            }
          }
        }

        packages[packageName].metrics.classes += parseInt(
          file.metrics['@_classes'],
          10
        )
        packages[packageName].metrics.loc += parseInt(file.metrics['@_loc'], 10)
        packages[packageName].metrics.ncloc += parseInt(
          file.metrics['@_ncloc'],
          10
        )
        packages[packageName].metrics.methods += parseInt(
          file.metrics['@_methods'],
          10
        )
        packages[packageName].metrics.coveredmethods += parseInt(
          file.metrics['@_coveredmethods'],
          10
        )
        packages[packageName].metrics.conditionals += parseInt(
          file.metrics['@_conditionals'],
          10
        )
        packages[packageName].metrics.coveredconditionals += parseInt(
          file.metrics['@_coveredconditionals'],
          10
        )
        packages[packageName].metrics.statements += parseInt(
          file.metrics['@_statements'],
          10
        )
        packages[packageName].metrics.coveredstatements += parseInt(
          file.metrics['@_coveredstatements'],
          10
        )
        packages[packageName].metrics.elements += parseInt(
          file.metrics['@_elements'],
          10
        )
        packages[packageName].metrics.coveredelements += parseInt(
          file.metrics['@_coveredelements'],
          10
        )

        if (!file.hasOwnProperty('class')) {
          continue
        }
        const statements = parseInt(file.class.metrics['@_statements'], 10)
        const coveredstatements = parseInt(
          file.class.metrics['@_coveredstatements'],
          10
        )

        const covered =
          parseInt(((coveredstatements / statements) * 100).toString(), 10) ===
          100
            ? 1
            : 0

        packages[packageName].classes[file.class['@_name']] = {
          name: file.class['@_name'],
          classes: 1,
          coveredclasses: covered,
          complexity: parseInt(file.class.metrics['@_complexity'], 10),
          loc: parseInt(file.class.metrics['@_loc'], 10),
          ncloc: parseInt(file.class.metrics['@_ncloc'], 10),
          methods: parseInt(file.class.metrics['@_methods'], 10),
          coveredmethods: parseInt(file.class.metrics['@_coveredmethods'], 10),
          conditionals: parseInt(file.class.metrics['@_conditionals'], 10),
          coveredconditionals: parseInt(
            file.class.metrics['@_coveredconditionals'],
            10
          ),
          statements: parseInt(file.class.metrics['@_statements'], 10),
          coveredstatements: parseInt(
            file.class.metrics['@_coveredstatements'],
            10
          ),
          elements: parseInt(file.class.metrics['@_elements'], 10),
          coveredelements: parseInt(file.class.metrics['@_coveredelements'], 10)
        }
        packages[packageName].metrics.coveredclasses += covered
      }

      const summaryMetric: SummaryMetric = {
        files: parseInt(reportData.coverage.project.metrics['@_files'], 10),
        loc: parseInt(reportData.coverage.project.metrics['@_loc'], 10),
        ncloc: parseInt(reportData.coverage.project.metrics['@_ncloc'], 10),
        classes: parseInt(reportData.coverage.project.metrics['@_classes'], 10),
        coveredclasses: Object.values(packages).reduce(
          (covered, _package) => covered + _package.metrics.coveredclasses,
          0
        ),
        methods: parseInt(reportData.coverage.project.metrics['@_methods'], 10),
        coveredmethods: parseInt(
          reportData.coverage.project.metrics['@_coveredmethods'],
          10
        ),
        conditionals: parseInt(
          reportData.coverage.project.metrics['@_conditionals'],
          10
        ),
        coveredconditionals: parseInt(
          reportData.coverage.project.metrics['@_coveredconditionals'],
          10
        ),
        statements: parseInt(
          reportData.coverage.project.metrics['@_statements'],
          10
        ),
        coveredstatements: parseInt(
          reportData.coverage.project.metrics['@_coveredstatements'],
          10
        ),
        elements: parseInt(
          reportData.coverage.project.metrics['@_elements'],
          10
        ),
        coveredelements: parseInt(
          reportData.coverage.project.metrics['@_coveredelements'],
          10
        )
      }

      summary.push(`<table>
      <tr>
        <th colspan="8">Code Coverage
      <tr>
        <th colspan="1">Package
        <th colspan="2">Lines
        <th colspan="2">Functions
        <th colspan="2">Classes
        <th colspan="1">Health
      ${Object.values(packages)
        .map(_package => getMetricRow(_package.name, _package.metrics))
        .join('\n')}
      ${getMetricRow('Summary', summaryMetric, true)}
      </table>`)
      summary.push('')
      summary.push('')

      details.push(`<details>
          <summary>Code Coverage details</summary>
          <table>
            <tr>
              <th colspan="8">Code Coverage
            <tr>
              <th colspan="1">Class
              <th colspan="2">Lines
              <th colspan="2">Functions
              <th colspan="2">Classes
              <th colspan="1">Health
            ${Object.values(packages)
              .map(
                _package => `<tr>
              <td colspan="8"><strong>${_package.name}
              ${Object.values(_package.classes)
                .map(_class => getMetricRow(_class.name, _class))
                .join('\n')}`
              )
              .join('\n')}
            ${getMetricRow('Summary', summaryMetric, true)}
          </table>
        </details>`)
      details.push('')
      details.push('')
    }
  } catch (e) {
    if (e instanceof Error) setFailed(e.message)
  }

  await writeFile(path.resolve('code-coverage-results.md'), summary.join('\n'))
  await writeFile(
    path.resolve('code-coverage-results-details.md'),
    details.join('\n')
  )
  return {
    summary: summary.join('\n'),
    details: details.join('\n')
  }
}

run()
