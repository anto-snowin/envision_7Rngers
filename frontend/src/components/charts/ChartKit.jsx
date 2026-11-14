/**
 * Shared chart building blocks: tooltip, legend, table view and the frame that
 * wraps every chart.
 *
 * The table view is not a nice-to-have. Three of the five series hues sit below
 * 3:1 contrast on a white card, so colour alone must never be the only way to
 * read a value — the table is the relief for that, and the legend means
 * identity is never colour-alone either.
 */
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { chartTokens } from '../../lib/chartTheme';
import Card, { CardHeader } from '../shared/Card';
import { EmptyState } from '../shared/Feedback';
import { ChartIcon } from '../shared/Icons';

/**
 * Custom tooltip. Values wear text tokens, with a small colour chip beside each
 * to carry identity — the number itself is never tinted the series colour.
 */
export function ChartTooltip({ active, payload, label, unit = '', formatter = null }) {
  const { isDark } = useTheme();
  const tokens = chartTokens(isDark);

  if (!active || !payload?.length) return null;

  // Hide zero-value rows so a stacked tooltip does not list five empty series.
  const rows = payload.filter((entry) => entry.value != null && entry.value !== 0);
  if (!rows.length) return null;

  const total = rows.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);

  return (
    <div
      className="rounded-xl border px-3 py-2.5 text-xs shadow-lg"
      style={{
        backgroundColor: tokens.tooltipBg,
        borderColor: tokens.tooltipBorder,
        color: tokens.textPrimary,
      }}
    >
      <p className="mb-1.5 font-semibold">{label}</p>

      <div className="space-y-1">
        {rows.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5" style={{ color: tokens.textSecondary }}>
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-semibold tabular">
              {formatter ? formatter(entry.value) : `${entry.value}${unit}`}
            </span>
          </div>
        ))}
      </div>

      {rows.length > 1 ? (
        <div
          className="mt-1.5 flex justify-between gap-4 border-t pt-1.5 font-semibold"
          style={{ borderColor: tokens.tooltipBorder }}
        >
          <span style={{ color: tokens.textSecondary }}>Total</span>
          <span className="tabular">{formatter ? formatter(total) : `${total}${unit}`}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Legend rendered outside the SVG so it wraps properly at phone width.
 * Always present when there are two or more series.
 */
export function ChartLegend({ series }) {
  if (!series || series.length < 2) return null;

  return (
    <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      {series.map((entry) => (
        <li
          key={entry.key}
          className="flex items-center gap-1.5 text-xs text-surface-600 dark:text-surface-300"
        >
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Accessible table equivalent of the chart's data.
 * This is the relief for the low-contrast fills and a genuine alternative for
 * anyone using a screen reader.
 */
export function ChartTable({ data, series, labelKey = 'label', labelHeading = 'Day', unit = '' }) {
  return (
    <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-surface-200 dark:border-surface-800">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-50 dark:bg-surface-800">
          <tr>
            <th
              scope="col"
              className="px-3 py-2 text-left font-semibold text-surface-700 dark:text-surface-200"
            >
              {labelHeading}
            </th>
            {series.map((entry) => (
              <th
                key={entry.key}
                scope="col"
                className="px-3 py-2 text-right font-semibold text-surface-700 dark:text-surface-200"
              >
                {entry.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={row[labelKey] || index}
              className="border-t border-surface-100 dark:border-surface-800"
            >
              <th
                scope="row"
                className="px-3 py-2 text-left font-medium text-surface-600 dark:text-surface-300"
              >
                {row[labelKey]}
              </th>
              {series.map((entry) => (
                <td
                  key={entry.key}
                  className="px-3 py-2 text-right tabular text-surface-900 dark:text-surface-100"
                >
                  {row[entry.key] ?? 0}
                  {unit}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Standard chart frame: title, a chart/table toggle, and empty + loading states.
 *
 * @param {object} props
 * @param {Array<{key:string,label:string,color:string}>} props.series
 */
export function ChartFrame({
  title,
  subtitle = null,
  series = [],
  data = [],
  children,
  labelKey = 'label',
  labelHeading = 'Day',
  unit = '',
  isLoading = false,
  action = null,
  height = 260,
}) {
  const [showTable, setShowTable] = useState(false);

  const hasData = data?.some((row) => series.some((entry) => Number(row[entry.key]) > 0));

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex items-center gap-2">
            {action}
            <button
              type="button"
              onClick={() => setShowTable((value) => !value)}
              className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
              aria-pressed={showTable}
            >
              {showTable ? 'Chart' : 'Table'}
            </button>
          </div>
        }
      />

      {isLoading ? (
        <div className="skeleton" style={{ height }} />
      ) : !hasData ? (
        <EmptyState
          icon={<ChartIcon className="h-6 w-6" />}
          title="No data for this period"
          message="Tracking data will appear here once the patient's device starts reporting."
          className="!py-10"
        />
      ) : showTable ? (
        <ChartTable
          data={data}
          series={series}
          labelKey={labelKey}
          labelHeading={labelHeading}
          unit={unit}
        />
      ) : (
        <>
          <div style={{ height }}>{children}</div>
          <ChartLegend series={series} />
        </>
      )}
    </Card>
  );
}
