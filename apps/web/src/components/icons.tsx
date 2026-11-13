import type { SVGProps } from 'react';

/** Small line icons (24×24 grid, current colour), decorative unless given a title by the caller. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width="1em"
      height="1em"
      {...props}
    >
      {children}
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement>;

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5a8.5 8.5 0 1 0 10.6 10.6Z" />
    </Icon>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Icon>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.4 3.8 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.2 0 5.4 2.9 4.2 6.2C19.5 15.4 12 20 12 20Z" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c1.4-3.6 4.4-5.5 8-5.5s6.6 1.9 8 5.5" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3.5h3.2l1.6 4-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2 4 1.6V17a2.5 2.5 0 0 1-2.5 2.5A15.5 15.5 0 0 1 2.5 6 2.5 2.5 0 0 1 5 3.5Z" />
    </Icon>
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4.2 3.5c-.3.3-.8 0-.8-.4V5.5Z" />
    </Icon>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
      <path d="M6 11H5a1 1 0 0 0-1 1v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a1 1 0 0 0-1-1h-1" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Icon>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 21V4m0 0h11l-2 4 2 4H5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function VerifiedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2.5 14.4 4l2.8-.2 1 2.6 2.3 1.6-.8 2.7.8 2.7-2.3 1.6-1 2.6-2.8-.2L12 21.5 9.6 20l-2.8.2-1-2.6-2.3-1.6.8-2.7-.8-2.7 2.3-1.6 1-2.6 2.8.2Z" />
      <path d="m8.5 12 2.4 2.4 4.6-4.8" />
    </Icon>
  );
}

/** Facebook's "f" mark, filled (a share target, so recognisable shape matters). */
export function FacebookIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      width="1em"
      height="1em"
      {...props}
    >
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4V10.5H8v3h2.5V21h3Z" />
    </svg>
  );
}

export function CubeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2.8 20 7.3v9.4l-8 4.5-8-4.5V7.3l8-4.5Z" />
      <path d="M4 7.3l8 4.6 8-4.6M12 11.9v9.3" />
    </Icon>
  );
}

export function DoorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21M3 21h18" />
      <circle cx="15" cy="12.5" r="0.6" fill="currentColor" />
    </Icon>
  );
}

export function AreaIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M8 3.5v3M12 3.5v4.5M16 3.5v3M3.5 8h3M3.5 12h4.5M3.5 16h3" />
    </Icon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Icon>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M3 12h18" />
    </Icon>
  );
}

export function PlanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M3.5 12h7v8.5M10.5 3.5V8M14 12h6.5M14 12v3" />
    </Icon>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15a2 2 0 0 0-1.2-1.2L3.5 12 9 10.2A2 2 0 0 0 10.2 9L12 3.5Z" />
    </Icon>
  );
}
