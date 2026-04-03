/** @type {import('tailwindcss').Config} */
export default {
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Inter', 'system-ui', 'sans-serif']
			},
			colors: {
				seizure: { DEFAULT: '#DC2626', light: '#FEF2F2', dark: 'rgba(220,38,38,0.15)' },
				event: { DEFAULT: '#0D9488', light: '#F0FDFA', dark: 'rgba(13,148,136,0.15)' },
				diary: { DEFAULT: '#6366F1', light: '#EEF2FF', dark: 'rgba(99,102,241,0.15)' },
				medication: { DEFAULT: '#D97706', light: '#FFFBEB', dark: 'rgba(217,119,6,0.15)' },
			}
		}
	},
	plugins: []
};
