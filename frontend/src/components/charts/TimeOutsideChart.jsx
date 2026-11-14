/**
 * Minutes spent outside the safe zone per day.
 *
 * An area chart: this is a continuous quantity accumulated over time, and the
 * filled area reads as "how much" at a glance, which is the question a
 * caregiver actually asks. A crosshair plus tooltip is the default interaction
 * for line and area forms.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { chartTokens, MARK } from '../../lib/chartTheme';
import { ChartFrame, ChartTooltip } from './ChartKit';
import { formatDuration } from '../../lib/format';

export default function TimeOutsideChart({ data = [], isLoading = false, action = null }) {
  const { isDark } = useTheme();
  const tokens = chartTokens(isDark);

  // Slot 1 (orange): time outside the safe zone is the counterpart to the blue
  // distance series, and the two are often read side by side.
  const color = tokens.series[1];
  const series = [{ key: 'minutesOutside', label: 'Time outside safe zone', color }];

  return (
    <ChartFrame
      title="Time outside the safe zone"
      subtitle="Minutes per day beyond the home boundary"
      series={series}
      data={data}
      unit=" min"
      isLoading={isLoading}
      action={action}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            {/* A soft vertical fade keeps the fill from competing with the
                stroke, which is what carries the shape. */}
            <linearGradient id="timeOutsideFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>

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
            allowDecimals={false}
            unit="m"
          />
          <Tooltip
            content={<ChartTooltip formatter={(value) => formatDuration(value)} />}
            // The crosshair that makes an area chart readable at a glance.
            cursor={{ stroke: tokens.axis, strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="minutesOutside"
            name="Time outside"
            stroke={color}
            strokeWidth={MARK.lineWidth}
            fill="url(#timeOutsideFill)"
            // A ring in the surface colour keeps the hovered point legible
            // where it overlaps the filled area.
            activeDot={{
              r: MARK.activeDotRadius,
              fill: color,
              stroke: tokens.surface,
              strokeWidth: 2,
            }}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
