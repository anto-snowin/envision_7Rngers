/**
 * Alerts per day, broken down by type.
 *
 * Stacked bars: the total per day is the headline, and the composition explains
 * it. A 2px surface-coloured gap separates the segments so adjacent fills never
 * blend into one another, and the legend plus the table view in `ChartFrame`
 * mean the breakdown is never readable by colour alone.
 */
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { chartTokens, MARK } from '../../lib/chartTheme';
import { ChartFrame, ChartTooltip } from './ChartKit';

/**
 * Series are declared in a fixed order so a colour always means the same alert
 * type. Filtering a type out must never repaint the remaining ones, which is
 * why the colour comes from this fixed index rather than from render order.
 */
const SERIES_DEFINITION = [
  { key: 'safeZoneExits', label: 'Left safe zone', slot: 0 },
  { key: 'dangerZoneEntries', label: 'Danger zone', slot: 1 },
  { key: 'offline', label: 'Offline', slot: 2 },
  { key: 'lowBattery', label: 'Low battery', slot: 3 },
  { key: 'sos', label: 'SOS', slot: 4 },
];

export default function AlertsChart({ data = [], isLoading = false, action = null }) {
  const { isDark } = useTheme();
  const tokens = chartTokens(isDark);

  const series = SERIES_DEFINITION.map((entry) => ({
    ...entry,
    color: tokens.series[entry.slot],
  }));

  return (
    <ChartFrame
      title="Alerts by day"
      subtitle="What triggered each alert"
      series={series}
      data={data}
      isLoading={isLoading}
      action={action}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid stroke={tokens.grid} strokeDasharray={MARK.gridDash} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={tokens.axis}
            tick={{ fill: tokens.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: tokens.axis }}
          />
          <YAxis
            stroke={tokens.axis}
            tick={{ fill: tokens.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
            // Alert counts are whole numbers; fractional ticks would be nonsense.
            allowDecimals={false}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(11,11,11,0.04)' }}
          />

          {series.map((entry, index) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              name={entry.label}
              stackId="alerts"
              fill={entry.color}
              // Only the topmost segment gets rounded ends, so the stack reads
              // as one bar rather than a pile of separate pills.
              radius={index === series.length - 1 ? MARK.barRadius : 0}
              // The gap that keeps adjacent fills from blending.
              stroke={tokens.surface}
              strokeWidth={MARK.barGap}
              maxBarSize={44}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
