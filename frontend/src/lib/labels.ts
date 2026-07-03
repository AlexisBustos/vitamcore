export type LabelColor =
  | 'red' | 'orange' | 'yellow' | 'green' | 'teal'
  | 'blue' | 'purple' | 'pink' | 'gray' | 'brown';

// Clase de fondo/borde/texto por color. Chips sólidos suaves.
export const labelColorClass: Record<LabelColor, string> = {
  red: 'bg-red-100 text-red-800 border-red-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  green: 'bg-green-100 text-green-800 border-green-200',
  teal: 'bg-teal-100 text-teal-800 border-teal-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
  pink: 'bg-pink-100 text-pink-800 border-pink-200',
  gray: 'bg-gray-100 text-gray-800 border-gray-200',
  brown: 'bg-amber-100 text-amber-900 border-amber-200',
};

export const labelColorOptions = (Object.keys(labelColorClass) as LabelColor[]).map((c) => ({
  value: c,
  label: c,
}));
