/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				amoled: '#0a0b0d',
				surface: '#14171c',
				'surface-subtle': '#1c2128',
				'surface-hover': '#232934',
				'maple-red': '#e03131',
				'maple-red-hover': '#c92a2a',
				'amber-star': '#f59e0b',
				'emerald-badge': '#10b981',
			},
			fontFamily: {
				sans: [
					'Inter',
					'-apple-system',
					'BlinkMacSystemFont',
					'"Segoe UI"',
					'Roboto',
					'Helvetica',
					'Arial',
					'sans-serif'
				]
			}
		}
	},
	plugins: []
};
