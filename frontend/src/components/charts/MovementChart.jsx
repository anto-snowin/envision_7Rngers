/**
 * Distance travelled per day.
 *
 * A bar chart: the job is comparing discrete daily magnitudes, and bars anchored
 * to a zero baseline make that comparison honest in a way a line between
 * daily points would not.
 */
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { chartTokens, MARK } from '../../lib/chartTheme';
import { ChartFrame, ChartTooltip } from './ChartKit';

export default function MovementChart({ data = [], isLoading = false, action = null }) {
  const { isDark } = useTheme();
  const tokens = chartTokens(isDark);

  // One series, so no legend is needed — the title names the measure.
  const series = [{ key: 'distanceKm', label: 'Distance (km)', color: tokens.single }];

  return (
    <ChartFrame
      title="Daily movement"
      subtitle="Distance travelled each day"
      series={series}
      data={data}
      unit=" km"
      isLoading={isLoading}
      action={action}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          {/* Horizontal rules only: vertical ones add nothing on a time axis. */}
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
            width={44}
            unit=" km"
          />
          <Tooltip
            content={<ChartTooltip formatter={(value) => `${value} km`} />}
            // Highlight the hovered bar's column rather than tinting the bar.
            cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(11,11,11,0.04)' }}
          />
          <Bar
            dataKey="distanceKm"
            name="Distance"
            fill={tokens.single}
            radius={MARK.barRadius}
            maxBarSize={44}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
