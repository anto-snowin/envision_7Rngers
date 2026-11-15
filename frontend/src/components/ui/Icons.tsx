/**
 * Inline icon set.
 *
 * Hand-rolled rather than pulled from a library: the app needs about twenty
 * glyphs, and shipping them inline keeps them on the same 1.75 stroke weight as
 * the rest of the system with no runtime dependency.
 */
type IconProps = React.SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v6c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 3 19.5h18L12 4Z" />
    <path d="M12 10v4.5" />
    <path d="M12 17.2h.01" />
  </Svg>
);

export const RadarIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <path d="M12 12 18.5 7" />
  </Svg>
);

export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" />
    <path d="M10.5 18.6h3" />
  </Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.6" />
    <path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8.5" r="3.3" />
    <path d="M3.5 19.6a6.2 6.2 0 0 1 12 0" />
    <path d="M16.2 5.6a3.3 3.3 0 0 1 0 6.1" />
    <path d="M17.8 14.2a6.2 6.2 0 0 1 3 4" />
  </Svg>
);

export const MapIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 6.8 6-2.3 6 2.3 6-2.3v12.7l-6 2.3-6-2.3-6 2.3V6.8Z" />
    <path d="M9 4.5v12.7M15 6.8v12.7" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.8" />
    <path d="M12 7.3V12l3.4 2" />
  </Svg>
);

export const WifiIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.8 9.1a14 14 0 0 1 18.4 0" />
    <path d="M6.2 12.7a9.2 9.2 0 0 1 11.6 0" />
    <path d="M9.5 16.3a4.5 4.5 0 0 1 5 0" />
    <path d="M12 19.8h.01" />
  </Svg>
);

export const WifiOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.8 9.1a14 14 0 0 1 5.3-3.3" />
    <path d="M15.4 6a14 14 0 0 1 5.8 3.1" />
    <path d="M9.5 16.3a4.5 4.5 0 0 1 5 0" />
    <path d="M12 19.8h.01" />
    <path d="M3 3l18 18" />
  </Svg>
);

export const BatteryIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.6" y="8" width="16" height="8" rx="2.2" />
    <path d="M21.4 11v2" />
  </Svg>
);

export const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.2 2.5 5 13.6h5.3L9.8 21.5 18 10.4h-5.3l.5-7.9Z" />
  </Svg>
);

export const SosIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.8" />
    <path d="M12 8v4.6" />
    <path d="M12 15.7h.01" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V4.8h5V7" />
    <path d="M6.6 7l.8 12.2h9.2L17.4 7" />
  </Svg>
);

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16.6 3.9a2 2 0 0 1 2.8 2.8L7.8 18.4l-4 1.2 1.2-4L16.6 3.9Z" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.8 4.4 4.4L19 7.6" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12h15M13.5 6l6 6-6 6" />
  </Svg>
);

export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 4.5h-8a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8" />
    <path d="M13 12h7.5M17.5 8.5l3.5 3.5-3.5 3.5" />
  </Svg>
);

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20.5 4v4.3h-4.3" />
  </Svg>
);

export const RouteIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="2.6" />
    <circle cx="18" cy="18" r="2.6" />
    <path d="M8.6 6h4.4a3.4 3.4 0 0 1 0 6.8h-2a3.4 3.4 0 0 0 0 5.2h4.4" />
  </Svg>
);
