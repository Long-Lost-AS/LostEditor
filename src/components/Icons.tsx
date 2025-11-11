interface IconProps {
	className?: string;
	size?: number;
}

// Tab icons
export const MapIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
		<line x1="9" y1="3" x2="9" y2="18" />
		<line x1="15" y1="6" x2="15" y2="21" />
	</svg>
);

export const TilesetIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<rect x="3" y="3" width="7" height="7" />
		<rect x="14" y="3" width="7" height="7" />
		<rect x="3" y="14" width="7" height="7" />
		<rect x="14" y="14" width="7" height="7" />
	</svg>
);

export const EntityIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<rect x="4" y="4" width="16" height="16" rx="2" />
		<circle cx="9" cy="10" r="1" fill="currentColor" />
		<circle cx="15" cy="10" r="1" fill="currentColor" />
		<path d="M9 15h6" />
	</svg>
);

export const PointOfInterestIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<circle cx="12" cy="12" r="4" fill="currentColor" />
		<circle cx="12" cy="12" r="8" />
	</svg>
);

export const FileIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
		<polyline points="13 2 13 9 20 9" />
	</svg>
);

// Drawing tool icons
export const PointerIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
		<path d="M13 13l6 6" />
	</svg>
);

export const PencilIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
	</svg>
);

export const EraserIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M8.5 21h12" />
		<path d="M10 4.5l-5.5 5.5a2 2 0 0 0 0 2.8l4.2 4.2a2 2 0 0 0 2.8 0L17 11.5a2 2 0 0 0 0-2.8L12.8 4.5a2 2 0 0 0-2.8 0z" />
	</svg>
);

export const FillIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M10 2l-7 7a3.5 3.5 0 0 0 0 4.95l4.05 4.05a3.5 3.5 0 0 0 4.95 0l7-7L10 2z" />
		<path d="M11 4l8 8" />
		<path d="M20 15c0 1.1-.9 2-2 2s-2-.9-2-2c0-1 1-2 2-3.5 1 1.5 2 2.5 2 3.5z" />
	</svg>
);

export const RectangleIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
	</svg>
);

// File tree icons
export const FolderIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
	</svg>
);

export const FolderOpenIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
		<path d="M2 13h20" />
	</svg>
);

export const ImageIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
		<circle cx="8.5" cy="8.5" r="1.5" />
		<polyline points="21 15 16 10 5 21" />
	</svg>
);

export const PackageIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
		<polyline points="3.27 6.96 12 12.01 20.73 6.96" />
		<line x1="12" y1="22.08" x2="12" y2="12" />
	</svg>
);

// Other icons
export const ShieldIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
	</svg>
);

export const TrashIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<polyline points="3 6 5 6 21 6" />
		<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
		<line x1="10" y1="11" x2="10" y2="17" />
		<line x1="14" y1="11" x2="14" y2="17" />
	</svg>
);

export const LightbulbIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
		<path d="M9 18h6" />
		<path d="M10 22h4" />
	</svg>
);

export const PlusIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<line x1="12" y1="5" x2="12" y2="19" />
		<line x1="5" y1="12" x2="19" y2="12" />
	</svg>
);

export const PolygonIcon = ({ className, size = 16 }: IconProps) => (
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<polygon points="12 2 22 12 17 22 7 22 2 12" />
	</svg>
);
