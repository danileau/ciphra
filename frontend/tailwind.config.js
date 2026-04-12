/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Inter', 'DM Sans', 'system-ui', '-apple-system', 'sans-serif']
			},
			colors: {
				brand: {
					DEFAULT: '#b23c2c',
					primary: '#b23c2c',
					hover: '#9a3326',
					light: '#f5e8e6',
					secondary: '#9f630b',
					'secondary-light': '#fdf3e5',
					tertiary: '#7f821b',
					'tertiary-light': '#f4f4e3',
					coral: '#e07360',
				},
				surface: {
					DEFAULT: '#faf8f6',
					warm: '#faf8f6',
					card: '#ffffff',
					muted: '#f3f0ed',
					slate: '#1e293b',
				},
				warm: {
					50: '#faf8f6',
					100: '#f3f0ed',
					200: '#e8e3dd',
					300: '#d4cdc5',
					400: '#97918a',
					500: '#64594e',
					600: '#4a3f35',
					700: '#352c24',
					800: '#231d17',
					900: '#110e0a',
				},
				seizure: { DEFAULT: '#DC2626', light: '#FEF2F2' },
				event: { DEFAULT: '#9f630b', light: '#fdf3e5' },
				diary: { DEFAULT: '#6366F1', light: '#EEF2FF' },
				medication: { DEFAULT: '#D97706', light: '#FFFBEB' },
			},
			borderColor: {
				DEFAULT: '#e8e3dd',
			},
		}
	},
	plugins: []
};
